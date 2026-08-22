import { createConfigSnapshot, getFinancialIndex, getInicioVendasMesPadrao, getPrazoAprovacao, getPrazoObraPorPorte } from "../config";
import { getCostEngineDataByProjectId, getGeoEngineDataByProjectId, getProjectById, upsertFinanceEngineData } from "../db";
import { calcularFinanceEngine, CurvaObra, CurvaVendas, FinanceEngineInput, FinanceEngineOutput } from "../engines/financeEngine";

export interface FinanceEngineServiceInput {
  // Cronograma (Premissas — módulo 2.1)
  /**
   * Duração das aprovações em meses. Se omitido, é derivado da Configuração:
   * prazo base + adicionais por gatilho (ETE própria, supressão vegetal,
   * condomínio fechado), lidos das premissas técnicas do CostEngine.
   */
  duracaoAprovacoesMeses?: number;
  /**
   * Mês de início das vendas. Se omitido, usa o padrão da Configuração.
   * NÃO é derivado do prazo de aprovações de propósito: pré-lançamento
   * durante o licenciamento é prática normal (na planilha mestre as vendas
   * começam no mês 6 com aprovações de 18 meses).
   */
  inicioVendasMes?: number;

  // Comercial
  precoBrutoPorLote: number; // R$ — do SalesEngine (VGV/lotes ou preço médio × área)
  prazoVendasMeses: number;
  curvaVendas: CurvaVendas;

  // Deduções e parcelamento
  percentualDeducoesVenda: number; // fração 0-1
  percentualEntrada: number;
  numeroParcelas: number;

  // Financeiro
  tmaAnualFracao: number;
  reinvestirCaixaPositivo?: boolean;

  // Indexação — se omitido, usa os índices vigentes do Módulo de Configuração (INCC/IPCA)
  custosIndexados?: boolean;
  indiceCustosAnualFracao?: number;
  recebiveisIndexados?: boolean;
  indiceRecebiveisAnualFracao?: number;

  // Aprovações — módulo 2.5 calcula automaticamente; este é override manual
  capexAprovacoesTotal?: number;
  curvaObra?: CurvaObra; // padrão: "curva_s"

  horizonteMeses?: number;
}

const GRUPOS_COST_ENGINE_PARA_FLUXO = [
  "terraplanagem",
  "drenagem",
  "pavimentacao",
  "agua",
  "esgoto",
  "energia",
  "paisagismo", // = servicos_complementares no CostEngine
  "portaria", // = obras_civis_condominio no CostEngine
] as const;

const MAPA_CAMPO_PARA_GRUPO_JANELA: Record<(typeof GRUPOS_COST_ENGINE_PARA_FLUXO)[number], string> = {
  terraplanagem: "terraplenagem",
  drenagem: "drenagem",
  pavimentacao: "pavimentacao",
  agua: "agua",
  esgoto: "esgoto",
  energia: "energia",
  paisagismo: "servicos_complementares",
  portaria: "obras_civis_condominio",
};

export interface FinanceEngineBaseBuild {
  financeInput: FinanceEngineInput;
  bdiPercentualImplicito: number;
  indiceCustosAnualFracao: number | undefined;
  indiceRecebiveisAnualFracao: number | undefined;
  /** Composição do prazo de aprovações derivado da Configuração (base + adicionais por gatilho). */
  prazoAprovacao: { prazoBaseMeses: number; adicionaisAplicados: { gatilho: string; meses: number }[]; prazoTotalMeses: number };
  /** Mês padrão de início das vendas vindo da Configuração (antes de qualquer override). */
  inicioVendasMesPadrao: number;
}

/**
 * Reconstrói o FinanceEngineInput completo a partir do que já está
 * persistido (GeoEngine + CostEngine) mais os parâmetros financeiros
 * explícitos do chamador. Compartilhado entre runFinanceEngine e o
 * ScenarioEngine (que roda o mesmo FinanceEngine várias vezes com preço/
 * prazo/CAPEX variados) — nunca duplicar essa reconstrução.
 */
