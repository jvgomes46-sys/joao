import { eq, and, inArray } from "drizzle-orm";
import { drizzle } from "drizzle-orm/mysql2";
import {
  InsertUser,
  users,
  projects,
  InsertProject,
  geoEngineData,
  InsertGeoEngineData,
  costEngineData,
  InsertCostEngineData,
  salesEngineData,
  InsertSalesEngineData,
  financeEngineData,
  InsertFinanceEngineData,
  taxEngineData,
  InsertTaxEngineData,
  scenarios,
  InsertScenario,
  partnershipAnalysis,
  InsertPartnershipAnalysis,
  approvals,
  InsertApproval,
  constructionCategories,
  InsertConstructionCategory,
  constructionSubcategories,
  InsertConstructionSubcategory,
  constructionStages,
  InsertConstructionStage,
} from "../drizzle/schema";
import { ENV } from './_core/env';

let _db: ReturnType<typeof drizzle> | null = null;

/**
 * MariaDB (usada em dev/CI) reporta colunas JSON como BLOB em vez do tipo
 * JSON real do MySQL 8 — o mysql2 só auto-parseia quando o driver reporta
 * tipo JSON, então em MariaDB o valor chega como string crua. Em produção
 * (MySQL real) o valor já vem parseado e esta função é um passthrough.
 */
export function parseJsonColumn<T>(value: T | string | null | undefined): T | null {
  if (value === null || value === undefined) return null;
  if (typeof value !== "string") return value;
  return JSON.parse(value) as T;
}

// Lazily create the drizzle instance so local tooling can run without a DB.
export async function getDb() {
  if (!_db && process.env.DATABASE_URL) {
    try {
      _db = drizzle(process.env.DATABASE_URL);
    } catch (error) {
      console.warn("[Database] Failed to connect:", error);
      _db = null;
    }
  }
  return _db;
}

export async function upsertUser(user: InsertUser): Promise<void> {
  if (!user.openId) {
    throw new Error("User openId is required for upsert");
  }

  const db = await getDb();
  if (!db) {
    console.warn("[Database] Cannot upsert user: database not available");
    return;
  }

  try {
    const values: InsertUser = {
      openId: user.openId,
    };
    const updateSet: Record<string, unknown> = {};

    const textFields = ["name", "email", "loginMethod"] as const;
    type TextField = (typeof textFields)[number];

    const assignNullable = (field: TextField) => {
      const value = user[field];
      if (value === undefined) return;
      const normalized = value ?? null;
      values[field] = normalized;
      updateSet[field] = normalized;
    };

    textFields.forEach(assignNullable);

    if (user.lastSignedIn !== undefined) {
      values.lastSignedIn = user.lastSignedIn;
      updateSet.lastSignedIn = user.lastSignedIn;
    }
    if (user.role !== undefined) {
      values.role = user.role;
      updateSet.role = user.role;
    } else if (user.openId === ENV.ownerOpenId) {
      values.role = 'admin';
      updateSet.role = 'admin';
    }

    if (!values.lastSignedIn) {
      values.lastSignedIn = new Date();
    }

    if (Object.keys(updateSet).length === 0) {
      updateSet.lastSignedIn = new Date();
    }

    await db.insert(users).values(values).onDuplicateKeyUpdate({
      set: updateSet,
    });
  } catch (error) {
    console.error("[Database] Failed to upsert user:", error);
    throw error;
  }
}

export async function getUserByOpenId(openId: string) {
  const db = await getDb();
  if (!db) {
    console.warn("[Database] Cannot get user: database not available");
    return undefined;
  }

  const result = await db.select().from(users).where(eq(users.openId, openId)).limit(1);

  return result.length > 0 ? result[0] : undefined;
}

// Projects queries
export async function getProjectsByUserId(userId: number) {
  const db = await getDb();
  if (!db) {
    console.warn("[Database] Cannot get projects: database not available");
    return [];
  }

  try {
    const result = await db
      .select()
      .from(projects)
      .where(eq(projects.userId, userId))
      .orderBy(projects.updatedAt);
    return result;
  } catch (error) {
    console.error("[Database] Failed to get projects:", error);
    throw error;
  }
}

