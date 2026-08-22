/**
 * FinanceEngine - Fluxo de Caixa e Indicadores Financeiros
 * Réplica fiel da aba "Fluxo de Caixa" da Planilha Mestre de Viabilidade
 * (horizonte de 120 meses), incluindo curva de vendas, parcelamento de
 * recebíveis, indexação de custos/receitas, curva física de obra e os
 * indicadores/alertas que a planilha já calcula (Especificação EVTE PRO,
 * seção 2.8).
 */

export type CurvaVendas = "constante" | "rampa" | "curva_s";
export type CurvaObra = "linear" | "curva_s";

export const HORIZONTE_PADRAO_MESES = 120;

/**
 * Janelas padrão (% do prazo de obra) por disciplina.
 *
 * Calibradas a partir do cronograma REAL do orçamento "Residencial Mirante"
 * (Formosa/GO) — aba CRONOGRAMA, datas de início/fim de cada etapa
 * normalizadas sobre a duração total da obra (31/03/2026 a 31/12/2027,
 * 640 dias). "energia" e "esgoto" usam a janela de "REDE DE DISTRIBUIÇÃO
 * URBANÍSTICA"/"REDE DE ESGOTO SANITÁRIO" respectivamente, já que o
 * cronograma de referência não separa energia da rede geral. Substituem os
 * valores anteriores, que vinham de suposições genéricas da Planilha Mestre
 * de Viabilidade (mantidos explicitamente no teste de fixture que valida
 * contra aquele cenário — ver `financeEngine.spreadsheet.test.ts`).
 */
export const JANELAS_OBRA_PADRAO: Record<string, { inicio: number; fim: number }> = {
  terraplenagem: { inicio: 0.07, fim: 0.21 },
  drenagem: { inicio: 0.04, fim: 0.32 },
  agua: { inicio: 0.2, fim: 0.38 },
  energia: { inicio: 0.24, fim: 0.38 },
  pavimentacao: { inicio: 0.2, fim: 0.48 },
  servicos_complementares: { inicio: 0.48, fim: 0.76 },
  esgoto: { inicio: 0.24, fim: 0.38 },
  obras_civis_condominio: { inicio: 0.11, fim: 1.0 },
};

export interface FinanceEngineInput {
  horizonteMeses?: number; // padrão 120

  // Cronograma
  inicioAprovacoesMes?: number; // padrão 1
  duracaoAprovacoesMeses: number;
  duracaoObraMeses: number;
  inicioVendasMes: number;

  // Comercial
  numeroLotes: number;
  precoBrutoPorLote: number; // R$ — preço médio × área média (ou VGV/lotes)
  prazoVendasMeses: number;
  curvaVendas: CurvaVendas;

  // Deduções e parcelamento de recebíveis
  percentualDeducoesVenda: number; // soma comissão+marketing+impostos+inadimplência+adm (fração 0-1)
  percentualEntrada: number; // fração 0-1
  numeroParcelas: number;

  // Financeiro
  tmaAnualFracao: number; // fração (ex.: 0.14 para 14% a.a.)
  reinvestirCaixaPositivo?: boolean;

  // Indexação
  custosIndexados?: boolean;
  indiceCustosAnualFracao?: number;
  recebiveisIndexados?: boolean;
  indiceRecebiveisAnualFracao?: number;

  // Custos (do CostEngine)
  capexAprovacoesTotal: number;
  curvaObra: CurvaObra;
  gruposCustoObra: Partial<Record<string, number>>; // totais por grupo do CostEngine (sem aprovações), chaves de JANELAS_OBRA_PADRAO
  capexTotal: number; // CAPEX total (para indicadores e alerta de exposição/CAPEX)

  /** Override das janelas por disciplina — se omitido, usa JANELAS_OBRA_PADRAO (calibrado com dados reais). */
  janelasObraPorDisciplina?: Record<string, { inicio: number; fim: number }>;
}

export interface FinanceMonthRow {
  mes: number;
  lotesVendidos: number;
  lotesAcumulados: number;
  receitaBruta: number;
  deducoesVenda: number;
  receitaLiquida: number;
  custoAprovacoes: number;
  custoObra: number;
  jurosReinvestimento: number;
  fluxoLiquido: number;
  fluxoAcumulado: number;
}

export interface FinanceEngineOutput {
  fluxoMensal: FinanceMonthRow[];

  receitaBrutaTotal: number;
  deducoesTotal: number;
  receitaLiquidaTotal: number;
  aprovacoesTotal: number;
  obraTotal: number;
  resultadoNominal: number;

  vpl: number;
  tirMensal: number | null;
  tirAnual: number | null;
  tirIndisponivelMotivo: string | null; // preenchido quando tir* é null
  paybackMes: number | null; // null = não paga dentro do horizonte
  exposicaoMaximaCaixa: number;
  roiSobreCapex: number;
  margemSobreReceitaRealizada: number;

