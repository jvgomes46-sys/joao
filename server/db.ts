import { eq, and } from "drizzle-orm";
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

// GeoEngine data queries — um registro por projeto, sobrescrito a cada recálculo
export async function getGeoEngineDataByProjectId(projectId: number) {
  const db = await getDb();
  if (!db) {
    console.warn("[Database] Cannot get geo engine data: database not available");
    return undefined;
  }

  const result = await db.select().from(geoEngineData).where(eq(geoEngineData.projectId, projectId)).limit(1);
  if (result.length === 0) return undefined;
  return {
    ...result[0],
    indicesUrbanisticos: parseJsonColumn(result[0].indicesUrbanisticos),
    checklistGRAProhab: parseJsonColumn(result[0].checklistGRAProhab),
  };
}

export async function upsertGeoEngineData(projectId: number, data: Omit<InsertGeoEngineData, "projectId" | "id">) {
  const db = await getDb();
  if (!db) {
    throw new Error("[Database] Cannot persist GeoEngine result: database not available");
  }

  const existing = await getGeoEngineDataByProjectId(projectId);

  if (existing) {
    await db.update(geoEngineData).set(data).where(eq(geoEngineData.projectId, projectId));
  } else {
    await db.insert(geoEngineData).values({ ...data, projectId });
  }

  return getGeoEngineDataByProjectId(projectId);
}

// CostEngine data — um registro por projeto, sobrescrito a cada gravação
// (dados brutos coletados pelo Wizard; o CostEngine parametrizado ainda não
// existe — ver Etapa 6 da spec. Nenhuma gravação aqui roda em fallback
// silencioso: se o banco não estiver disponível, a mutation falha alto.)
export async function getCostEngineDataByProjectId(projectId: number) {
  const db = await getDb();
  if (!db) {
    console.warn("[Database] Cannot get cost engine data: database not available");
    return undefined;
  }
  const result = await db.select().from(costEngineData).where(eq(costEngineData.projectId, projectId)).limit(1);
  if (result.length === 0) return undefined;
  return {
    ...result[0],
    cronogramaFisico: parseJsonColumn(result[0].cronogramaFisico),
    detalhamentoItens: parseJsonColumn(result[0].detalhamentoItens),
  };
}

export async function upsertCostEngineData(projectId: number, data: Omit<InsertCostEngineData, "projectId" | "id">) {
  const db = await getDb();
  if (!db) throw new Error("[Database] Cannot persist CostEngine data: database not available");

  const existing = await getCostEngineDataByProjectId(projectId);
  if (existing) {
    await db.update(costEngineData).set(data).where(eq(costEngineData.projectId, projectId));
  } else {
    await db.insert(costEngineData).values({ ...data, projectId });
  }
  return getCostEngineDataByProjectId(projectId);
}

// SalesEngine data
export async function getSalesEngineDataByProjectId(projectId: number) {
  const db = await getDb();
  if (!db) {
    console.warn("[Database] Cannot get sales engine data: database not available");
    return undefined;
  }
  const result = await db.select().from(salesEngineData).where(eq(salesEngineData.projectId, projectId)).limit(1);
  if (result.length === 0) return undefined;
  return {
    ...result[0],
    curvaVendas: parseJsonColumn(result[0].curvaVendas),
    tabelasFinanciamento: parseJsonColumn(result[0].tabelasFinanciamento),
  };
}

export async function upsertSalesEngineData(projectId: number, data: Omit<InsertSalesEngineData, "projectId" | "id">) {
  const db = await getDb();
  if (!db) throw new Error("[Database] Cannot persist SalesEngine data: database not available");

  const existing = await getSalesEngineDataByProjectId(projectId);
  if (existing) {
    await db.update(salesEngineData).set(data).where(eq(salesEngineData.projectId, projectId));
  } else {
    await db.insert(salesEngineData).values({ ...data, projectId });
  }
  return getSalesEngineDataByProjectId(projectId);
}

// FinanceEngine data
export async function getFinanceEngineDataByProjectId(projectId: number) {
  const db = await getDb();
  if (!db) {
    console.warn("[Database] Cannot get finance engine data: database not available");
    return undefined;
  }
  const result = await db.select().from(financeEngineData).where(eq(financeEngineData.projectId, projectId)).limit(1);
  if (result.length === 0) return undefined;
  return {
    ...result[0],
    fluxoCaixaMensal: parseJsonColumn(result[0].fluxoCaixaMensal),
    alertasConsistencia: parseJsonColumn(result[0].alertasConsistencia),
  };
}

export async function upsertFinanceEngineData(projectId: number, data: Omit<InsertFinanceEngineData, "projectId" | "id">) {
  const db = await getDb();
  if (!db) throw new Error("[Database] Cannot persist FinanceEngine data: database not available");

  const existing = await getFinanceEngineDataByProjectId(projectId);
  if (existing) {
    await db.update(financeEngineData).set(data).where(eq(financeEngineData.projectId, projectId));
  } else {
    await db.insert(financeEngineData).values({ ...data, projectId });
  }
  return getFinanceEngineDataByProjectId(projectId);
}

// TaxEngine data
export async function getTaxEngineDataByProjectId(projectId: number) {
  const db = await getDb();
  if (!db) {
    console.warn("[Database] Cannot get tax engine data: database not available");
    return undefined;
  }
  const result = await db.select().from(taxEngineData).where(eq(taxEngineData.projectId, projectId)).limit(1);
  if (result.length === 0) return undefined;
  return { ...result[0], impactoReforma: parseJsonColumn(result[0].impactoReforma) };
}

export async function upsertTaxEngineData(projectId: number, data: Omit<InsertTaxEngineData, "projectId" | "id">) {
  const db = await getDb();
  if (!db) throw new Error("[Database] Cannot persist TaxEngine data: database not available");

  const existing = await getTaxEngineDataByProjectId(projectId);
  if (existing) {
    await db.update(taxEngineData).set(data).where(eq(taxEngineData.projectId, projectId));
  } else {
    await db.insert(taxEngineData).values({ ...data, projectId });
  }
  return getTaxEngineDataByProjectId(projectId);
}

// TODO: add feature queries here as your schema grows.