export async function buildFinanceEngineInput(projectId: number, input: FinanceEngineServiceInput): Promise<FinanceEngineBaseBuild> {
  const geo = await getGeoEngineDataByProjectId(projectId);
  if (!geo || geo.numeroLotes === null) {
    throw new Error("FinanceEngine depende do GeoEngine — calcule o GeoEngine deste projeto antes (número de lotes vem de lá)");
  }

  const cost = await getCostEngineDataByProjectId(projectId);
  if (!cost || cost.investimentoTotal === null) {
    throw new Error("FinanceEngine depende do CostEngine — calcule o CostEngine deste projeto antes (CAPEX e cronograma de obra vêm de lá)");
  }
  if (cost.custosIndiretos === null) {
    throw new Error("Resultado do CostEngine incompleto para este projeto (BDI ausente) — recalcule o CostEngine");
  }

  const capexTotal = Number(cost.investimentoTotal);
  const custoAprovacoesCalculado = Number(
    (cost.detalhamentoAprovacoes as { custoAprovacoesTotal?: number } | null)?.custoAprovacoesTotal ?? 0
  );
  const subtotalInfraSemBDI = GRUPOS_COST_ENGINE_PARA_FLUXO.reduce((s, campo) => s + Number(cost[campo] ?? 0), 0);
  const bdiPercentualImplicito = subtotalInfraSemBDI > 0 ? Number(cost.custosIndiretos) / subtotalInfraSemBDI : 0;

  const gruposCustoObra: Record<string, number> = {};
  for (const campo of GRUPOS_COST_ENGINE_PARA_FLUXO) {
    const valor = Number(cost[campo] ?? 0);
    if (valor > 0) {
      // Escala para "com BDI", igual ao Orçamento!F6 etc. da planilha mestre (BDI aplicado por item, já embutido no total do grupo)
      gruposCustoObra[MAPA_CAMPO_PARA_GRUPO_JANELA[campo]] = valor * (1 + bdiPercentualImplicito);
    }
  }

  let indiceCustosAnualFracao = input.indiceCustosAnualFracao;
  let indiceRecebiveisAnualFracao = input.indiceRecebiveisAnualFracao;
  if (input.custosIndexados && indiceCustosAnualFracao === undefined) {
    const incc = await getFinancialIndex("incc");
    indiceCustosAnualFracao = Number(incc.valor) / 100;
  }
  if (input.recebiveisIndexados && indiceRecebiveisAnualFracao === undefined) {
    const ipca = await getFinancialIndex("ipca");
    indiceRecebiveisAnualFracao = Number(ipca.valor) / 100;
  }

  if (geo.areaBruta === null) {
    throw new Error("Resultado do GeoEngine incompleto para este projeto (área bruta ausente) — recalcule o GeoEngine");
  }
  const prazoObra = await getPrazoObraPorPorte(Number(geo.areaBruta));
  const duracaoObraMeses = prazoObra.prazoMeses;

  // Prazo de aprovações: se não vier explícito, deriva da Configuração —
  // prazo base + adicionais por gatilho, lidos das premissas técnicas que o
  // CostEngine persistiu (ETE própria, supressão vegetal, condomínio fechado).
  const premissas = cost.premissasTecnicas as
    | { solucaoEsgoto?: string; areaSupressaoVegetalM2?: number; tipologia?: string }
    | null;
  const gatilhosAprovacao: string[] = [];
  if (premissas?.solucaoEsgoto === "ete_propria") gatilhosAprovacao.push("ete_propria");
  if ((premissas?.areaSupressaoVegetalM2 ?? 0) > 0) gatilhosAprovacao.push("supressao_vegetal");
  if (premissas?.tipologia === "condominio_fechado") gatilhosAprovacao.push("condominio_fechado");

  const prazoAprovacao = await getPrazoAprovacao(gatilhosAprovacao);
  const duracaoAprovacoesMeses = input.duracaoAprovacoesMeses ?? prazoAprovacao.prazoTotalMeses;
  const inicioVendasMesPadrao = await getInicioVendasMesPadrao();
  const inicioVendasMes = input.inicioVendasMes ?? inicioVendasMesPadrao;

  const financeInput: FinanceEngineInput = {
    horizonteMeses: input.horizonteMeses,
    duracaoAprovacoesMeses,
    duracaoObraMeses,
    inicioVendasMes,
    numeroLotes: geo.numeroLotes,
    precoBrutoPorLote: input.precoBrutoPorLote,
    prazoVendasMeses: input.prazoVendasMeses,
    curvaVendas: input.curvaVendas,
    percentualDeducoesVenda: input.percentualDeducoesVenda,
    percentualEntrada: input.percentualEntrada,
    numeroParcelas: input.numeroParcelas,
    tmaAnualFracao: input.tmaAnualFracao,
    reinvestirCaixaPositivo: input.reinvestirCaixaPositivo,
    custosIndexados: input.custosIndexados,
    indiceCustosAnualFracao,
    recebiveisIndexados: input.recebiveisIndexados,
    indiceRecebiveisAnualFracao,
    // Módulo 2.5 — reaproveita o custo de aprovações que o CostEngine já
    // calculou e persistiu, em vez de exigir que seja digitado de novo aqui.
    // O override explícito continua tendo precedência.
    capexAprovacoesTotal: input.capexAprovacoesTotal ?? custoAprovacoesCalculado,
    curvaObra: input.curvaObra ?? "curva_s",
    gruposCustoObra,
    capexTotal,
  };

  return { financeInput, bdiPercentualImplicito, indiceCustosAnualFracao, indiceRecebiveisAnualFracao, prazoAprovacao, inicioVendasMesPadrao };
}