  alertas: string[];
}

function pesoVenda(mes: number, inicioVendas: number, prazoVendas: number, curva: CurvaVendas): number {
  if (mes < inicioVendas || mes > inicioVendas + prazoVendas - 1) return 0;
  const t = (mes - inicioVendas) / Math.max(prazoVendas - 1, 1);
  if (curva === "constante") return 1;
  if (curva === "rampa") return 0.3 + 0.7 * (1 - Math.abs(2 * t - 1));
  return 0.15 + 0.85 * Math.sin(Math.PI * t); // curva_s
}

/**
 * Custo de obra lançado no mês.
 *
 * Modo "linear": um portão simples [inicioObra, inicioObra+duracaoObra)
 * divide o valor igualmente pelos meses da obra — correto por construção.
 *
 * Modo "curva_s": cada disciplina já tem sua própria janela [mesInicio,
 * mesFim] calculada a partir de duracaoObra (seção "Curva física de obra").
 * NÃO aplicamos um portão externo adicional aqui: a Planilha Mestre de
 * Viabilidade original faz isso (coluna H, gate estrito "< inicioObra +
 * duracaoObra"), e isso zera silenciosamente o último mês de qualquer
 * disciplina cuja janela termine exatamente no fim do prazo de obra (ex.:
 * Sinalização, que vai até 100%) — dinheiro do orçamento nunca chega a ser
 * desembolsado no fluxo de caixa. Confirmamos isso comparando os valores
 * mês a mês contra a planilha original. Aqui corrigimos: cada disciplina é
 * paga integralmente dentro da sua própria janela, sem um corte externo.
 */
function custoObraNoMes(
  mes: number,
  inicioObra: number,
  duracaoObra: number,
  curva: CurvaObra,
  custoObraMensalLinear: number,
  gruposCustoObra: Partial<Record<string, number>>,
  janelasObraPorDisciplina: Record<string, { inicio: number; fim: number }>
): number {
  if (curva === "linear") {
    return mes >= inicioObra && mes < inicioObra + duracaoObra ? custoObraMensalLinear : 0;
  }

  let total = 0;
  for (const [grupo, valorTotal] of Object.entries(gruposCustoObra)) {
    if (!valorTotal) continue;
    const janela = janelasObraPorDisciplina[grupo];
    if (!janela) continue;
    const mesInicio = Math.round(inicioObra + janela.inicio * duracaoObra);
    const mesFim = Math.round(inicioObra + janela.fim * duracaoObra);
    const duracaoJanela = Math.max(mesFim - mesInicio + 1, 1);
    if (mes >= mesInicio && mes <= mesFim) {
      total += valorTotal / duracaoJanela;
    }
  }
  return total;
}

/** NPV no formato Excel: primeiro fluxo descontado por (1+taxa)^1. */
export function npv(taxaMensal: number, fluxos: number[]): number {
  return fluxos.reduce((acc, cf, i) => acc + cf / Math.pow(1 + taxaMensal, i + 1), 0);
}

/** IRR por bisseção sobre NPV(taxa) — robusto para o padrão de fluxo (custos primeiro, receita depois). */
export function irr(fluxos: number[]): number | null {
  let low = -0.99;
  let high = 10;
  const npvLow = npv(low, fluxos);
  const npvHigh = npv(high, fluxos);
  if (npvLow === 0) return low;
  if (npvHigh === 0) return high;
  if (Math.sign(npvLow) === Math.sign(npvHigh)) return null; // sem raiz no intervalo — sem solução real

  for (let i = 0; i < 200; i++) {
    const mid = (low + high) / 2;
    const npvMid = npv(mid, fluxos);
    if (Math.abs(npvMid) < 1e-6) return mid;
    if (Math.sign(npvMid) === Math.sign(npvLow)) {
      low = mid;
    } else {
      high = mid;
    }
  }
  return (low + high) / 2;
}

