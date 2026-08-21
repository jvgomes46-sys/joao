import { and, desc, eq, lte } from "drizzle-orm";
import {
  configCostParameters,
  configFinancialIndices,
  configLegislation,
  configSnapshots,
  configStandardTimelines,
  configTaxRegimes,
  configTypologyMatrix,
  configUnitCosts,
  InsertConfigSnapshot,
} from "../drizzle/schema";
import { getDb, parseJsonColumn } from "./db";

/**
 * Módulo de Configuração — camada de leitura para os motores de cálculo.
 *
 * Regra geral: toda tabela de configuração é versionada por `dataBase`.
 * "Valor vigente" = a linha com maior `dataBase` que seja <= à data de
 * referência pedida (por padrão, agora). Isso permite recalcular um estudo
 * antigo com os índices vigentes naquela época, se um dia for preciso.
 */

// ---------------------------------------------------------------------------
// A. Legislação municipal/regional, com fallback explícito para o piso federal
// ---------------------------------------------------------------------------

export async function getLegislationForLocation(municipio: string, uf?: string) {
  const db = await getDb();
  if (!db) throw new Error("[Config] Banco de dados não disponível — não é possível ler legislação");

  const rows = await db
    .select()
    .from(configLegislation)
    .where(eq(configLegislation.municipio, municipio))
    .limit(1);

  if (rows.length > 0) {
    return { ...rows[0], regrasArborizacao: parseJsonColumn(rows[0].regrasArborizacao), usedFederalFallback: false };
  }

  const fallbackRows = await db
    .select()
    .from(configLegislation)
    .where(eq(configLegislation.isFederalFallback, true))
    .limit(1);

  if (fallbackRows.length === 0) {
    throw new Error(
      "[Config] Nenhuma legislação cadastrada para o município e nenhum piso federal (isFederalFallback) configurado — rode o seed."
    );
  }

  return { ...fallbackRows[0], regrasArborizacao: parseJsonColumn(fallbackRows[0].regrasArborizacao), usedFederalFallback: true };
}

// ---------------------------------------------------------------------------
// B. Custos unitários (SINAPI) — vigente por grupo+item+região, na data pedida
// ---------------------------------------------------------------------------

export async function getUnitCost(
  grupo: (typeof configUnitCosts.$inferSelect)["grupo"],
  itemCodigo: string,
  regiao: string,
  asOf: Date = new Date()
) {
  const db = await getDb();
  if (!db) throw new Error("[Config] Banco de dados não disponível — não é possível ler custo unitário");

  const rows = await db
    .select()
    .from(configUnitCosts)
    .where(
      and(
        eq(configUnitCosts.grupo, grupo),
        eq(configUnitCosts.itemCodigo, itemCodigo),
        eq(configUnitCosts.regiao, regiao),
        lte(configUnitCosts.dataBase, asOf)
      )
    )
    .orderBy(desc(configUnitCosts.dataBase))
    .limit(1);

  if (rows.length === 0) {
    throw new Error(`[Config] Custo unitário não encontrado: ${grupo}/${itemCodigo} em ${regiao}`);
  }

  return rows[0];
}

export async function getAllCurrentUnitCosts(regiao: string, asOf: Date = new Date()) {
  const db = await getDb();
  if (!db) throw new Error("[Config] Banco de dados não disponível");

  const rows = await db
    .select()
    .from(configUnitCosts)
    .where(and(eq(configUnitCosts.regiao, regiao), lte(configUnitCosts.dataBase, asOf)))
    .orderBy(desc(configUnitCosts.dataBase));

  // mantém só a versão mais recente por itemCodigo
  const latestByItem = new Map<string, (typeof rows)[number]>();
  for (const row of rows) {
    if (!latestByItem.has(row.itemCodigo)) latestByItem.set(row.itemCodigo, row);
  }
  return Array.from(latestByItem.values());
}

