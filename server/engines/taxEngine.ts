/**
 * TaxEngine - Motor Tributário
 * RET, Lucro Presumido, Lucro Real (com IBS/CBS pós-reforma) — Especificação
 * EVTE PRO seção 2.9.
 *
 * IMPORTANTE: este motor reproduz uma modelagem simplificada e educativa da
 * carga tributária, a partir das alíquotas cadastradas no Módulo de
 * Configuração (config_tax_regimes). NÃO substitui orientação contábil —
 * o resultado deve ser conferido com o contador do projeto antes de
 * qualquer decisão, especialmente por causa da transição da reforma
 * tributária (IBS/CBS) e de regras específicas de patrimônio de afetação.
 */

export type RegimeTributario = "ret" | "lucro_presumido" | "lucro_real";

/** Limite anual de lucro sujeito ao adicional de IRPJ (R$ 20.000/mês × 12). */
export const LIMITE_ANUAL_ADICIONAL_IRPJ = 240_000;

export interface TaxEngineAliquotas {
  unificada?: number; // RET
  irpj?: number;
  adicionalIrpj?: number;
  csll?: number;
  pis?: number;
  cofins?: number;
  ibs?: number;
  cbs?: number;
}

export interface TaxEngineInput {
  regime: RegimeTributario;
  receitaBrutaTotal: number; // do SalesEngine/FinanceEngine
  lucroContabil: number; // resultado nominal antes de impostos (FinanceEngine)
  redutorSocialReais?: number; // abatimento sobre o RET, quando aplicável
  patrimonioAfetacao?: boolean;
  aliquotas: TaxEngineAliquotas; // de config_tax_regimes.aliquotas
}

export interface TaxLinha {
  nome: string;
  baseCalculo: number;
  aliquotaPercentual: number;
  valor: number;
}

export interface ComparativoReforma {
  totalRegimeAtual: number; // PIS+COFINS cumulativo, como referência pré-reforma
  totalIbsCbs: number;
  diferenca: number; // positivo = IBS/CBS custa mais que PIS/COFINS
}

export interface TaxEngineOutput {
  regime: RegimeTributario;
  linhas: TaxLinha[];
  impostosTotais: number;
  cargaTributariaSobreReceita: number; // impostosTotais / receitaBrutaTotal
  lucroLiquidoAposImpostos: number;
  comparativoReforma: ComparativoReforma | null; // só para lucro_real
  alertas: string[];
}

function linhaImposto(nome: string, baseCalculo: number, aliquotaPercentual: number): TaxLinha {
  const valor = Math.max(baseCalculo, 0) * (aliquotaPercentual / 100);
  return { nome, baseCalculo: Math.max(baseCalculo, 0), aliquotaPercentual, valor };
}

function calcularIrpjCsll(lucroContabil: number, aliquotas: TaxEngineAliquotas): TaxLinha[] {
  const irpj = linhaImposto("IRPJ", lucroContabil, aliquotas.irpj ?? 15);
  const baseAdicional = Math.max(lucroContabil - LIMITE_ANUAL_ADICIONAL_IRPJ, 0);
  const adicional = linhaImposto("Adicional de IRPJ (sobre o excedente de R$ 240.000/ano)", baseAdicional, aliquotas.adicionalIrpj ?? 10);
  const csll = linhaImposto("CSLL", lucroContabil, aliquotas.csll ?? 9);
  return [irpj, adicional, csll];
}

export function calcularTaxEngine(input: TaxEngineInput): TaxEngineOutput {
  const alertas: string[] = [];
  let linhas: TaxLinha[] = [];
  let comparativoReforma: ComparativoReforma | null = null;

  if (input.regime === "ret") {
    const aliquotaRet = input.aliquotas.unificada ?? 4;
    const linha = linhaImposto("RET — alíquota unificada", input.receitaBrutaTotal, aliquotaRet);
    const redutor = input.redutorSocialReais ?? 0;
    linha.valor = Math.max(linha.valor - redutor, 0);
    linhas = [linha];

    if (input.patrimonioAfetacao === false) {
      alertas.push("RET normalmente exige a instituição de patrimônio de afetação sobre o terreno/incorporação — confirme com o contador se este projeto se qualifica");
    }
  } else if (input.regime === "lucro_presumido") {
    const irpjCsll = calcularIrpjCsll(input.lucroContabil, input.aliquotas);
    const pis = linhaImposto("PIS", input.receitaBrutaTotal, input.aliquotas.pis ?? 0.65);
    const cofins = linhaImposto("COFINS", input.receitaBrutaTotal, input.aliquotas.cofins ?? 3);
    linhas = [...irpjCsll, pis, cofins];
  } else {
    // lucro_real
    const irpjCsll = calcularIrpjCsll(input.lucroContabil, input.aliquotas);
    const ibs = linhaImposto("IBS", input.receitaBrutaTotal, input.aliquotas.ibs ?? 17.7);
    const cbs = linhaImposto("CBS", input.receitaBrutaTotal, input.aliquotas.cbs ?? 8.8);
    linhas = [...irpjCsll, ibs, cbs];

    // Comparativo do impacto da reforma tributária (spec seção 2.9): referência
    // pré-reforma usa as mesmas alíquotas cumulativas de PIS/COFINS do Lucro
    // Presumido, já que não há mais um "regime PIS/COFINS de Lucro Real" após a
    // transição — é só uma referência de comparação, não um cálculo oficial.
    const totalRegimeAtual = input.receitaBrutaTotal * ((input.aliquotas.pis ?? 0.65) + (input.aliquotas.cofins ?? 3)) / 100;
    const totalIbsCbs = ibs.valor + cbs.valor;
    comparativoReforma = {
      totalRegimeAtual,
      totalIbsCbs,
      diferenca: totalIbsCbs - totalRegimeAtual,
    };
  }

  const impostosTotais = linhas.reduce((sum, l) => sum + l.valor, 0);
  const cargaTributariaSobreReceita = input.receitaBrutaTotal > 0 ? impostosTotais / input.receitaBrutaTotal : 0;
  const lucroLiquidoAposImpostos = input.lucroContabil - impostosTotais;

  if (cargaTributariaSobreReceita > 0.15) {
    alertas.push(`Carga tributária de ${(cargaTributariaSobreReceita * 100).toFixed(1)}% sobre a receita bruta está acima da faixa usual (até ~15%) — reveja o regime escolhido`);
  }

  return {
    regime: input.regime,
    linhas,
    impostosTotais,
    cargaTributariaSobreReceita,
    lucroLiquidoAposImpostos,
    comparativoReforma,
    alertas,
  };
}
