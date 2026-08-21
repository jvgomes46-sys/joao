import { createConfigSnapshot } from "../config";
import { getProjectById, replaceScenarios, upsertPartnershipAnalysis } from "../db";
import {
  calcularCenarios,
  calcularMatrizSensibilidade1,
  calcularMatrizSensibilidade2,
  calcularParceria,
  CENARIOS_PADRAO,
  ResultadoCenario,
  ResultadoParceria,
  VariacaoCenario,
} from "../engines/scenarioEngine";
import { buildFinanceEngineInput, FinanceEngineServiceInput } from "./financeEngineService";

export interface ScenarioEngineServiceInput extends FinanceEngineServiceInput {
  variacoes?: VariacaoCenario[]; // padrão: Conservador/Realista/Otimista
  percentualParceriaTerreno?: number; // fração 0-1, padrão 0 (sem permuta)
  percentuaisParceriaSensibilidade?: number[]; // eixo da matriz 1, padrão [0, 0.1, 0.2, ..., 0.5]
  variacoesPrecoSensibilidade?: number[]; // eixo da matriz 2, padrão [-0.2, -0.1, 0, 0.1, 0.2]
}

export interface ScenarioEngineOutput {
  cenarios: ResultadoCenario[];
  parceria: ResultadoParceria;
  matrizSensibilidade1: ReturnType<typeof calcularMatrizSensibilidade1>;
  matrizSensibilidade2: ReturnType<typeof calcularMatrizSensibilidade2>;
}

const PERCENTUAIS_PARCERIA_PADRAO = [0, 0.1, 0.2, 0.3, 0.4, 0.5];
const VARIACOES_PRECO_PADRAO = [-0.2, -0.1, 0, 0.1, 0.2];

/**
 * Orquestra Cenários e Análise de Parceria (spec seção 2.10):
 * 1. Reaproveita a mesma reconstrução de input que o FinanceEngine usa
 *    (GeoEngine + CostEngine já calculados são pré-requisito).
 * 2. Roda os 3 cenários (ou customizados) reaproveitando o FinanceEngine
 *    puro — não duplica a lógica de fluxo de caixa.
 * 3. Roda a análise de parceria e as duas matrizes de sensibilidade sobre
 *    o cenário Realista (ou o primeiro informado).
 * 4. Persiste tudo e grava snapshot — mesma auditabilidade dos outros motores.
 *
 * IMPORTANTE: os valores aqui são NOMINAIS (spec seção 2.10) — não são o
 * veredito de viabilidade, que continua sendo o VPL do FinanceEngine.
 */
export async function runScenarioEngine(
  projectId: number,
  userId: number,
  input: ScenarioEngineServiceInput
): Promise<ScenarioEngineOutput> {
  const project = await getProjectById(projectId, userId);
  if (!project) {
    throw new Error("Projeto não encontrado ou não pertence ao usuário");
  }

  const { financeInput } = await buildFinanceEngineInput(projectId, input);

  const variacoes = input.variacoes ?? CENARIOS_PADRAO;
  const cenarios = calcularCenarios(financeInput, variacoes);

  const percentualParceriaTerreno = input.percentualParceriaTerreno ?? 0;
  const cenarioReferencia = cenarios.find((c) => c.tipo === "realista") ?? cenarios[0];
  const parceria = calcularParceria({
    numeroLotes: financeInput.numeroLotes,
    percentualParceriaTerreno,
    vgvTotal: cenarioReferencia.vgvTotal,
    receitaLiquidaTotal: cenarioReferencia.receitaLiquidaTotal,
    capexTotal: cenarioReferencia.capexTotal,
  });

  const percentuaisParceriaSensibilidade = input.percentuaisParceriaSensibilidade ?? PERCENTUAIS_PARCERIA_PADRAO;
  const variacoesPrecoSensibilidade = input.variacoesPrecoSensibilidade ?? VARIACOES_PRECO_PADRAO;

  const matrizSensibilidade1 = calcularMatrizSensibilidade1(financeInput, percentuaisParceriaSensibilidade, variacoes);
  const matrizSensibilidade2 = calcularMatrizSensibilidade2(financeInput, variacoesPrecoSensibilidade, percentuaisParceriaSensibilidade);

  await replaceScenarios(
    projectId,
    cenarios.map((c) => ({
      nome: c.nome,
      tipo: c.tipo,
      descricao: `Preço ${c.precoBrutoPorLote.toFixed(2)}/lote, prazo de vendas ${c.prazoVendasMeses} meses, CAPEX ${c.capexTotal.toFixed(2)}`,
      variacaoVGV: String((c.vgvTotal / cenarios.find((x) => x.tipo === "realista")!.vgvTotal - 1) * 100),
      variacaoCustos: String((c.capexTotal / cenarios.find((x) => x.tipo === "realista")!.capexTotal - 1) * 100),
      variacaoTaxa: "0",
      resultados: c,
    }))
  );

  await upsertPartnershipAnalysis(projectId, {
    percentualParceriaTerreno: String(percentualParceriaTerreno),
    resultado: parceria,
    matrizSensibilidade1,
    matrizSensibilidade2,
  });

  await createConfigSnapshot({
    projectId,
    engine: "scenario_engine",
    snapshotData: {
      variacoes,
      percentualParceriaTerreno,
      percentuaisParceriaSensibilidade,
      variacoesPrecoSensibilidade,
    },
  });

  return { cenarios, parceria, matrizSensibilidade1, matrizSensibilidade2 };
}