export async function getCostParameter(chave: string, regiao = "Nacional", asOf: Date = new Date()) {
  const db = await getDb();
  if (!db) throw new Error("[Config] Banco de dados não disponível");

  const rows = await db
    .select()
    .from(configCostParameters)
    .where(and(eq(configCostParameters.chave, chave), eq(configCostParameters.regiao, regiao), lte(configCostParameters.dataBase, asOf)))
    .orderBy(desc(configCostParameters.dataBase))
    .limit(1);

  if (rows.length === 0) {
    throw new Error(`[Config] Parâmetro de custo não encontrado: ${chave} (${regiao})`);
  }
  return rows[0];
}

// ---------------------------------------------------------------------------
// C. Índices financeiros
// ---------------------------------------------------------------------------

export async function getFinancialIndex(indice: (typeof configFinancialIndices.$inferSelect)["indice"], asOf: Date = new Date()) {
  const db = await getDb();
  if (!db) throw new Error("[Config] Banco de dados não disponível");

  const rows = await db
    .select()
    .from(configFinancialIndices)
    .where(and(eq(configFinancialIndices.indice, indice), lte(configFinancialIndices.dataReferencia, asOf)))
    .orderBy(desc(configFinancialIndices.dataReferencia))
    .limit(1);

  if (rows.length === 0) {
    throw new Error(`[Config] Índice financeiro não encontrado: ${indice}`);
  }
  return rows[0];
}

// ---------------------------------------------------------------------------
// D. Matriz de tipologia
// ---------------------------------------------------------------------------

export async function getTypologyMatrixEntry(
  tipologia: (typeof configTypologyMatrix.$inferSelect)["tipologia"],
  regiao = "Nacional",
  asOf: Date = new Date()
) {
  const db = await getDb();
  if (!db) throw new Error("[Config] Banco de dados não disponível");

  const rows = await db
    .select()
    .from(configTypologyMatrix)
    .where(and(eq(configTypologyMatrix.tipologia, tipologia), eq(configTypologyMatrix.regiao, regiao), lte(configTypologyMatrix.dataBase, asOf)))
    .orderBy(desc(configTypologyMatrix.dataBase))
    .limit(1);

  if (rows.length === 0) {
    throw new Error(`[Config] Matriz de tipologia não encontrada: ${tipologia} (${regiao})`);
  }
  return rows[0];
}

// ---------------------------------------------------------------------------
// E. Prazos padrão
// ---------------------------------------------------------------------------

export async function getPrazoObraPorPorte(areaGlebaM2: number, regiao = "Nacional") {
  const db = await getDb();
  if (!db) throw new Error("[Config] Banco de dados não disponível");

  const rows = await db
    .select()
    .from(configStandardTimelines)
    .where(and(eq(configStandardTimelines.tipo, "prazo_obra_por_porte"), eq(configStandardTimelines.regiao, regiao)));

  const match = rows.find(
    (r) =>
      (r.faixaPorteMin === null || Number(r.faixaPorteMin) <= areaGlebaM2) &&
      (r.faixaPorteMax === null || Number(r.faixaPorteMax) >= areaGlebaM2)
  );

  if (!match) {
    throw new Error(`[Config] Nenhuma faixa de prazo de obra cobre área de ${areaGlebaM2} m² (${regiao})`);
  }
  return match;
}

/** Prazo de aprovação = base + soma dos adicionais cujo gatilho está ativo. */
export async function getPrazoAprovacao(gatilhosAtivos: string[], regiao = "Nacional") {
  const db = await getDb();
  if (!db) throw new Error("[Config] Banco de dados não disponível");

  const baseRows = await db
    .select()
    .from(configStandardTimelines)
    .where(and(eq(configStandardTimelines.tipo, "prazo_aprovacao_base"), eq(configStandardTimelines.regiao, regiao)))
    .limit(1);

  if (baseRows.length === 0) {
    throw new Error(`[Config] Prazo de aprovação base não configurado para ${regiao}`);
  }

  const adicionaisRows = await db
    .select()
    .from(configStandardTimelines)
    .where(and(eq(configStandardTimelines.tipo, "prazo_aprovacao_adicional"), eq(configStandardTimelines.regiao, regiao)));

  const adicionaisAtivos = adicionaisRows.filter((r) => r.gatilho && gatilhosAtivos.includes(r.gatilho));
  const totalAdicionais = adicionaisAtivos.reduce((sum, r) => sum + r.prazoMeses, 0);

  return {
    prazoBaseMeses: baseRows[0].prazoMeses,
    adicionaisAplicados: adicionaisAtivos.map((r) => ({ gatilho: r.gatilho!, meses: r.prazoMeses })),
    prazoTotalMeses: baseRows[0].prazoMeses + totalAdicionais,
  };
}

