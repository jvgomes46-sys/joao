import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { getDb, createProject, getGeoEngineDataByProjectId } from "../db";
import { getLatestConfigSnapshot } from "../config";
import { runGeoEngine } from "./geoEngineService";
import { projects, users, geoEngineData, configSnapshots, configLegislation } from "../../drizzle/schema";
import { eq } from "drizzle-orm";


describe("GeoEngineService — percentuais urbanísticos seguem o município (com override por projeto)", () => {
  let userId: number;
  let projectId: number;
  const MUNICIPIO = "Cidade Exigente Teste";

  beforeAll(async () => {
    const db = await getDb();
    if (!db) throw new Error("DATABASE_URL não configurado — teste requer banco real");
    await db.insert(users).values({ openId: "geo-pct-test-user", name: "Geo Pct" });
    const [user] = await db.select().from(users).where(eq(users.openId, "geo-pct-test-user")).limit(1);
    userId = user.id;
    const project = await createProject({ userId, name: "Pct", type: "loteamento", location: MUNICIPIO });
    projectId = project!.id;

    // Município mais restritivo que o piso federal (20/8/25 em vez de 15/5/20)
    await db.insert(configLegislation).values({
      municipio: MUNICIPIO,
      uf: "GO",
      percentualAreaVerdeMin: "20",
      percentualAreaInstitucionalMin: "8",
      percentualSistemaViarioMin: "25",
      areaMinimaLote: "200",
      isFederalFallback: false,
    });
  });

  afterAll(async () => {
    const db = await getDb();
    if (!db) return;
    await db.delete(geoEngineData).where(eq(geoEngineData.projectId, projectId));
    await db.delete(configSnapshots).where(eq(configSnapshots.projectId, projectId));
    await db.delete(projects).where(eq(projects.id, projectId));
    await db.delete(users).where(eq(users.id, userId));
    await db.delete(configLegislation).where(eq(configLegislation.municipio, MUNICIPIO));
  });

  it("sem percentuais informados, desenha o projeto no piso do município (não no 15/5/20 federal)", async () => {
    const out = await runGeoEngine(projectId, userId, { areaBruta: 100_000, modoLotes: "automatico", areaMediaLoteAlvo: 300 });

    expect(out.percentualVerde).toBeCloseTo(20, 4);
    expect(out.percentualInstitucional).toBeCloseTo(8, 4);
    expect(out.percentualSistemaViario).toBeCloseTo(25, 4);
    expect(out.pisosAplicados).toEqual({ verdeMin: 20, institucionalMin: 8, sistemaViarioMin: 25 });
    // desenhado exatamente no mínimo => conforme, sem alertas de área
    expect(out.conformidadeLei6766).toBe(true);
    expect(out.alertasConformidade.filter((a) => /insuficiente/.test(a))).toHaveLength(0);
  });

  it("percentual informado ACIMA do mínimo é respeitado como premissa do projeto", async () => {
    const out = await runGeoEngine(projectId, userId, {
      areaBruta: 100_000, modoLotes: "automatico", areaMediaLoteAlvo: 300,
      percentualVerde: 30, // mais generoso que o mínimo municipal de 20
    });
    expect(out.percentualVerde).toBeCloseTo(30, 4);
    expect(out.conformidadeLei6766).toBe(true);
    // institucional/viário continuam seguindo o município
    expect(out.percentualInstitucional).toBeCloseTo(8, 4);
    expect(out.percentualSistemaViario).toBeCloseTo(25, 4);
  });

  it("percentual informado ABAIXO do mínimo municipal calcula, mas alerta não conformidade", async () => {
    const out = await runGeoEngine(projectId, userId, {
      areaBruta: 100_000, modoLotes: "automatico", areaMediaLoteAlvo: 300,
      percentualVerde: 15, // ok no piso federal, mas abaixo do municipal (20)
    });
    expect(out.percentualVerde).toBeCloseTo(15, 4);
    expect(out.conformidadeLei6766).toBe(false);
    expect(out.alertasConformidade.some((a) => /Área verde insuficiente/.test(a) && /mínimo 20%/.test(a))).toBe(true);
  });

  it("o checklist GRAPROHAB usa o piso do município, não valores fixos", async () => {
    const out = await runGeoEngine(projectId, userId, { areaBruta: 100_000, modoLotes: "automatico", areaMediaLoteAlvo: 300 });
    const item = out.checklistGRAPROHAB.find((i) => i.id === "graprohab_001")!;
    expect(item.criterio).toContain("20%");
    expect(item.conforme).toBe(true);
  });

  it("registra no snapshot a origem de cada percentual (legislação x manual)", async () => {
    await runGeoEngine(projectId, userId, {
      areaBruta: 100_000, modoLotes: "automatico", areaMediaLoteAlvo: 300, percentualVerde: 30,
    });
    const snap = await getLatestConfigSnapshot(projectId, "geo_engine");
    const d = snap!.snapshotData as { percentuaisSeguemLegislacao: Record<string, boolean>; percentualSistemaViarioMin: number };
    expect(d.percentuaisSeguemLegislacao).toEqual({ verde: false, institucional: true, sistemaViario: true });
    expect(d.percentualSistemaViarioMin).toBe(25);
  });
});

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
    await db.delete(geoEngineData).where(eq(geoEngineData.projectId, projectId));
    await db.delete(configSnapshots).where(eq(configSnapshots.projectId, projectId));
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
