import { eq } from "drizzle-orm";
import type { MySqlTable } from "drizzle-orm/mysql-core";
import { getDb } from "../db";
import {
  configLegislation,
  configUnitCosts,
  configCostParameters,
  configFinancialIndices,
  configTypologyMatrix,
  configStandardTimelines,
  configTaxRegimes,
} from "../../drizzle/schema";

/**
 * CRUD administrativo genérico para o Módulo de Configuração (spec seção
 * 5): perfil admin edita, o resto do sistema só lê (spec 5.2). Genérico em
 * vez de bespoke por tabela porque as 7 tabelas de configuração têm o mesmo
 * formato de operação (listar/criar/editar/apagar uma linha por id) — só
 * as colunas mudam, e essas já são tipadas pelo schema do Drizzle.
 */
export const CONFIG_TABLES = {
  legislation: configLegislation,
  unit_costs: configUnitCosts,
  cost_parameters: configCostParameters,
  financial_indices: configFinancialIndices,
  typology_matrix: configTypologyMatrix,
  standard_timelines: configStandardTimelines,
  tax_regimes: configTaxRegimes,
} as const;

export type ConfigTableName = keyof typeof CONFIG_TABLES;

function requireAdmin(role: string) {
  if (role !== "admin") {
    throw new Error("Apenas administradores podem editar o Módulo de Configuração");
  }
}

function getIdColumn(table: MySqlTable): any {
  // Toda tabela de configuração usa `id` autoincrement como PK (ver schema.ts).
  return (table as unknown as { id: unknown }).id;
}

export async function listConfigRows(tableName: ConfigTableName, userRole: string) {
  requireAdmin(userRole);
  const db = await getDb();
  if (!db) throw new Error("Banco de dados não disponível");
  const table = CONFIG_TABLES[tableName];
  return db.select().from(table as any);
}

export async function createConfigRow(tableName: ConfigTableName, userRole: string, data: Record<string, unknown>) {
  requireAdmin(userRole);
  const db = await getDb();
  if (!db) throw new Error("Banco de dados não disponível");
  const table = CONFIG_TABLES[tableName];
  const { id: _ignored, createdAt: _c, updatedAt: _u, ...rest } = data;
  await db.insert(table as any).values(rest as any);
  return listConfigRows(tableName, userRole);
}

export async function updateConfigRow(
  tableName: ConfigTableName,
  userRole: string,
  id: number,
  data: Record<string, unknown>
) {
  requireAdmin(userRole);
  const db = await getDb();
  if (!db) throw new Error("Banco de dados não disponível");
  const table = CONFIG_TABLES[tableName];
  const idColumn = getIdColumn(table);
  const { id: _ignored, createdAt: _c, updatedAt: _u, ...rest } = data;
  await db.update(table as any).set(rest as any).where(eq(idColumn, id));
  return listConfigRows(tableName, userRole);
}

export async function deleteConfigRow(tableName: ConfigTableName, userRole: string, id: number) {
  requireAdmin(userRole);
  const db = await getDb();
  if (!db) throw new Error("Banco de dados não disponível");
  const table = CONFIG_TABLES[tableName];
  const idColumn = getIdColumn(table);
  await db.delete(table as any).where(eq(idColumn, id));
  return listConfigRows(tableName, userRole);
}
