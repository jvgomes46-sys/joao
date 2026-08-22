import { createConfigSnapshot, getCostParameters, getTypologyMatrixEntry } from "../config";
import { getGeoEngineDataByProjectId, getProjectById, upsertSalesEngineData } from "../db";
import { calcularSalesEngine, ModoAbsorcao, ModoPreco, SalesEngineOutput } from "../engines/salesEngine";
import { ConfigTypologyMatrix } from "../../drizzle/schema";

export interface SalesEngineServiceInput {
  tipologia: ConfigTypologyMatrix["tipologia"];

  modoPreco: ModoPreco;
  agioPercentual?: number;
  precoManualM2?: number;

  modoAbsorcao: ModoAbsorcao;
  absorcaoManualLotesMes?: number;

  // Deduções sobre a venda (fração 0-1). Omitidas = valores vigentes da
  // Configuração; informadas = premissa comercial deste projeto.
  comissaoPercentual?: number;
  marketingPercentual?: number;
  impostosPercentual?: number;
  inadimplenciaPercentual?: number;
  despesasAdministrativasPercentual?: number;

  regiao?: string; // padrão: "Nacional" — deve casar com a região cadastrada na Matriz de Tipologia
}

/**
 * Orquestra o cálculo do SalesEngine para um projeto:
 * 1. Exige o GeoEngine já calculado (número de lotes e área média por lote
 *    vêm de lá — área média é resultado no modo Manual de lotes, input no
 *    modo Automático, mas sempre disponível em `geo_engine_data`).
 * 2. Resolve a Matriz de Tipologia vigente do Módulo de Configuração
 *    (preço base R$/m² e velocidade de absorção padrão) quando os modos
 *    automáticos estiverem ativos.
 * 3. Roda o cálculo puro (`calcularSalesEngine`).
 * 4. Persiste o resultado em `sales_engine_data`.
 * 5. Grava snapshot imutável da configuração usada (seção 5.3).
 */
export async function runSalesEngine(projectId: number, userId: number, input: SalesEngineServiceInput): Promise<SalesEngineOutput> {
  const project = await getProjectById(projectId, userId);
  if (!project) {
    throw new Error("Projeto não encontrado ou não pertence ao usuário");
  }

  const geo = await getGeoEngineDataByProjectId(projectId);
  if (!geo || geo.numeroLotes === null) {
    throw new Error("SalesEngine depende do GeoEngine — calcule o GeoEngine deste projeto antes (número de lotes e área média vêm de lá)");
  }

  const indicesUrbanisticos = geo.indicesUrbanisticos as { areaMediaLote?: number } | null;
  const areaMediaLote = indicesUrbanisticos?.areaMediaLote;
  if (!areaMediaLote || areaMediaLote <= 0) {
    throw new Error("Resultado do GeoEngine incompleto para este projeto (área média do lote ausente) — recalcule o GeoEngine");
  }

  const regiao = input.regiao ?? "Nacional";
  let typologyEntry: Awaited<ReturnType<typeof getTypologyMatrixEntry>> | null = null;
  if (input.modoPreco === "automatico" || input.modoAbsorcao === "automatico") {
    typologyEntry = await getTypologyMatrixEntry(input.tipologia, regiao);
  }

  // Deduções: omitidas = valores vigentes da Configuração. Guardados lá como
  // percentual 0-100; os motores usam fração, então converte aqui.
  const cfgVenda = await getCostParameters(
    [
      "venda_comissao_percentual",
      "venda_marketing_percentual",
      "venda_impostos_percentual",
      "venda_inadimplencia_percentual",
      "venda_despesas_administrativas_percentual",
    ],
    "Nacional"
  );
  const deducoes = {
    comissaoPercentual: input.comissaoPercentual ?? cfgVenda["venda_comissao_percentual"] / 100,
    marketingPercentual: input.marketingPercentual ?? cfgVenda["venda_marketing_percentual"] / 100,
    impostosPercentual: input.impostosPercentual ?? cfgVenda["venda_impostos_percentual"] / 100,
    inadimplenciaPercentual: input.inadimplenciaPercentual ?? cfgVenda["venda_inadimplencia_percentual"] / 100,
    despesasAdministrativasPercentual:
      input.despesasAdministrativasPercentual ?? cfgVenda["venda_despesas_administrativas_percentual"] / 100,
  };

  const output = calcularSalesEngine({
    numeroLotes: geo.numeroLotes,
    areaMediaLote,
    modoPreco: input.modoPreco,
    precoBaseM2Tipologia: typologyEntry ? Number(typologyEntry.precoBaseM2) : undefined,
    agioPercentual: input.agioPercentual,
    precoManualM2: input.precoManualM2,
    modoAbsorcao: input.modoAbsorcao,
    velocidadeAbsorcaoPadrao: typologyEntry?.velocidadeAbsorcaoPadrao ? Number(typologyEntry.velocidadeAbsorcaoPadrao) : undefined,
    absorcaoManualLotesMes: input.absorcaoManualLotesMes,
    ...deducoes,
  });

  await upsertSalesEngineData(projectId, {
    vgv: String(output.vgvTotal),
    precoMedioM2: String(output.precoM2),
    curvaVendas: {
      precoBrutoPorLote: output.precoBrutoPorLote,
      absorcaoLotesMes: output.absorcaoLotesMes,
      prazoVendasMeses: output.prazoVendasMeses,
      modoPreco: input.modoPreco,
      modoAbsorcao: input.modoAbsorcao,
    },
    inadimplencia: String(deducoes.inadimplenciaPercentual * 100),
    custoVendas: String(output.deducoesTotalReais),
  });

  await createConfigSnapshot({
    projectId,
    engine: "sales_engine",
    snapshotData: {
      regiao,
      tipologia: input.tipologia,
      precoBaseM2Tipologia: typologyEntry ? Number(typologyEntry.precoBaseM2) : null,
      velocidadeAbsorcaoPadrao: typologyEntry?.velocidadeAbsorcaoPadrao ? Number(typologyEntry.velocidadeAbsorcaoPadrao) : null,
      deducoes,
    },
    overrides: {
      modoPreco: input.modoPreco,
      modoAbsorcao: input.modoAbsorcao,
      precoManualM2: input.precoManualM2,
      absorcaoManualLotesMes: input.absorcaoManualLotesMes,
    },
  });

  return output;
}
