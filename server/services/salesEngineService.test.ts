import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import { getDb, createProject, getSalesEngineDataByProjectId } from "../db";
import { getLatestConfigSnapshot } from "../config";
import { runGeoEngine } from "./geoEngineService";
import { runSalesEngine } from "./salesEngineService";
import { projects, users, geoEngineData, salesEngineData, configSnapshots } from "../../drizzle/schema";

describe("SalesEngineService — integração com GeoEngine e Módulo de Configuração", () => {
  let userId: number;
  let projectId: number;

  beforeAll(async () => {
    const db = await getDb();
    if (!db) throw new Error("DATABASE_URL não configurado — teste requer banco real");

    await db.insert(users).values({ openId: "salesengine-test-user", name: "SalesEngine Test" });
    const [user] = await db.select().from(users).where(eq(users.openId, "salesengine-test-user")).limit(1);
    userId = user.id;

    const project = await createProject({
      userId,
      name: "Loteamento Teste SalesEngine",
      type: "loteamento",
      location: "Município Sem Legislação Cadastrada — Teste SalesEngine",
    });
    projectId = project!.id;
  });

  afterAll(async () => {
    const db = await getDb();
    if (!db) return;
    await db.delete(geoEngineData).where(eq(geoEngineData.projectId, projectId));
    await db.delete(salesEngineData).where(eq(salesEngineData.projectId, projectId));
    await db.delete(configSnapshots).where(eq(configSnapshots.projectId, projectId));
    await db.delete(projects).where(eq(projects.id, projectId));
    await db.delete(users).where(eq(users.id, userId));
  });

  it("recusa calcular sem o GeoEngine ter rodado antes", async () => {
    await expect(
      runSalesEngine(projectId, userId, {
        tipologia: "loteamento_aberto",
        modoPreco: "automatico",
        modoAbsorcao: "automatico",
        comissaoPercentual: 0.06,
        marketingPercentual: 0.03,
        impostosPercentual: 0.06,
        inadimplenciaPercentual: 0.05,
        despesasAdministrativasPercentual: 0.04,
      })
    ).rejects.toThrow(/GeoEngine/);
  });

  it("calcula usando a Matriz de Tipologia real (modo automático), persiste e grava snapshot", async () => {
    const geoOutput = await runGeoEngine(projectId, userId, {
      areaBruta: 115_502, // mesmo cenário da planilha mestre
      modoLotes: "manual",
      numeroLotesManual: 186,
    });
    expect(geoOutput.numeroLotes).toBe(186);

    const output = await runSalesEngine(projectId, userId, {
      tipologia: "loteamento_aberto",
      modoPreco: "automatico",
      modoAbsorcao: "automatico",
      comissaoPercentual: 0.06,
      marketingPercentual: 0.03,
      impostosPercentual: 0.06,
      inadimplenciaPercentual: 0.05,
      despesasAdministrativasPercentual: 0.04,
    });

    // preço base da matriz para loteamento_aberto = 450 (seed real da planilha)
    expect(output.precoM2).toBe(450);
    expect(output.absorcaoLotesMes).toBeGreaterThan(0);

    const persisted = await getSalesEngineDataByProjectId(projectId);
    expect(persisted).toBeDefined();
    expect(Number(persisted!.precoMedioM2)).toBe(450);
    expect(Number(persisted!.vgv)).toBeCloseTo(output.vgvTotal, 2);

    const snapshot = await getLatestConfigSnapshot(projectId, "sales_engine");
    expect(snapshot).toBeDefined();
    const snapshotData = snapshot!.snapshotData as { precoBaseM2Tipologia: number };
    expect(snapshotData.precoBaseM2Tipologia).toBe(450);
  });

  it("modo manual ignora a matriz de tipologia", async () => {
    const output = await runSalesEngine(projectId, userId, {
      tipologia: "loteamento_aberto",
      modoPreco: "manual",
      precoManualM2: 700,
      modoAbsorcao: "manual",
      absorcaoManualLotesMes: 10,
      comissaoPercentual: 0.06,
      marketingPercentual: 0.03,
      impostosPercentual: 0.06,
      inadimplenciaPercentual: 0.05,
      despesasAdministrativasPercentual: 0.04,
    });

    expect(output.precoM2).toBe(700);
    expect(output.absorcaoLotesMes).toBe(10);
  });
});