// ---------------------------------------------------------------------------
// F. Regimes tributários
// ---------------------------------------------------------------------------

export async function getTaxRegime(pais: string, regime: string, asOf: Date = new Date()) {
  const db = await getDb();
  if (!db) throw new Error("[Config] Banco de dados não disponível");

  const rows = await db
    .select()
    .from(configTaxRegimes)
    .where(and(eq(configTaxRegimes.pais, pais), eq(configTaxRegimes.regime, regime), eq(configTaxRegimes.ativo, true), lte(configTaxRegimes.dataBase, asOf)))
    .orderBy(desc(configTaxRegimes.dataBase))
    .limit(1);

  if (rows.length === 0) {
    throw new Error(`[Config] Regime tributário não encontrado: ${regime} (${pais})`);
  }
  return { ...rows[0], aliquotas: parseJsonColumn(rows[0].aliquotas) };
}

export async function listTaxRegimesForCountry(pais: string) {
  const db = await getDb();
  if (!db) throw new Error("[Config] Banco de dados não disponível");

  const rows = await db.select().from(configTaxRegimes).where(and(eq(configTaxRegimes.pais, pais), eq(configTaxRegimes.ativo, true)));
  return rows.map((r) => ({ ...r, aliquotas: parseJsonColumn(r.aliquotas) }));
}

// ---------------------------------------------------------------------------
// 5.3 — Snapshot de configuração por Estudo (auditabilidade)
// ---------------------------------------------------------------------------

/**
 * Grava uma cópia imutável dos valores de configuração usados num cálculo.
 * NUNCA referencia a tabela viva — `snapshotData` é uma cópia de valores.
 * Chame isto ao final de cada engine de cálculo, passando exatamente os
 * valores de configuração que entraram nas fórmulas daquele cálculo.
 */
export async function createConfigSnapshot(input: {
  projectId: number;
  engine: InsertConfigSnapshot["engine"];
  snapshotData: Record<string, unknown>;
  overrides?: Record<string, unknown>;
}) {
  const db = await getDb();
  if (!db) {
    throw new Error(
      "[Config] Banco de dados não disponível — recusando calcular sem persistir snapshot (auditabilidade não é opcional)"
    );
  }

  await db.insert(configSnapshots).values({
    projectId: input.projectId,
    engine: input.engine,
    snapshotData: input.snapshotData,
    overrides: input.overrides ?? null,
  });
}

export async function getLatestConfigSnapshot(projectId: number, engine: InsertConfigSnapshot["engine"]) {
  const db = await getDb();
  if (!db) throw new Error("[Config] Banco de dados não disponível");

  const rows = await db
    .select()
    .from(configSnapshots)
    .where(and(eq(configSnapshots.projectId, projectId), eq(configSnapshots.engine, engine)))
    .orderBy(desc(configSnapshots.calculatedAt))
    .limit(1);

  if (rows.length === 0) return undefined;
  return { ...rows[0], snapshotData: parseJsonColumn(rows[0].snapshotData), overrides: parseJsonColumn(rows[0].overrides) };
}

export async function listConfigSnapshots(projectId: number) {
  const db = await getDb();
  if (!db) throw new Error("[Config] Banco de dados não disponível");

  const rows = await db.select().from(configSnapshots).where(eq(configSnapshots.projectId, projectId)).orderBy(desc(configSnapshots.calculatedAt));
  return rows.map((r) => ({ ...r, snapshotData: parseJsonColumn(r.snapshotData), overrides: parseJsonColumn(r.overrides) }));
}
