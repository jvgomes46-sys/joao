import { getLegislationForLocation } from "../config";
import { getProjectById, upsertGeoEngineData } from "../db";
import { calcularGeoEngine, GeoEngineInput, GeoEngineOutput } from "../engines/geoEngine";
import { createConfigSnapshot } from "../config";

/**
 * Orquestra o cálculo do GeoEngine para um projeto:
 * 1. Resolve os pisos de conformidade (legislação municipal ou piso federal)
 *    a partir do Módulo de Configuração — nunca hardcoded no motor de cálculo.
 * 2. Roda o cálculo puro (`calcularGeoEngine`).
 * 3. Persiste o resultado em `geo_engine_data`.
 * 4. Grava um snapshot imutável da configuração usada (seção 5.3 da spec) —
 *    passo obrigatório, não opcional: se falhar, o cálculo inteiro falha.
 */
export async function runGeoEngine(
  projectId: number,
  userId: number,
  input: GeoEngineInput
): Promise<GeoEngineOutput> {
  const project = await getProjectById(projectId, userId);
  if (!project) {
    throw new Error("Projeto não encontrado ou não pertence ao usuário");
  }

  const legislation = await getLegislationForLocation(project.location ?? "");

  // Pisos legais: legislação do município cadastrado; se o município não
  // estiver cadastrado, cai no piso federal da Lei 6.766/79 (com aviso).
  const pisoVerde = input.pisoPercentualVerdeMin ?? Number(legislation.percentualAreaVerdeMin ?? 15);
  const pisoInstitucional = input.pisoPercentualInstitucionalMin ?? Number(legislation.percentualAreaInstitucionalMin ?? 5);
  const pisoSistemaViario = input.pisoPercentualSistemaViarioMin ?? Number(legislation.percentualSistemaViarioMin ?? 20);

  // Percentuais de PROJETO: se não forem informados, o estudo é desenhado no
  // piso legal do local — não num 15/5/20 chumbado. Informar um valor
  // continua valendo (um empreendimento pode querer mais área verde que o
  // mínimo, por exemplo); se o valor informado ficar ABAIXO do piso, o
  // próprio motor emite o alerta de não conformidade.
  const percentuaisSeguemLegislacao = {
    verde: input.percentualVerde === undefined,
    institucional: input.percentualInstitucional === undefined,
    sistemaViario: input.percentualSistemaViario === undefined,
  };

  const inputComPisos: GeoEngineInput = {
    ...input,
    percentualVerde: input.percentualVerde ?? pisoVerde,
    percentualInstitucional: input.percentualInstitucional ?? pisoInstitucional,
    percentualSistemaViario: input.percentualSistemaViario ?? pisoSistemaViario,
    pisoPercentualVerdeMin: pisoVerde,
    pisoPercentualInstitucionalMin: pisoInstitucional,
    pisoPercentualSistemaViarioMin: pisoSistemaViario,
    pisoAreaMinimaLote: input.pisoAreaMinimaLote ?? Number(legislation.areaMinimaLote ?? 125),
  };

  const output = calcularGeoEngine(inputComPisos);

  await upsertGeoEngineData(projectId, {
    areaBruta: String(output.areaBruta),
    areaLiquida: String(output.areaParcelavel),
    areaVendavel: String(output.areaVendavel),
    areaInstitucional: String(output.areaInstitucional),
    areaVerde: String(output.areaVerde),
    areaAPP: String(output.areaAPP),
    sistemaViario: String(output.sistemaViario),
    eficienciaUrbanistica: String((output.areaVendavel / output.areaBruta) * 100),
    numeroLotes: output.numeroLotes,
    potencialConstrutivo: String(output.potencialConstrutivo),
    densidade: String(output.densidadeHabHa),
    indicesUrbanisticos: {
      percentualVerde: output.percentualVerde,
      percentualInstitucional: output.percentualInstitucional,
      percentualSistemaViario: output.percentualSistemaViario,
      percentualCalcadas: output.percentualCalcadas,
      coeficienteAproveitamento: output.coeficienteAproveitamento,
      taxaOcupacao: output.taxaOcupacao,
      modoLotes: output.modoLotes,
      areaMediaLote: output.areaMediaLote,
      dispensaRedeColetora: output.dispensaRedeColetora,
      conformidadeLei6766: output.conformidadeLei6766,
      alertasConformidade: output.alertasConformidade,
      pisosAplicados: output.pisosAplicados,
      origemPercentuais: {
        fonte: legislation.usedFederalFallback ? "piso_federal" : "legislacao_municipal",
        municipio: legislation.municipio,
        verde: percentuaisSeguemLegislacao.verde ? "legislacao" : "manual",
        institucional: percentuaisSeguemLegislacao.institucional ? "legislacao" : "manual",
        sistemaViario: percentuaisSeguemLegislacao.sistemaViario ? "legislacao" : "manual",
      },
    },
    checklistGRAProhab: output.checklistGRAPROHAB,
  });

  await createConfigSnapshot({
    projectId,
    engine: "geo_engine",
    snapshotData: {
      legislationSource: legislation.usedFederalFallback ? "piso_federal" : "municipio_cadastrado",
      municipio: legislation.municipio,
      percentualAreaVerdeMin: Number(legislation.percentualAreaVerdeMin ?? 15),
      percentualAreaInstitucionalMin: Number(legislation.percentualAreaInstitucionalMin ?? 5),
      percentualSistemaViarioMin: pisoSistemaViario,
      percentuaisSeguemLegislacao,
      areaMinimaLote: Number(legislation.areaMinimaLote ?? 125),
      frenteMinimaLote: Number(legislation.frenteMinimaLote ?? 5),
    },
    overrides:
      input.pisoPercentualVerdeMin !== undefined || input.pisoPercentualInstitucionalMin !== undefined
        ? {
            pisoPercentualVerdeMin: input.pisoPercentualVerdeMin,
            pisoPercentualInstitucionalMin: input.pisoPercentualInstitucionalMin,
          }
        : undefined,
  });

  return output;
}
