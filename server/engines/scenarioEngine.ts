/**
 * ScenarioEngine - Cenários e Análise de Parceria
 * Especificação EVTE PRO seção 2.10.
 *
 * Reaproveita o FinanceEngine (não duplica a lógica de fluxo de caixa):
 * cada cenário é o mesmo fluxo de 120 meses recalculado com preço/prazo de
 * vendas/CAPEX variados. Os valores desta seção são NOMINAIS — o veredito
 * de viabilidade continua sendo o VPL do FinanceEngine (seção 2.8), não os
 * números aqui. A UI que consumir isto precisa deixar essa distinção clara,
 * para não induzir a uma leitura otimista demais do "lucro nominal".
 */

import { calcularFinanceEngine, FinanceEngineInput } from "./financeEngine";

export type TipoCenario = "conservador" | "realista" | "otimista" | "customizado";

export interface VariacaoCenario {
  nome: string;
  tipo: TipoCenario;
  variacaoPrecoFracao: number; // ex.: -0.1 = preço 10% menor
  variacaoAbsorcaoFracao: number; // ex.: -0.2 = absorção 20% mais lenta (prazo de vendas aumenta)
  variacaoCapexFracao: number; // ex.: 0.1 = CAPEX 10% maior
}

/** Variações padrão — não vêm da spec (que não define %), são um ponto de partida editável por projeto. */
export const CENARIOS_PADRAO: VariacaoCenario[] = [
  { nome: "Conservador", tipo: "conservador", variacaoPrecoFracao: -0.1, variacaoAbsorcaoFracao: -0.2, variacaoCapexFracao: 0.1 },
  { nome: "Realista", tipo: "realista", variacaoPrecoFracao: 0, variacaoAbsorcaoFracao: 0, variacaoCapexFracao: 0 },
  { nome: "Otimista", tipo: "otimista", variacaoPrecoFracao: 0.1, variacaoAbsorcaoFracao: 0.2, variacaoCapexFracao: -0.05 },
];

export interface ResultadoCenario {
  nome: string;
  tipo: TipoCenario;
  precoBrutoPorLote: number;
  prazoVendasMeses: number;
  capexTotal: number;
  vgvTotal: number;
  receitaLiquidaTotal: number;
  lucroNominal: number; // resultado nominal (spec 2.10) — NÃO é o VPL
  roiSobreCapex: number;
  margemSobreReceita: number;
}

/** Aplica as variações de um cenário sobre o input base do FinanceEngine e roda o cálculo. */
export function calcularCenario(base: FinanceEngineInput, variacao: VariacaoCenario): ResultadoCenario {
  const precoBrutoPorLote = base.precoBrutoPorLote * (1 + variacao.variacaoPrecoFracao);
  // Absorção mais rápida (%positivo) encurta o prazo de vendas; mais lenta alonga.
  const prazoVendasMeses = Math.max(1, Math.round(base.prazoVendasMeses / (1 + variacao.variacaoAbsorcaoFracao)));
  const fatorCapex = 1 + variacao.variacaoCapexFracao;
  const capexTotal = base.capexTotal * fatorCapex;
  const gruposCustoObra: Partial<Record<string, number>> = {};
  for (const [grupo, valor] of Object.entries(base.gruposCustoObra)) {
    if (valor !== undefined) gruposCustoObra[grupo] = valor * fatorCapex;
  }
  const capexAprovacoesTotal = base.capexAprovacoesTotal * fatorCapex;

  const output = calcularFinanceEngine({
    ...base,
    precoBrutoPorLote,
    prazoVendasMeses,
    capexTotal,
    gruposCustoObra,
    capexAprovacoesTotal,
  });

  return {
    nome: variacao.nome,
    tipo: variacao.tipo,
    precoBrutoPorLote,
    prazoVendasMeses,
    capexTotal,
    vgvTotal: output.receitaBrutaTotal,
    receitaLiquidaTotal: output.receitaLiquidaTotal,
    lucroNominal: output.resultadoNominal,
    roiSobreCapex: output.roiSobreCapex,
    margemSobreReceita: output.margemSobreReceitaRealizada,
  };
}

export function calcularCenarios(base: FinanceEngineInput, variacoes: VariacaoCenario[] = CENARIOS_PADRAO): ResultadoCenario[] {
  return variacoes.map((v) => calcularCenario(base, v));
}

// ---------------------------------------------------------------------------
// Análise de Parceria (permuta por lotes físicos)
// ---------------------------------------------------------------------------

export interface ParceriaInput {
  numeroLotes: number;
  percentualParceriaTerreno: number; // fração 0-1 — % dos lotes que ficam com o terreneiro
  vgvTotal: number;
  receitaLiquidaTotal: number; // já líquida de deduções sobre venda
  capexTotal: number; // 100% pago pela incorporadora, independente da permuta
}