/**
 * Orquestra o cálculo do FinanceEngine para um projeto:
 * 1. Exige GeoEngine e CostEngine já calculados (fluxo de caixa não existe
 *    sem quantidade de lotes e sem orçamento de obra).
 * 2. Reconstrói os totais por grupo do CostEngine (escalados para incluir o
 *    BDI, já que `cost_engine_data` grava os totais pré-BDI) para alimentar
 *    a curva física de desembolso por disciplina.
 * 3. Se a indexação não vier explícita, usa os índices INCC/IPCA vigentes
 *    do Módulo de Configuração.
 * 4. Roda o cálculo puro (`calcularFinanceEngine`) — fluxo de 120 meses,
 *    VPL/TIR/payback/exposição, alertas de consistência.
 * 5. Persiste o resultado (indicadores + fluxo mensal completo) e grava o
 *    snapshot de configuração obrigatório (seção 5.3).
 */
export async function runFinanceEngine(projectId: number, userId: number, input: FinanceEngineServiceInput): Promise<FinanceEngineOutput> {
  const project = await getProjectById(projectId, userId);
  if (!project) {
    throw new Error("Projeto não encontrado ou não pertence ao usuário");
  }

  const { financeInput, bdiPercentualImplicito, indiceCustosAnualFracao, indiceRecebiveisAnualFracao, prazoAprovacao, inicioVendasMesPadrao } =
    await buildFinanceEngineInput(projectId, input);

  const output = calcularFinanceEngine(financeInput);

  await upsertFinanceEngineData(projectId, {
    vpl: String(output.vpl),
    tir: output.tirAnual !== null ? String(output.tirAnual) : null,
    tirMensal: output.tirMensal !== null ? String(output.tirMensal) : null,
    tirIndisponivelMotivo: output.tirIndisponivelMotivo,
    roi: String(output.roiSobreCapex),
    payback: output.paybackMes !== null ? String(output.paybackMes) : null,
    exposicaoMaximaCaixa: String(output.exposicaoMaximaCaixa),
    lucroTotal: String(output.resultadoNominal),
    margemLucro: String(output.margemSobreReceitaRealizada),
    tmaUtilizada: String(input.tmaAnualFracao),
    fluxoCaixaMensal: output.fluxoMensal,
    alertasConsistencia: output.alertas,
  });

  await createConfigSnapshot({
    projectId,
    engine: "finance_engine",
    snapshotData: {
      indiceCustosAnualFracao: indiceCustosAnualFracao ?? null,
      indiceRecebiveisAnualFracao: indiceRecebiveisAnualFracao ?? null,
      bdiPercentualImplicito,
      prazoAprovacao,
      duracaoObraMeses: financeInput.duracaoObraMeses,
      inicioVendasMesPadrao,
    },
    overrides: {
      capexAprovacoesTotal: input.capexAprovacoesTotal,
      duracaoAprovacoesMeses: input.duracaoAprovacoesMeses,
      inicioVendasMes: input.inicioVendasMes,
      curvaObra: input.curvaObra,
    },
  });

  return output;
}