export async function getProjectById(projectId: number, userId: number) {
  const db = await getDb();
  if (!db) {
    console.warn("[Database] Cannot get project: database not available");
    return undefined;
  }

  try {
    const result = await db
      .select()
      .from(projects)
      .where(and(eq(projects.id, projectId), eq(projects.userId, userId)))
      .limit(1);
    return result.length > 0 ? result[0] : undefined;
  } catch (error) {
    console.error("[Database] Failed to get project:", error);
    throw error;
  }
}

export async function createProject(data: InsertProject) {
  const db = await getDb();
  if (!db) {
    console.warn("[Database] Cannot create project: database not available");
    return undefined;
  }

  try {
    const [result] = await db.insert(projects).values(data);
    const insertId = (result as { insertId: number }).insertId;
    const [created] = await db.select().from(projects).where(eq(projects.id, insertId)).limit(1);
    return created;
  } catch (error) {
    console.error("[Database] Failed to create project:", error);
    throw error;
  }
}

export async function updateProject(projectId: number, userId: number, data: Partial<InsertProject>) {
  const db = await getDb();
  if (!db) {
    console.warn("[Database] Cannot update project: database not available");
    return undefined;
  }

  try {
    const result = await db
      .update(projects)
      .set(data)
      .where(and(eq(projects.id, projectId), eq(projects.userId, userId)));
    return result;
  } catch (error) {
    console.error("[Database] Failed to update project:", error);
    throw error;
  }
}

export async function deleteProject(projectId: number, userId: number) {
  const db = await getDb();
  if (!db) {
    console.warn("[Database] Cannot delete project: database not available");
    return undefined;
  }

  try {
    const result = await db
      .delete(projects)
      .where(and(eq(projects.id, projectId), eq(projects.userId, userId)));
    return result;
  } catch (error) {
    console.error("[Database] Failed to delete project:", error);
    throw error;
  }
}

/**
 * Fábrica de queries get/upsert "um registro por projeto" — todas as tabelas
 * de dados de engine (geo/cost/sales/finance/tax) seguem o mesmo padrão:
 * select por projectId com parse de colunas JSON, e upsert (update se já
 * existe, senão insert) que devolve o registro persistido.
 */
function createEngineDataAccessors<
  TTable extends { projectId: any },
  TRow extends Record<string, unknown>,
  TInsert extends { projectId: number }
>(
  table: TTable,
  label: string,
  jsonColumns: (keyof TRow & keyof TInsert)[]
) {
  async function getByProjectId(projectId: number): Promise<(TRow & Record<string, unknown>) | undefined> {
    const db = await getDb();
    if (!db) {
      console.warn(`[Database] Cannot get ${label} data: database not available`);
      return undefined;
    }
    const result = await db.select().from(table as any).where(eq((table as any).projectId, projectId)).limit(1);
    if (result.length === 0) return undefined;
    const row = { ...(result[0] as TRow) };
    for (const col of jsonColumns) {
      (row as Record<string, unknown>)[col as string] = parseJsonColumn((row as Record<string, unknown>)[col as string] as never);
    }
    return row;
  }

  async function upsert(projectId: number, data: Omit<TInsert, "projectId" | "id">) {
    const db = await getDb();
    if (!db) throw new Error(`[Database] Cannot persist ${label} data: database not available`);

    const existing = await getByProjectId(projectId);
    if (existing) {
      await db.update(table as any).set(data as any).where(eq((table as any).projectId, projectId));
    } else {
      await db.insert(table as any).values({ ...(data as any), projectId });
    }
    return getByProjectId(projectId);
  }

  return { getByProjectId, upsert };
}