export function calcularFinanceEngine(input: FinanceEngineInput): FinanceEngineOutput {
  const horizonte = input.horizonteMeses ?? HORIZONTE_PADRAO_MESES;
  const inicioAprovacoes = input.inicioAprovacoesMes ?? 1;
  const inicioObra = inicioAprovacoes + input.duracaoAprovacoesMeses;

  const tmaMensal = Math.pow(1 + input.tmaAnualFracao, 1 / 12) - 1;
  const taxaCustosMensal = input.custosIndexados ? Math.pow(1 + (input.indiceCustosAnualFracao ?? 0), 1 / 12) - 1 : 0;
  const taxaRecebiveisMensal = input.recebiveisIndexados ? Math.pow(1 + (input.indiceRecebiveisAnualFracao ?? 0), 1 / 12) - 1 : 0;

  const custoAprovacoesMensalBase = input.capexAprovacoesTotal / Math.max(input.duracaoAprovacoesMeses, 1);
  const custoObraTotalGrupos: number = Object.values(input.gruposCustoObra).reduce((s: number, v) => s + (v ?? 0), 0);
  const custoObraMensalLinear = custoObraTotalGrupos / Math.max(input.duracaoObraMeses, 1);

  // ---- Pesos de venda e alvo acumulado de lotes (replica X19/V19 da planilha) ----
  const pesos: number[] = [];
  for (let mes = 1; mes <= horizonte; mes++) {
    pesos.push(pesoVenda(mes, input.inicioVendasMes, input.prazoVendasMeses, input.curvaVendas));
  }
  const somaPesos = pesos.reduce((s, p) => s + p, 0) || 1;

  const alvoAcumulado: number[] = [];
  let somaPesoAcumulada = 0;
  for (let i = 0; i < horizonte; i++) {
    somaPesoAcumulada += pesos[i];
    alvoAcumulado.push(Math.round((input.numeroLotes * somaPesoAcumulada) / somaPesos));
  }

  const receitaBrutaPorMes: number[] = []; // Y[mes] — antes de deduções, usado na amortização de parcelas
  const fluxoMensal: FinanceMonthRow[] = [];
  let fluxoAcumuladoAnterior = 0;

  for (let mes = 1; mes <= horizonte; mes++) {
    const lotesAcumulados = alvoAcumulado[mes - 1];
    const lotesAnteriores = mes === 1 ? 0 : alvoAcumulado[mes - 2];
    const lotesVendidos = lotesAcumulados - lotesAnteriores;

    const receitaBrutaLotesDoMes = lotesVendidos * input.precoBrutoPorLote;
    receitaBrutaPorMes.push(receitaBrutaLotesDoMes);

    const fatorRecebiveis = Math.pow(1 + taxaRecebiveisMensal, mes - 1);
    const fatorCustos = Math.pow(1 + taxaCustosMensal, mes - 1);

    const entrada = input.percentualEntrada * receitaBrutaLotesDoMes * fatorRecebiveis;
    const inicioJanelaParcelas = Math.max(mes - input.numeroParcelas, 1);
    let somaVendasJanela = 0;
    for (let m2 = inicioJanelaParcelas; m2 < mes; m2++) {
      somaVendasJanela += receitaBrutaPorMes[m2 - 1] ?? 0;
    }
    const parcelas = ((1 - input.percentualEntrada) / Math.max(input.numeroParcelas, 1)) * somaVendasJanela * fatorRecebiveis;

    const receitaBruta = entrada + parcelas;
    const deducoesVenda = -receitaBruta * input.percentualDeducoesVenda;
    const receitaLiquida = receitaBruta + deducoesVenda;

    const custoAprovacoes =
      mes >= inicioAprovacoes && mes < inicioAprovacoes + input.duracaoAprovacoesMeses
        ? -custoAprovacoesMensalBase * fatorCustos
        : 0;

    const custoObraBase = custoObraNoMes(
      mes,
      inicioObra,
      input.duracaoObraMeses,
      input.curvaObra,
      custoObraMensalLinear,
      input.gruposCustoObra,
      input.janelasObraPorDisciplina ?? JANELAS_OBRA_PADRAO
    );
    const custoObra = -custoObraBase * fatorCustos;

    const jurosReinvestimento = input.reinvestirCaixaPositivo && fluxoAcumuladoAnterior > 0 ? fluxoAcumuladoAnterior * tmaMensal : 0;

    const fluxoLiquido = receitaLiquida + custoAprovacoes + custoObra + jurosReinvestimento;
    const fluxoAcumulado = fluxoAcumuladoAnterior + fluxoLiquido;

    fluxoMensal.push({
      mes,
      lotesVendidos,
      lotesAcumulados,
      receitaBruta,
      deducoesVenda,
      receitaLiquida,
      custoAprovacoes,
      custoObra,
      jurosReinvestimento,
      fluxoLiquido,
      fluxoAcumulado,
    });

    fluxoAcumuladoAnterior = fluxoAcumulado;
  }

  const receitaBrutaTotal = fluxoMensal.reduce((s, r) => s + r.receitaBruta, 0);
  const deducoesTotal = fluxoMensal.reduce((s, r) => s + r.deducoesVenda, 0);
  const receitaLiquidaTotal = fluxoMensal.reduce((s, r) => s + r.receitaLiquida, 0);
  const aprovacoesTotal = fluxoMensal.reduce((s, r) => s + r.custoAprovacoes, 0);
  const obraTotal = fluxoMensal.reduce((s, r) => s + r.custoObra, 0);
  const resultadoNominal = fluxoMensal.reduce((s, r) => s + r.fluxoLiquido, 0);

  const fluxosLiquidos = fluxoMensal.map((r) => r.fluxoLiquido);
  const fluxosAcumulados = fluxoMensal.map((r) => r.fluxoAcumulado);
  const minAcumulado = Math.min(...fluxosAcumulados);
  const exposicaoMaximaCaixa = Math.max(0, -minAcumulado);

  const vpl = npv(tmaMensal, fluxosLiquidos);

  let tirMensal: number | null = null;
  let tirAnual: number | null = null;
  let tirIndisponivelMotivo: string | null = null;

  if (resultadoNominal <= 0) {
    tirIndisponivelMotivo = "Projeto não se paga dentro do horizonte simulado — resultado nominal negativo ou zero";
  } else if (exposicaoMaximaCaixa < input.capexTotal * 0.2) {
    tirIndisponivelMotivo =
      "n/a — obra autofinanciada pelas vendas (exposição de caixa baixa); TIR ficaria artificialmente inflada. Use VPL, margem e ROI";
  } else {
    tirMensal = irr(fluxosLiquidos);
    tirAnual = tirMensal !== null ? Math.pow(1 + tirMensal, 12) - 1 : null;
    if (tirMensal === null) tirIndisponivelMotivo = "Não foi possível calcular a TIR (sem raiz real no intervalo pesquisado)";
  }

  // Payback definitivo: mês em que o caixa acumulado fica positivo e não volta a negativo.
  let paybackMes: number | null;
  if (minAcumulado >= 0) {
    paybackMes = 1; // nunca fica negativo — paga desde o início
  } else if (fluxosAcumulados[horizonte - 1] < 0) {
    paybackMes = null; // não paga dentro do horizonte
  } else {
    let ultimoMesNegativo = 0;
    for (let i = 0; i < horizonte; i++) {
      if (fluxosAcumulados[i] < 0) ultimoMesNegativo = i + 1;
    }
    paybackMes = ultimoMesNegativo + 1;
  }

  const roiSobreCapex = input.capexTotal > 0 ? resultadoNominal / input.capexTotal : 0;
  const margemSobreReceitaRealizada = receitaBrutaTotal > 0 ? resultadoNominal / receitaBrutaTotal : 0;

  // ---- Alertas de consistência (spec seção 2.8) ----
  const alertas: string[] = [];

  if (input.prazoVendasMeses > horizonte) {
    alertas.push(
      `Prazo de vendas (${input.prazoVendasMeses} meses) excede o horizonte de ${horizonte} meses do fluxo — resultado subestimado`
    );
  }

  if (fluxosAcumulados[horizonte - 1] < 0) {
    alertas.push(`Fluxo acumulado negativo ao fim de ${horizonte} meses — o projeto não se paga dentro do horizonte simulado`);
  }

  if (input.inicioVendasMes < inicioObra) {
    alertas.push("Vendas iniciam antes da obra — cronograma inconsistente");
  }

  if (exposicaoMaximaCaixa < input.capexTotal * 0.2) {
    alertas.push(
      `Exposição máxima de caixa (R$ ${exposicaoMaximaCaixa.toFixed(0)}) é baixa frente ao CAPEX (R$ ${input.capexTotal.toFixed(0)}) — as vendas autofinanciam a obra; a TIR não é representativa`
    );
  }

  const descolamentoAnual = (input.indiceCustosAnualFracao ?? 0) - (input.indiceRecebiveisAnualFracao ?? 0);
  if (input.custosIndexados && descolamentoAnual > 0.02) {
    alertas.push(
      `Custos corrigem ${(descolamentoAnual * 100).toFixed(1)}pp a.a. acima dos recebíveis — corrói a margem ao longo do ciclo`
    );
  }

  if (input.inicioVendasMes + input.prazoVendasMeses + input.numeroParcelas > horizonte) {
    alertas.push(
      `Com ${input.numeroParcelas} parcelas, vendas do fim do período de vendas só quitam após o mês ${input.inicioVendasMes + input.prazoVendasMeses + input.numeroParcelas} — além do horizonte de ${horizonte} meses. Receita dessas parcelas finais não aparece no fluxo, subestimando o total recebido`
    );
  }

  return {
    fluxoMensal,
    receitaBrutaTotal,
    deducoesTotal,
    receitaLiquidaTotal,
    aprovacoesTotal,
    obraTotal,
    resultadoNominal,
    vpl,
    tirMensal,
    tirAnual,
    tirIndisponivelMotivo,
    paybackMes,
    exposicaoMaximaCaixa,
    roiSobreCapex,
    margemSobreReceitaRealizada,
    alertas,
  };
}
