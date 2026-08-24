import { getDb } from "../db";
import { eq, inArray } from "drizzle-orm";
import { financeEngineData, projects, salesEngineData, costEngineData } from "../../drizzle/schema";
import { parseJsonColumn } from "../db";
import { calcularPortfolio, type PortfolioOutput, type ProjetoNoPortfolio } from "../engines/portfolioEngine";
import type { FinanceMonthRow } from "../engines/financeEngine";

export interface PortfolioProjetoResumo {
  projectId: number;
  /** true quando este projeto entrou na consolidação atual. */
  selecionado: boolean;
  nome: string;
  localizacao: string | null;
  status: string;
  dataInicioPrevista: Date | null;
  offsetMeses: number;
  vgv: number;
  capexTotal: number;
  vpl: number;
  tirAnual: number | null;
  exposicaoIndividual: number;
}

export interface PortfolioData extends PortfolioOutput {
  projetos: PortfolioProjetoResumo[];
  /** Projetos do usuário que ficaram de fora por ainda não terem FinanceEngine calculado. */
  projetosSemCalculo: { projectId: number; nome: string }[];
}

/** Diferença em meses entre duas datas (aproximada por ano/mês, ignorando o dia). */
function diffMeses(de: Date, ate: Date): number {
  return (ate.getFullYear() - de.getFullYear()) * 12 + (ate.getMonth() - de.getMonth());
}

/**
 * Consolida todos os projetos do usuário numa visão de portfólio
 * (spec seção 8, item 6). Projetos sem FinanceEngine calculado são
 * reportados à parte em vez de entrarem como zero — um projeto sem fluxo
 * não é um projeto que não consome caixa.
 */
