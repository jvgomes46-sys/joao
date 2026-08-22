/**
 * Portfólio multiprojeto (spec seção 8, item 6).
 *
 * O ponto do módulo é o que a spec chama de "só possível com dado
 * centralizado": consolidar vários estudos que hoje viveriam em arquivos
 * separados. Duas armadilhas de cálculo que este motor evita de propósito:
 *
 * 1. Exposição máxima de caixa NÃO é a soma das exposições individuais.
 *    O pico de caixa de cada projeto acontece num mês diferente; somar os
 *    picos superestima (às vezes muito) o capital realmente necessário.
 *    Aqui somamos os fluxos mês a mês e procuramos o pico do consolidado.
 *
 * 2. TIR consolidada NÃO é média das TIRs. Média de TIR é matematicamente
 *    inválida (TIR não é aditiva nem ponderável linearmente). Aqui a TIR é
 *    calculada sobre o fluxo somado, que é a definição correta.
 *
 * Motor puro: recebe os fluxos já carregados e devolve o consolidado.
 */

import { irr, npv } from "./financeEngine";

export interface ProjetoNoPortfolio {
  projectId: number;
  nome: string;
  /** Deslocamento em meses em relação ao projeto que começa primeiro (0 = começa primeiro). */
  offsetMeses: number;
  /** Fluxo líquido mês a mês do projeto (índice 0 = mês 1 do projeto). */
  fluxoLiquidoMensal: number[];
  vgv: number;
  capexTotal: number;
  vpl: number;
  tmaAnualFracao: number;
}

export interface PortfolioMesRow {
  mes: number; // mês do calendário do portfólio (1 = primeiro mês do projeto mais antigo)
  fluxoLiquido: number;
  fluxoAcumulado: number;
}

export interface PortfolioOutput {
  numeroProjetos: number;
  vgvTotal: number;
  capexTotal: number;
  vplSomado: number;

  /** Pico de caixa do consolidado (valor negativo = necessidade de capital). */
  exposicaoMaximaConsolidada: number;
  mesDaExposicaoMaxima: number;
  /** Soma ingênua dos picos individuais — só para mostrar o quanto ela exagera. */
  somaDasExposicoesIndividuais: number;
  /** Quanto de capital a visão consolidada economiza vs. somar os picos. */
  economiaVsSomaIngenua: number;

  tirMensalConsolidada: number | null;
  tirAnualConsolidada: number | null;
  tirIndisponivelMotivo: string | null;

  fluxoConsolidado: PortfolioMesRow[];
  /** true quando algum projeto usa TMA diferente dos demais — o VPL somado mistura taxas. */
  tmasDivergentes: boolean;
  alertas: string[];
}

export function calcularPortfolio(projetos: ProjetoNoPortfolio[]): PortfolioOutput {
  if (projetos.length === 0) {
    return {
      numeroProjetos: 0,
      vgvTotal: 0,
      capexTotal: 0,
      vplSomado: 0,
      exposicaoMaximaConsolidada: 0,
      mesDaExposicaoMaxima: 0,
      somaDasExposicoesIndividuais: 0,
      economiaVsSomaIngenua: 0,
      tirMensalConsolidada: null,
      tirAnualConsolidada: null,
      tirIndisponivelMotivo: "Nenhum projeto com FinanceEngine calculado",
      fluxoConsolidado: [],
      tmasDivergentes: false,
      alertas: [],
    };
  }

  // Horizonte do portfólio = maior (offset + duração) entre os projetos.
  const horizonte = Math.max(...projetos.map((p) => p.offsetMeses + p.fluxoLiquidoMensal.length));

  const fluxoSomado = new Array<number>(horizonte).fill(0);
  for (const projeto of projetos) {
    projeto.fluxoLiquidoMensal.forEach((valor, i) => {
      fluxoSomado[projeto.offsetMeses + i] += valor;
    });
  }

  const fluxoConsolidado: PortfolioMesRow[] = [];
  let acumulado = 0;
  let exposicaoMaximaConsolidada = 0;
  let mesDaExposicaoMaxima = 0;
  fluxoSomado.forEach((fluxoLiquido, i) => {
    acumulado += fluxoLiquido;
    if (acumulado < exposicaoMaximaConsolidada) {
      exposicaoMaximaConsolidada = acumulado;
      mesDaExposicaoMaxima = i + 1;
    }
    fluxoConsolidado.push({ mes: i + 1, fluxoLiquido, fluxoAcumulado: acumulado });
  });

  // Pico individual de cada projeto (mínimo do seu próprio acumulado).
  const somaDasExposicoesIndividuais = projetos.reduce((soma, p) => {
    let acc = 0;
    let min = 0;
    for (const v of p.fluxoLiquidoMensal) {
      acc += v;
      if (acc < min) min = acc;
    }
    return soma + min;
  }, 0);

  const tirMensalConsolidada = irr(fluxoSomado);
  const tirAnualConsolidada = tirMensalConsolidada !== null ? Math.pow(1 + tirMensalConsolidada, 12) - 1 : null;

  const tmas = new Set(projetos.map((p) => p.tmaAnualFracao));
  const tmasDivergentes = tmas.size > 1;

  const alertas: string[] = [];
  if (tmasDivergentes) {
    alertas.push(
      `Os projetos usam TMAs diferentes (${Array.from(tmas).map((t) => `${(t * 100).toFixed(1)}%`).join(", ")}) — ` +
        "o VPL somado agrega valores descontados a taxas distintas. Compare com cautela."
    );
  }
  if (exposicaoMaximaConsolidada < 0) {
    alertas.push(
      `Capital necessário no pico: ${Math.abs(exposicaoMaximaConsolidada).toLocaleString("pt-BR", { style: "currency", currency: "BRL", maximumFractionDigits: 0 })} ` +
        `no mês ${mesDaExposicaoMaxima} do portfólio.`
    );
  }
  if (projetos.some((p) => p.offsetMeses > 0) === false && projetos.length > 1) {
    alertas.push(
      "Todos os projetos foram alinhados no mesmo mês inicial porque nenhum tem data de início prevista cadastrada — " +
        "a exposição consolidada assume que começam juntos, o cenário mais conservador."
    );
  }

  return {
    numeroProjetos: projetos.length,
    vgvTotal: projetos.reduce((s, p) => s + p.vgv, 0),
    capexTotal: projetos.reduce((s, p) => s + p.capexTotal, 0),
    vplSomado: projetos.reduce((s, p) => s + p.vpl, 0),
    exposicaoMaximaConsolidada,
    mesDaExposicaoMaxima,
    somaDasExposicoesIndividuais,
    economiaVsSomaIngenua: exposicaoMaximaConsolidada - somaDasExposicoesIndividuais,
    tirMensalConsolidada,
    tirAnualConsolidada,
    tirIndisponivelMotivo: tirMensalConsolidada === null ? "Fluxo consolidado sem raiz real no intervalo pesquisado" : null,
    fluxoConsolidado,
    tmasDivergentes,
    alertas,
  };
}