// GeoEngine data queries — um registro por projeto, sobrescrito a cada recálculo
const geoEngineAccessors = createEngineDataAccessors<typeof geoEngineData, any, InsertGeoEngineData>(geoEngineData, "geo engine", [
  "indicesUrbanisticos",
  "checklistGRAProhab",
]);
export const getGeoEngineDataByProjectId = geoEngineAccessors.getByProjectId;
export async function upsertGeoEngineData(projectId: number, data: Omit<InsertGeoEngineData, "projectId" | "id">) {
  return geoEngineAccessors.upsert(projectId, data);
}

// CostEngine data — um registro por projeto, sobrescrito a cada gravação
// (dados brutos coletados pelo Wizard; o CostEngine parametrizado ainda não
// existe — ver Etapa 6 da spec. Nenhuma gravação aqui roda em fallback
// silencioso: se o banco não estiver disponível, a mutation falha alto.)
const costEngineAccessors = createEngineDataAccessors<typeof costEngineData, any, InsertCostEngineData>(costEngineData, "cost engine", [
  "cronogramaFisico",
  "detalhamentoItens",
]);
export const getCostEngineDataByProjectId = costEngineAccessors.getByProjectId;
export async function upsertCostEngineData(projectId: number, data: Omit<InsertCostEngineData, "projectId" | "id">) {
  return costEngineAccessors.upsert(projectId, data);
}

// SalesEngine data
const salesEngineAccessors = createEngineDataAccessors<typeof salesEngineData, any, InsertSalesEngineData>(salesEngineData, "sales engine", [
  "curvaVendas",
  "tabelasFinanciamento",
]);
export const getSalesEngineDataByProjectId = salesEngineAccessors.getByProjectId;
export async function upsertSalesEngineData(projectId: number, data: Omit<InsertSalesEngineData, "projectId" | "id">) {
  return salesEngineAccessors.upsert(projectId, data);
}

// FinanceEngine data
const financeEngineAccessors = createEngineDataAccessors<typeof financeEngineData, any, InsertFinanceEngineData>(
  financeEngineData,
  "finance engine",
  ["fluxoCaixaMensal", "alertasConsistencia"]
);
export const getFinanceEngineDataByProjectId = financeEngineAccessors.getByProjectId;
export async function upsertFinanceEngineData(projectId: number, data: Omit<InsertFinanceEngineData, "projectId" | "id">) {
  return financeEngineAccessors.upsert(projectId, data);
}

// TaxEngine data
const taxEngineAccessors = createEngineDataAccessors<typeof taxEngineData, any, InsertTaxEngineData>(taxEngineData, "tax engine", [
  "impactoReforma",
]);
export const getTaxEngineDataByProjectId = taxEngineAccessors.getByProjectId;
export async function upsertTaxEngineData(projectId: number, data: Omit<InsertTaxEngineData, "projectId" | "id">) {
  return taxEngineAccessors.upsert(projectId, data);
}

// PartnershipAnalysis data — um registro por projeto, sobrescrito a cada recálculo
const partnershipAnalysisAccessors = createEngineDataAccessors<typeof partnershipAnalysis, any, InsertPartnershipAnalysis>(
  partnershipAnalysis,
  "partnership analysis",
  ["resultado", "matrizSensibilidade1", "matrizSensibilidade2"]
);
export const getPartnershipAnalysisByProjectId = partnershipAnalysisAccessors.getByProjectId;
export async function upsertPartnershipAnalysis(projectId: number, data: Omit<InsertPartnershipAnalysis, "projectId" | "id">) {
  return partnershipAnalysisAccessors.upsert(projectId, data);
}

// Scenarios — múltiplos registros por projeto (um por cenário). Recalcular
// substitui o conjunto inteiro, não acumula execuções antigas.
export async function getScenariosByProjectId(projectId: number) {
  const db = await getDb();
  if (!db) {
    console.warn("[Database] Cannot get scenarios: database not available");
    return [];
  }
  const rows = await db.select().from(scenarios).where(eq(scenarios.projectId, projectId));
  return rows.map((row) => ({ ...row, resultados: parseJsonColumn(row.resultados) }));
}

