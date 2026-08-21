import {
  createConstructionCategory,
  createConstructionSubcategory,
  deleteConstructionCategory,
  deleteConstructionSubcategory,
  getConstructionCategoryById,
  getConstructionStageById,
  getConstructionSubcategoryById,
  getConstructionTreeByProjectId,
  getCostEngineDataByProjectId,
  getProjectById,
  updateConstructionStage,
} from "../db";
import { calcularEtapa, calcularProgressoConsolidado, STAGE_TEMPLATES, type StageInput } from "../engines/constructionEngine";
import type { CostItem } from "../engines/costEngine";
import type { InsertConstructionStage } from "../../drizzle/schema";

async function requireOwnedProject(projectId: number, userId: number) {
  const project = await getProjectById(projectId, userId);
  if (!project) {
    throw new Error("Projeto não encontrado ou não pertence ao usuário");
  }
  return project;
}

function buildStagesForTemplate(templateKey: string, valorPrevistoTotal: number): Omit<InsertConstructionStage, "subcategoryId" | "id">[] {
  const nomesEtapas = STAGE_TEMPLATES[templateKey];
  if (!nomesEtapas) {
    throw new Error(`Template de etapas "${templateKey}" não existe. Opções: ${Object.keys(STAGE_TEMPLATES).join(", ")}`);
  }
  const valorPorEtapa = valorPrevistoTotal / nomesEtapas.length;
  return nomesEtapas.map((nome, i) => ({
    nome,
    ordem: i,
    pesoPercentual: "0",
    valorPrevisto: String(valorPorEtapa),
    percentualPrevisto: "100",
    percentualExecutado: "0",
    status: "nao_iniciado" as const,
  }));
}

export async function createCategory(projectId: number, userId: number, nome: string, ordem?: number) {
  await requireOwnedProject(projectId, userId);
  return createConstructionCategory({ projectId, nome, ordem: ordem ?? 0 });
}

export async function removeCategory(categoryId: number, projectId: number, userId: number) {
  await requireOwnedProject(projectId, userId);
  const category = await getConstructionCategoryById(categoryId);
  if (!category || category.projectId !== projectId) {
    throw new Error("Categoria não encontrada neste projeto");
  }
  await deleteConstructionCategory(categoryId, projectId);
}

/**
 * Cria uma subcategoria com etapas geradas a partir de um template padrão
 * (spec seção 4) e valor previsto informado manualmente — para obras que
 * não têm correspondência direta no orçamento do CostEngine (ex.: um
 * "Vestiário" novo, fora do escopo de infraestrutura do loteamento).
 */
export async function createSubcategoryManual(
  categoryId: number,
  projectId: number,
  userId: number,
  input: { nome: string; templateKey: string; valorPrevistoTotal: number; ordem?: number }
) {
  await requireOwnedProject(projectId, userId);
  const category = await getConstructionCategoryById(categoryId);
  if (!category || category.projectId !== projectId) {
    throw new Error("Categoria não encontrada neste projeto");
  }

  const stages = buildStagesForTemplate(input.templateKey, input.valorPrevistoTotal);
  return createConstructionSubcategory(
    { categoryId, nome: input.nome, templateKey: input.templateKey, ordem: input.ordem ?? 0 },
    stages
  );
}

/**
 * Cria uma subcategoria puxando o "Valor Previsto" direto de um grupo já
 * calculado pelo CostEngine (spec seção 4: "não ser redigitado do zero
 * quando a obra começa") — soma os itens ativos daquele grupo e distribui
 * entre as etapas do template escolhido.
 */
export async function createSubcategoryFromCostEngine(
  categoryId: number,
  projectId: number,
  userId: number,
  input: { nome: string; templateKey: string; grupo: string; ordem?: number }
) {
  await requireOwnedProject(projectId, userId);
  const category = await getConstructionCategoryById(categoryId);
  if (!category || category.projectId !== projectId) {
    throw new Error("Categoria não encontrada neste projeto");
  }

  const cost = await getCostEngineDataByProjectId(projectId);
  if (!cost) {
    throw new Error("Vínculo com CostEngine requer que o CostEngine já tenha sido calculado para este projeto");
  }
  const itens = (cost.detalhamentoItens as CostItem[] | null) ?? [];
  const valorPrevistoTotal = itens.filter((i) => i.ativo && i.grupo === input.grupo).reduce((s, i) => s + i.total, 0);
  if (valorPrevistoTotal <= 0) {
    throw new Error(`Nenhum item ativo do CostEngine encontrado no grupo "${input.grupo}"`);
  }

  const stages = buildStagesForTemplate(input.templateKey, valorPrevistoTotal);
  return createConstructionSubcategory(
    { categoryId, nome: input.nome, templateKey: input.templateKey, origemCostEngineGrupo: input.grupo, ordem: input.ordem ?? 0 },
    stages
  );
}

export async function removeSubcategory(subcategoryId: number, projectId: number, userId: number) {
  await requireOwnedProject(projectId, userId);
  const subcategory = await getConstructionSubcategoryById(subcategoryId);
  if (!subcategory) throw new Error("Subcategoria não encontrada");
  const category = await getConstructionCategoryById(subcategory.categoryId);
  if (!category || category.projectId !== projectId) {
    throw new Error("Subcategoria não encontrada neste projeto");
  }
  await deleteConstructionSubcategory(subcategoryId);
}