export interface ResultadoParceria {
  lotesTerreneiro: number;
  lotesIncorporadora: number;
  vgvTerreneiro: number; // recebe lotes e vende por conta própria — sem dedução aqui
  vgvIncorporadora: number;
  receitaLiquidaIncorporadora: number;
  lucroIncorporadora: number; // receitaLiquidaIncorporadora - capexTotal (nominal)
  percentualEquilibrio: number; // % de participação do terreneiro em que o lucro da incorporadora zera
}

export function calcularParceria(input: ParceriaInput): ResultadoParceria {
  const lotesTerreneiro = Math.round(input.numeroLotes * input.percentualParceriaTerreno);
  const lotesIncorporadora = input.numeroLotes - lotesTerreneiro;

  const vgvTerreneiro = input.vgvTotal * input.percentualParceriaTerreno;
  const vgvIncorporadora = input.vgvTotal * (1 - input.percentualParceriaTerreno);
  const receitaLiquidaIncorporadora = input.receitaLiquidaTotal * (1 - input.percentualParceriaTerreno);
  const lucroIncorporadora = receitaLiquidaIncorporadora - input.capexTotal;

  // receitaLiquidaTotal * (1 - participacao) = capexTotal => participacao = 1 - capexTotal/receitaLiquidaTotal
  const percentualEquilibrio = input.receitaLiquidaTotal > 0 ? 1 - input.capexTotal / input.receitaLiquidaTotal : 0;

  return {
    lotesTerreneiro,
    lotesIncorporadora,
    vgvTerreneiro,
    vgvIncorporadora,
    receitaLiquidaIncorporadora,
    lucroIncorporadora,
    percentualEquilibrio,
  };
}

// ---------------------------------------------------------------------------
// Matrizes de Sensibilidade
// ---------------------------------------------------------------------------

export interface CelulaMatriz1 {
  cenario: string;
  percentualParceria: number;
  lucroIncorporadora: number;
  prejuizo: boolean;
}

/** Matriz 1: Lucro da incorporadora × (cenário × % de participação do terreneiro). */
export function calcularMatrizSensibilidade1(
  base: FinanceEngineInput,
  percentuaisParceria: number[],
  variacoes: VariacaoCenario[] = CENARIOS_PADRAO
): CelulaMatriz1[] {
  const celulas: CelulaMatriz1[] = [];
  for (const variacao of variacoes) {
    const cenario = calcularCenario(base, variacao);
    for (const percentual of percentuaisParceria) {
      const parceria = calcularParceria({
        numeroLotes: base.numeroLotes,
        percentualParceriaTerreno: percentual,
        vgvTotal: cenario.vgvTotal,
        receitaLiquidaTotal: cenario.receitaLiquidaTotal,
        capexTotal: cenario.capexTotal,
      });
      celulas.push({
        cenario: cenario.nome,
        percentualParceria: percentual,
        lucroIncorporadora: parceria.lucroIncorporadora,
        prejuizo: parceria.lucroIncorporadora < 0,
      });
    }
  }
  return celulas;
}

export interface CelulaMatriz2 {
  variacaoPrecoFracao: number;
  percentualParceria: number;
  lucroIncorporadora: number;
  prejuizo: boolean;
}

/** Matriz 2: Lucro da incorporadora × (variação de preço de venda × % de permuta). */
export function calcularMatrizSensibilidade2(
  base: FinanceEngineInput,
  variacoesPreco: number[],
  percentuaisParceria: number[]
): CelulaMatriz2[] {
  const celulas: CelulaMatriz2[] = [];
  for (const variacaoPrecoFracao of variacoesPreco) {
    const cenario = calcularCenario(base, {
      nome: `Preço ${variacaoPrecoFracao >= 0 ? "+" : ""}${(variacaoPrecoFracao * 100).toFixed(0)}%`,
      tipo: "customizado",
      variacaoPrecoFracao,
      variacaoAbsorcaoFracao: 0,
      variacaoCapexFracao: 0,
    });
    for (const percentual of percentuaisParceria) {
      const parceria = calcularParceria({
        numeroLotes: base.numeroLotes,
        percentualParceriaTerreno: percentual,
        vgvTotal: cenario.vgvTotal,
        receitaLiquidaTotal: cenario.receitaLiquidaTotal,
        capexTotal: cenario.capexTotal,
      });
      celulas.push({
        variacaoPrecoFracao,
        percentualParceria: percentual,
        lucroIncorporadora: parceria.lucroIncorporadora,
        prejuizo: parceria.lucroIncorporadora < 0,
      });
    }
  }
  return celulas;
}
