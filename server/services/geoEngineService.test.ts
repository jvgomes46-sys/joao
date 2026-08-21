import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { getDb, createProject, getGeoEngineDataByProjectId } from "../db";
import { getLatestConfigSnapshot } from "../config";
import { runGeoEngine } from "./geoEngineService";
import { projects, users } from "../../drizzle/schema";
import { eq } from "drizzle-orm";

describe("GeoEngineService — integração com banco real e Módulo de Configuração", () => {
  let userId: number;
  let projectId: number;

  beforeAll(async () => {
    const db = await getDb();
    if (!db) throw new Error("DATABASE_URL não configurado — teste requer banco real");

    await db.insert(users).values({ openId: "geoengine-test-user", name: "GeoEngine Test" });
    const [user] = await db.select().from(users).where(eq(users.openId, "geoengine-test-user")).limit(1);
    userId = user.id;

    const project = await createProject({
      userId,
      name: "Loteamento Teste GeoEngine",
      type: "loteamento",
      location: "Município Sem Legislação Cadastrada — Teste",
    });
    projectId = project!.id;
  });

  afterAll(async () => {
    const db = await getDb();
    if (!db) return;
    await db.delete(projects).where(eq(projects.id, projectId));
    await db.delete(users).where(eq(users.id, userId));
  });

  it("calcula, persiste em geo_engine_data e grava snapshot de configuração", async () => {
    const output = await runGeoEngine(projectId, userId, {
      areaBruta: 200_000,
      areaAPP: 10_000,
      modoLotes: "automatico",
      areaMediaLoteAlvo: 300,
    });

    expect(output.numeroLotes).toBeGreaterThan(0);

    const persisted = await getGeoEngineDataByProjectId(projectId);
    expect(persisted).toBeDefined();
    expect(Number(persisted!.areaBruta)).toBe(200_000);
    expect(Number(persisted!.areaAPP)).toBe(10_000);
    expect(persisted!.numeroLotes).toBe(output.numeroLotes);

    const snapshot = await getLatestConfigSnapshot(projectId, "geo_engine");
    expect(snapshot).toBeDefined();
    const snapshotData = snapshot!.snapshotData as { legislationSource: string; percentualAreaVerdeMin: number };
    // Município não cadastrado -> deve ter usado o piso federal
    expect(snapshotData.legislationSource).toBe("piso_federal");
    expect(snapshotData.percentualAreaVerdeMin).toBe(15);
  });

  it("recalcular sobrescreve o registro existente (não duplica)", async () => {
    await runGeoEngine(projectId, userId, {
      areaBruta: 200_000,
      areaAPP: 10_000,
      modoLotes: "manual",
      numeroLotesManual: 500,
    });

    const persisted = await getGeoEngineDataByProjectId(projectId);
    expect(persisted!.numeroLotes).toBe(500);

    const db = await getDb();
    const { geoEngineData } = await import("../../drizzle/schema");
    const allRows = await db!.select().from(geoEngineData).where(eq(geoEngineData.projectId, projectId));
    expect(allRows).toHaveLength(1);
  });
});