/** Atualização periódica de campo (spec: "% executado (input manual, periódico)"), mais status/peso/observações. */
export async function updateStage(
  stageId: number,
  projectId: number,
  userId: number,
  data: {
    percentualExecutado?: number;
    pesoPercentual?: number;
    status?: "nao_iniciado" | "em_execucao" | "concluido";
    observacoes?: string | null;
  }
) {
  await requireOwnedProject(projectId, userId);
  const stage = await getConstructionStageById(stageId);
  if (!stage) throw new Error("Etapa não encontrada");
  const subcategory = await getConstructionSubcategoryById(stage.subcategoryId);
  if (!subcategory) throw new Error("Etapa não encontrada");
  const category = await getConstructionCategoryById(subcategory.categoryId);
  if (!category || category.projectId !== projectId) {
    throw new Error("Etapa não encontrada neste projeto");
  }

  if (data.percentualExecutado !== undefined && (data.percentualExecutado < 0 || data.percentualExecutado > 100)) {
    throw new Error("percentualExecutado deve estar entre 0 e 100");
  }

  return updateConstructionStage(stageId, {
    percentualExecutado: data.percentualExecutado !== undefined ? String(data.percentualExecutado) : undefined,
    pesoPercentual: data.pesoPercentual !== undefined ? String(data.pesoPercentual) : undefined,
    status: data.status,
    observacoes: data.observacoes,
  });
}

export interface DashboardObraCategoria {
  categoriaId: number;
  nome: string;
  valorPrevistoTotal: number;
  valorExecutadoTotal: number;
  progressoPercentual: number;
}

export interface DashboardObraSubcategoria {
  subcategoriaId: number;
  categoriaId: number;
  nome: string;
  valorPrevistoTotal: number;
  valorExecutadoTotal: number;
  progressoPercentual: number;
}

export interface DashboardObra {
  progressoGeralPercentual: number;
  valorPrevistoTotal: number;
  valorExecutadoTotal: number;
  saldoAExecutarTotal: number;
  porCategoria: DashboardObraCategoria[];
  porSubcategoria: DashboardObraSubcategoria[];
}

/**
 * Dashboard consolidado (spec seção 4): progresso geral, valor
 * executado/saldo, resumo por categoria (peso total × % realizado) e por
 * subcategoria (para o gráfico detalhado de progresso).
 */
export async function getConstructionDashboard(projectId: number, userId: number): Promise<DashboardObra> {
  await requireOwnedProject(projectId, userId);
  const tree = await getConstructionTreeByProjectId(projectId);

  const allStages: StageInput[] = tree.flatMap((c) =>
    c.subcategories.flatMap((s) =>
      s.stages.map((e) => ({
        id: e.id,
        nome: e.nome,
        pesoPercentual: Number(e.pesoPercentual),
        valorPrevisto: Number(e.valorPrevisto),
        percentualPrevisto: Number(e.percentualPrevisto),
        percentualExecutado: Number(e.percentualExecutado),
        status: e.status,
      }))
    )
  );

  const geral = calcularProgressoConsolidado(allStages);

  const porCategoria: DashboardObraCategoria[] = tree.map((categoria) => {
    const stagesCategoria: StageInput[] = categoria.subcategories.flatMap((s) =>
      s.stages.map((e) => ({
        id: e.id,
        nome: e.nome,
        pesoPercentual: Number(e.pesoPercentual),
        valorPrevisto: Number(e.valorPrevisto),
        percentualPrevisto: Number(e.percentualPrevisto),
        percentualExecutado: Number(e.percentualExecutado),
        status: e.status,
      }))
    );
    const progresso = calcularProgressoConsolidado(stagesCategoria);
    return {
      categoriaId: categoria.id,
      nome: categoria.nome,
      valorPrevistoTotal: progresso.valorPrevistoTotal,
      valorExecutadoTotal: progresso.valorExecutadoTotal,
      progressoPercentual: progresso.progressoPercentual,
    };
  });

  const porSubcategoria: DashboardObraSubcategoria[] = tree.flatMap((categoria) =>
    categoria.subcategories.map((subcategoria) => {
      const stagesSub: StageInput[] = subcategoria.stages.map((e) => ({
        id: e.id,
        nome: e.nome,
        pesoPercentual: Number(e.pesoPercentual),
        valorPrevisto: Number(e.valorPrevisto),
        percentualPrevisto: Number(e.percentualPrevisto),
        percentualExecutado: Number(e.percentualExecutado),
        status: e.status,
      }));
      const progresso = calcularProgressoConsolidado(stagesSub);
      return {
        subcategoriaId: subcategoria.id,
        categoriaId: categoria.id,
        nome: subcategoria.nome,
        valorPrevistoTotal: progresso.valorPrevistoTotal,
        valorExecutadoTotal: progresso.valorExecutadoTotal,
        progressoPercentual: progresso.progressoPercentual,
      };
    })
  );

  return {
    progressoGeralPercentual: geral.progressoPercentual,
    valorPrevistoTotal: geral.valorPrevistoTotal,
    valorExecutadoTotal: geral.valorExecutadoTotal,
    saldoAExecutarTotal: geral.saldoAExecutarTotal,
    porCategoria,
    porSubcategoria,
  };
}

export async function getConstructionTree(projectId: number, userId: number) {
  await requireOwnedProject(projectId, userId);
  const tree = await getConstructionTreeByProjectId(projectId);
  return tree.map((categoria) => ({
    ...categoria,
    subcategories: categoria.subcategories.map((subcategoria) => ({
      ...subcategoria,
      stages: subcategoria.stages.map((stage) =>
        calcularEtapa({
          id: stage.id,
          nome: stage.nome,
          pesoPercentual: Number(stage.pesoPercentual),
          valorPrevisto: Number(stage.valorPrevisto),
          percentualPrevisto: Number(stage.percentualPrevisto),
          percentualExecutado: Number(stage.percentualExecutado),
          status: stage.status,
        })
      ),
    })),
  }));
}
