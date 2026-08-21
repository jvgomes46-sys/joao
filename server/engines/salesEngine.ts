/**
 * SalesEngine - Motor Comercial
 * VGV, preço de venda e absorção — modo Automático (matriz de tipologia)
 * ou Manual, replicando as fórmulas da Planilha Mestre de Viabilidade
 * (Premissas!B42, B44, B60, B61; Tabelas!A72:E76) — Especificação EVTE PRO
 * seção 2.7 e regra 12 da seção 6.
 */

export type ModoPreco = "automatico" | "manual";
export type ModoAbsorcao = "automatico" | "manual";

export interface SalesEngineInput {
  numeroLotes: number;
  areaMediaLote: number; // m² por lote (vem do GeoEngine)

  // Preço — regra 12, seção 6: automático usa matriz de tipologia × (1+ágio); manual usa preço digitado
  modoPreco: ModoPreco;
  precoBaseM2Tipologia?: number; // da Matriz de Tipologia (Config) — obrigatório se automático
  agioPercentual?: number; // fração (ex.: 0.05 = 5%), padrão 0
  precoManualM2?: number; // obrigatório se manual

  // Absorção — mesma alternância automático/manual
  modoAbsorcao: ModoAbsorcao;
  velocidadeAbsorcaoPadrao?: number; // fração de lotes/mês da Matriz de Tipologia — obrigatório se automático
  absorcaoManualLotesMes?: number; // obrigatório se manual

  // Deduções sobre venda (frações 0-1)
  comissaoPercentual: number;
  marketingPercentual: number;
  impostosPercentual: number;
  inadimplenciaPercentual: number;
  despesasAdministrativasPercentual: number;
}

export interface SalesEngineOutput {
  precoM2: number;
  precoBrutoPorLote: number;
  vgvTotal: number;
  absorcaoLotesMes: number;
  prazoVendasMeses: number;
  percentualDeducoesVenda: number;
  deducoesTotalReais: number;
}

export function calcularSalesEngine(input: SalesEngineInput): SalesEngineOutput {
  let precoM2: number;
  if (input.modoPreco === "automatico") {
    if (!input.precoBaseM2Tipologia || input.precoBaseM2Tipologia <= 0) {
      throw new Error("Modo Automático de preço requer precoBaseM2Tipologia (m²) > 0 vindo da Matriz de Tipologia");
    }
    precoM2 = Math.round(input.precoBaseM2Tipologia * (1 + (input.agioPercentual ?? 0)) * 100) / 100;
  } else {
    if (!input.precoManualM2 || input.precoManualM2 <= 0) {
      throw new Error("Modo Manual de preço requer precoManualM2 (R$/m²) > 0");
    }
    precoM2 = input.precoManualM2;
  }

  const precoBrutoPorLote = precoM2 * input.areaMediaLote;
  const vgvTotal = input.numeroLotes * precoBrutoPorLote;

  let absorcaoLotesMes: number;
  if (input.modoAbsorcao === "automatico") {
    if (!input.velocidadeAbsorcaoPadrao || input.velocidadeAbsorcaoPadrao <= 0) {
      throw new Error("Modo Automático de absorção requer velocidadeAbsorcaoPadrao (fração 0-1) > 0 vindo da Matriz de Tipologia");
    }
    absorcaoLotesMes = Math.max(1, Math.round(input.numeroLotes * input.velocidadeAbsorcaoPadrao));
  } else {
    if (!input.absorcaoManualLotesMes || input.absorcaoManualLotesMes <= 0) {
      throw new Error("Modo Manual de absorção requer absorcaoManualLotesMes > 0");
    }
    absorcaoLotesMes = input.absorcaoManualLotesMes;
  }

  const prazoVendasMeses = Math.ceil(input.numeroLotes / absorcaoLotesMes);

  const percentualDeducoesVenda =
    input.comissaoPercentual +
    input.marketingPercentual +
    input.impostosPercentual +
    input.inadimplenciaPercentual +
    input.despesasAdministrativasPercentual;

  const deducoesTotalReais = vgvTotal * percentualDeducoesVenda;

  return {
    precoM2,
    precoBrutoPorLote,
    vgvTotal,
    absorcaoLotesMes,
    prazoVendasMeses,
    percentualDeducoesVenda,
    deducoesTotalReais,
  };
}