export async function replaceScenarios(projectId: number, data: Omit<InsertScenario, "projectId" | "id">[]) {
  const db = await getDb();
  if (!db) throw new Error("[Database] Cannot persist scenarios: database not available");

  await db.delete(scenarios).where(eq(scenarios.projectId, projectId));
  if (data.length > 0) {
    await db.insert(scenarios).values(data.map((row) => ({ ...row, projectId })));
  }
  return getScenariosByProjectId(projectId);
}

// Approvals (FASE 2 — spec seção 3): checklist de acompanhamento por
// órgão/concessionária. Diferente das tabelas *_engine_data, tem N linhas
// por projeto e cada linha é editada individualmente ao longo do processo
// real (não é um recálculo que substitui tudo).
export async function getApprovalsByProjectId(projectId: number) {
  const db = await getDb();
  if (!db) {
    console.warn("[Database] Cannot get approvals: database not available");
    return [];
  }
  return db.select().from(approvals).where(eq(approvals.projectId, projectId));
}

/** Insere o checklist inicial. Não seeda de novo se o projeto já tiver itens — evita duplicar ao reabrir o wizard/recalcular o GeoEngine. */
export async function seedApprovalsIfEmpty(projectId: number, items: Omit<InsertApproval, "projectId" | "id">[]) {
  const db = await getDb();
  if (!db) throw new Error("[Database] Cannot seed approvals: database not available");

  const existing = await db.select({ id: approvals.id }).from(approvals).where(eq(approvals.projectId, projectId)).limit(1);
  if (existing.length > 0) {
    return getApprovalsByProjectId(projectId);
  }
  if (items.length > 0) {
    await db.insert(approvals).values(items.map((item) => ({ ...item, projectId })));
  }
  return getApprovalsByProjectId(projectId);
}

export async function createApproval(projectId: number, data: Omit<InsertApproval, "projectId" | "id">) {
  const db = await getDb();
  if (!db) throw new Error("[Database] Cannot create approval: database not available");
  const [result] = await db.insert(approvals).values({ ...data, projectId });
  const insertId = (result as { insertId: number }).insertId;
  const [row] = await db.select().from(approvals).where(eq(approvals.id, insertId)).limit(1);
  return row;
}

export async function updateApproval(
  id: number,
  projectId: number,
  data: Partial<Omit<InsertApproval, "projectId" | "id">>
) {
  const db = await getDb();
  if (!db) throw new Error("[Database] Cannot update approval: database not available");
  await db.update(approvals).set(data).where(and(eq(approvals.id, id), eq(approvals.projectId, projectId)));
  const [row] = await db.select().from(approvals).where(eq(approvals.id, id)).limit(1);
  return row;
}

export async function deleteApproval(id: number, projectId: number) {
  const db = await getDb();
  if (!db) throw new Error("[Database] Cannot delete approval: database not available");
  await db.delete(approvals).where(and(eq(approvals.id, id), eq(approvals.projectId, projectId)));
}

// Construction tracking (FASE 3 — spec seção 4): EAP de 3 níveis
// (Categoria → Subcategoria → Etapa). Diferente das *_engine_data, é uma
// árvore com N linhas por nível, editada individualmente ao longo da obra.

export async function getConstructionTreeByProjectId(projectId: number) {
  const db = await getDb();
  if (!db) {
    console.warn("[Database] Cannot get construction tree: database not available");
    return [];
  }
  const categories = await db
    .select()
    .from(constructionCategories)
    .where(eq(constructionCategories.projectId, projectId));
  if (categories.length === 0) return [];

  const categoryIds = categories.map((c) => c.id);
  const subcategories = await db
    .select()
    .from(constructionSubcategories)
    .where(inArray(constructionSubcategories.categoryId, categoryIds));
  const subcategoryIds = subcategories.map((s) => s.id);

  const stages =
    subcategoryIds.length > 0
      ? await db.select().from(constructionStages).where(inArray(constructionStages.subcategoryId, subcategoryIds))
      : [];

  return categories
    .sort((a, b) => a.ordem - b.ordem)
    .map((category) => ({
      ...category,
      subcategories: subcategories
        .filter((s) => s.categoryId === category.id)
        .sort((a, b) => a.ordem - b.ordem)
        .map((subcategory) => ({
          ...subcategory,
          stages: stages.filter((s) => s.subcategoryId === subcategory.id).sort((a, b) => a.ordem - b.ordem),
        })),
    }));
}