export async function getPortfolioData(userId: number, projectIdsSelecionados?: number[]): Promise<PortfolioData> {
  const db = await getDb();
  if (!db) throw new Error("Banco de dados não disponível");

  const todosProjetos = await db.select().from(projects).where(eq(projects.userId, userId));
  if (todosProjetos.length === 0) {
    return { ...calcularPortfolio([]), projetos: [], projetosSemCalculo: [] };
  }

  const ids = todosProjetos.map((p) => p.id);
  const [finances, sales, costs] = await Promise.all([
    db.select().from(financeEngineData).where(inArray(financeEngineData.projectId, ids)),
    db.select().from(salesEngineData).where(inArray(salesEngineData.projectId, ids)),
    db.select().from(costEngineData).where(inArray(costEngineData.projectId, ids)),
  ]);

  const financePorProjeto = new Map(finances.map((f) => [f.projectId, f]));
  const salesPorProjeto = new Map(sales.map((s) => [s.projectId, s]));
  const costPorProjeto = new Map(costs.map((c) => [c.projectId, c]));

  const temCalculo = (p: (typeof todosProjetos)[number]) => {
    const f = financePorProjeto.get(p.id);
    return Boolean(f && f.vpl !== null && f.fluxoCaixaMensal !== null);
  };

  // Seleção: se nenhuma lista for informada, consolida tudo que tem cálculo.
  // Informada, consolida só o que foi escolhido — mas os disponíveis continuam
  // sendo listados, para a tela poder oferecer a seleção.
  const selecionados = projectIdsSelecionados ? new Set(projectIdsSelecionados) : null;
  const disponiveis = todosProjetos.filter(temCalculo);
  const comCalculo = selecionados ? disponiveis.filter((p) => selecionados.has(p.id)) : disponiveis;

  const projetosSemCalculo = todosProjetos
    .filter((p) => !temCalculo(p))
    .map((p) => ({ projectId: p.id, nome: p.name }));

  // Alinhamento no calendário: quem tem data de início prevista é deslocado
  // em relação ao projeto que começa primeiro. Sem data, offset 0.
  const datas = comCalculo.map((p) => p.dataInicioPrevista).filter((d): d is Date => d instanceof Date);
  const maisAntiga = datas.length > 0 ? new Date(Math.min(...datas.map((d) => d.getTime()))) : null;

  const entradas: ProjetoNoPortfolio[] = [];
  const resumos: PortfolioProjetoResumo[] = [];

  for (const projeto of comCalculo) {
    const finance = financePorProjeto.get(projeto.id)!;
    const fluxo = (parseJsonColumn<FinanceMonthRow[]>(finance.fluxoCaixaMensal as FinanceMonthRow[] | string | null) ?? []).map((r) => r.fluxoLiquido);
    const offsetMeses =
      maisAntiga && projeto.dataInicioPrevista instanceof Date ? Math.max(diffMeses(maisAntiga, projeto.dataInicioPrevista), 0) : 0;

    const vgv = Number(salesPorProjeto.get(projeto.id)?.vgv ?? 0);
    const capexTotal = Number(costPorProjeto.get(projeto.id)?.investimentoTotal ?? 0);
    const vpl = Number(finance.vpl);
    const tmaAnualFracao = Number(finance.tmaUtilizada ?? 0);

    entradas.push({
      projectId: projeto.id,
      nome: projeto.name,
      offsetMeses,
      fluxoLiquidoMensal: fluxo,
      vgv,
      capexTotal,
      vpl,
      tmaAnualFracao,
    });

    resumos.push({
      projectId: projeto.id,
      selecionado: true,
      nome: projeto.name,
      localizacao: projeto.location,
      status: projeto.status,
      dataInicioPrevista: projeto.dataInicioPrevista,
      offsetMeses,
      vgv,
      capexTotal,
      vpl,
      tirAnual: finance.tir !== null ? Number(finance.tir) : null,
      exposicaoIndividual: Number(finance.exposicaoMaximaCaixa ?? 0),
    });
  }

  const consolidado = calcularPortfolio(entradas);

  // Desmarcar tudo é diferente de não ter nada calculado — o motor devolve o
  // mesmo objeto vazio nos dois casos, então o motivo precisa ser corrigido
  // aqui para não dizer ao usuário que ele não tem estudos.
  if (entradas.length === 0 && disponiveis.length > 0) {
    consolidado.tirIndisponivelMotivo = "Nenhum projeto selecionado";
    consolidado.alertas.push("Nenhum projeto selecionado — marque ao menos um para ver a consolidação.");
  }

  if (projetosSemCalculo.length > 0) {
    consolidado.alertas.push(
      `${projetosSemCalculo.length} projeto(s) fora da consolidação por ainda não terem o FinanceEngine calculado: ` +
        projetosSemCalculo.map((p) => p.nome).join(", ")
    );
  }

  // Projetos calculáveis que ficaram fora da seleção também aparecem na lista
  // (desmarcados), para o usuário poder trazê-los de volta sem sair da tela.
  const foraDaSelecao: PortfolioProjetoResumo[] = disponiveis
    .filter((p) => !comCalculo.some((c) => c.id === p.id))
    .map((p) => {
      const finance = financePorProjeto.get(p.id)!;
      return {
        projectId: p.id,
        selecionado: false,
        nome: p.name,
        localizacao: p.location,
        status: p.status,
        dataInicioPrevista: p.dataInicioPrevista,
        offsetMeses: 0,
        vgv: Number(salesPorProjeto.get(p.id)?.vgv ?? 0),
        capexTotal: Number(costPorProjeto.get(p.id)?.investimentoTotal ?? 0),
        vpl: Number(finance.vpl),
        tirAnual: finance.tir !== null ? Number(finance.tir) : null,
        exposicaoIndividual: Number(finance.exposicaoMaximaCaixa ?? 0),
      };
    });

  return {
    ...consolidado,
    projetos: [...resumos, ...foraDaSelecao].sort((a, b) => Number(b.selecionado) - Number(a.selecionado) || b.vgv - a.vgv),
    projetosSemCalculo,
  };
}
