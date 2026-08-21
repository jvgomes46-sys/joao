import { getMergedUnitCosts, getCostParameter, createConfigSnapshot, extrairUfDaLocalizacao } from "../config";
import { getGeoEngineDataByProjectId, getProjectById, upsertCostEngineData } from "../db";
import { calcularCostEngine, CostEngineInput, CostEngineOutput, UnitCostTable } from "../engines/costEngine";

export type CostEngineTechnicalInput = Omit<
  CostEngineInput,
  "areaBruta" | "numeroLotes" | "sistemaViarioM2" | "areaCalcadasM2" | "areaVerdeM2" | "densidadeHabHa" | "dispensaRedeColetora" | "perimetroGlebaM"
> & {
  perimetroGlebaM?: number; // opcional aqui — se omitido, estimado a partir da área bruta (fallback grosseiro)
  contingenciaPercentual?: number;
  custoFinanceiroPercentual?: number;
  custoAprovacoesTotal?: number;
  vgvTotal?: number;
  regiao?: string; // padrão: UF detectada da localização do projeto, senão "Nacional"
};

/**
 * Orquestra o cálculo do CostEngine para um projeto:
 * 1. Exige que o GeoEngine já tenha rodado (não recalcula geometria aqui —
 *    consome a área/lotes/densidade já persistidos).
 * 2. Resolve a tabela de custos unitários vigente e o BDI a partir do
 *    Módulo de Configuração — nunca hardcoded.
 * 3. Roda o cálculo puro (`calcularCostEngine`) com toda a lógica
 *    condicional da seção 6.
 * 4. Persiste o resultado (totais por grupo + detalhamento item a item) em
 *    `cost_engine_data`.
 * 5. Grava snapshot imutável da configuração usada (seção 5.3) — obrigatório.
 */
export async function runCostEngine(
  projectId: number,
  userId: number,
  input: CostEngineTechnicalInput
): Promise<CostEngineOutput> {
  const project = await getProjectById(projectId, userId);
  if (!project) {
    throw new Error("Projeto não encontrado ou não pertence ao usuário");
  }

  const geo = await getGeoEngineDataByProjectId(projectId);
  if (!geo) {
    throw new Error(
      "CostEngine depende do GeoEngine — calcule o GeoEngine deste projeto antes (área, número de lotes e densidade vêm de lá)"
    );
  }
  if (geo.numeroLotes === null || geo.areaBruta === null || geo.sistemaViario === null || geo.densidade === null) {
    throw new Error("Resultado do GeoEngine incompleto para este projeto — recalcule o GeoEngine");
  }

  const regiao = input.regiao ?? extrairUfDaLocalizacao(project.location) ?? "Nacional";
  const { regiao: _regiao, contingenciaPercentual, custoFinanceiroPercentual, custoAprovacoesTotal, vgvTotal, ...technicalInput } = input;

  const unitCostRows = await getMergedUnitCosts(regiao);
  if (unitCostRows.length === 0) {
    throw new Error(`Nenhum custo unitário cadastrado na Configuração para a região "${regiao}" — rode o seed ou cadastre os custos`);
  }
  const custos: UnitCostTable = {};
  for (const row of unitCostRows) {
    custos[row.itemCodigo] = Number(row.valorUnitario);
  }

  // BDI é hoje um parâmetro nacional único na Configuração (seed); regiões
  // específicas podem futuramente ter sua própria linha em config_cost_parameters.
  const bdiParam = await getCostParameter("bdi_infraestrutura", "Nacional");

  const indicesUrbanisticos = geo.indicesUrbanisticos as { percentualCalcadas?: number } | null;
  const areaParcelavel = Number(geo.areaLiquida ?? geo.areaBruta);
  const areaCalcadasM2 = ((indicesUrbanisticos?.percentualCalcadas ?? 0) / 100) * areaParcelavel;

  const costInput: CostEngineInput = {
    ...technicalInput,
    areaBruta: Number(geo.areaBruta),
    numeroLotes: geo.numeroLotes,
    sistemaViarioM2: Number(geo.sistemaViario),
    areaCalcadasM2,
    areaVerdeM2: Number(geo.areaVerde ?? 0),
    perimetroGlebaM: technicalInput.perimetroGlebaM ?? estimarPerimetroQuadrado(Number(geo.areaBruta)),
    densidadeHabHa: Number(geo.densidade),
    dispensaRedeColetora: Number(geo.densidade) < 20,
  };

  const output = calcularCostEngine(costInput, custos, {
    bdiPercentual: Number(bdiParam.valor),
    contingenciaPercentual,
    custoFinanceiroPercentual,
    custoAprovacoesTotal,
    vgvTotal,
  });

  await upsertCostEngineData(projectId, {
    terraplanagem: String(output.totaisPorGrupo["terraplenagem"] ?? 0),
    drenagem: String(output.totaisPorGrupo["drenagem"] ?? 0),
    pavimentacao: String(output.totaisPorGrupo["pavimentacao"] ?? 0),
    agua: String(output.totaisPorGrupo["agua"] ?? 0),
    esgoto: String(output.totaisPorGrupo["esgoto"] ?? 0),
    energia: String(output.totaisPorGrupo["energia"] ?? 0),
    paisagismo: String(output.totaisPorGrupo["servicos_complementares"] ?? 0),
    portaria: String(output.totaisPorGrupo["obras_civis_condominio"] ?? 0),
    areaLazer: null,
    licenciamento: null,
    registro: null,
    cartorio: null,
    custosIndiretos: String(output.bdiValor),
    contingencias: String(output.contingenciaValor),
    investimentoTotal: String(output.capexTotal),
    valorPorHectare: String(costInput.areaBruta > 0 ? (output.capexTotal / costInput.areaBruta) * 10_000 : 0),
    valorPorM2: String(output.custoPorM2Gleba),
    valorPorLote: String(output.custoPorLote),
    detalhamentoItens: output.itens,
  });

  await createConfigSnapshot({
    projectId,
    engine: "cost_engine",
    snapshotData: {
      regiao,
      bdiPercentual: Number(bdiParam.valor),
      custosUnitarios: custos,
    },
    overrides: {
      contingenciaPercentual,
      custoFinanceiroPercentual,
      custoAprovacoesTotal,
    },
  });

  return output;
}

/** Estimativa de perímetro para um lote quadrado — usado só como fallback quando o perímetro real não é informado. */
function estimarPerimetroQuadrado(areaM2: number): number {
  return 4 * Math.sqrt(areaM2);
}