export async function createConstructionCategory(data: InsertConstructionCategory) {
  const db = await getDb();
  if (!db) throw new Error("[Database] Cannot create construction category: database not available");
  const [result] = await db.insert(constructionCategories).values(data);
  const insertId = (result as { insertId: number }).insertId;
  const [row] = await db.select().from(constructionCategories).where(eq(constructionCategories.id, insertId)).limit(1);
  return row;
}

export async function deleteConstructionCategory(id: number, projectId: number) {
  const db = await getDb();
  if (!db) throw new Error("[Database] Cannot delete construction category: database not available");
  const subcats = await db.select({ id: constructionSubcategories.id }).from(constructionSubcategories).where(eq(constructionSubcategories.categoryId, id));
  for (const sub of subcats) {
    await db.delete(constructionStages).where(eq(constructionStages.subcategoryId, sub.id));
  }
  await db.delete(constructionSubcategories).where(eq(constructionSubcategories.categoryId, id));
  await db.delete(constructionCategories).where(and(eq(constructionCategories.id, id), eq(constructionCategories.projectId, projectId)));
}

export async function createConstructionSubcategory(
  data: InsertConstructionSubcategory,
  stages: Omit<InsertConstructionStage, "subcategoryId" | "id">[]
) {
  const db = await getDb();
  if (!db) throw new Error("[Database] Cannot create construction subcategory: database not available");
  const [result] = await db.insert(constructionSubcategories).values(data);
  const insertId = (result as { insertId: number }).insertId;
  if (stages.length > 0) {
    await db.insert(constructionStages).values(stages.map((s) => ({ ...s, subcategoryId: insertId })));
  }
  const [row] = await db.select().from(constructionSubcategories).where(eq(constructionSubcategories.id, insertId)).limit(1);
  return row;
}

export async function deleteConstructionSubcategory(id: number) {
  const db = await getDb();
  if (!db) throw new Error("[Database] Cannot delete construction subcategory: database not available");
  await db.delete(constructionStages).where(eq(constructionStages.subcategoryId, id));
  await db.delete(constructionSubcategories).where(eq(constructionSubcategories.id, id));
}

export async function updateConstructionStage(
  id: number,
  data: Partial<Omit<InsertConstructionStage, "subcategoryId" | "id">>
) {
  const db = await getDb();
  if (!db) throw new Error("[Database] Cannot update construction stage: database not available");
  await db.update(constructionStages).set(data).where(eq(constructionStages.id, id));
  const [row] = await db.select().from(constructionStages).where(eq(constructionStages.id, id)).limit(1);
  return row;
}

export async function getConstructionStageById(id: number) {
  const db = await getDb();
  if (!db) return undefined;
  const [row] = await db.select().from(constructionStages).where(eq(constructionStages.id, id)).limit(1);
  return row;
}

export async function getConstructionSubcategoryById(id: number) {
  const db = await getDb();
  if (!db) return undefined;
  const [row] = await db.select().from(constructionSubcategories).where(eq(constructionSubcategories.id, id)).limit(1);
  return row;
}

export async function getConstructionCategoryById(id: number) {
  const db = await getDb();
  if (!db) return undefined;
  const [row] = await db.select().from(constructionCategories).where(eq(constructionCategories.id, id)).limit(1);
  return row;
}

// TODO: add feature queries here as your schema grows.
