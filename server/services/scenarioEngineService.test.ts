import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import { getDb, createProject, getScenariosByProjectId, getPartnershipAnalysisByProjectId } from "../db";
import { getLatestConfigSnapshot } from "../config";
import { runGeoEngine } from "./geoEngineService";
import { runCostEngine } from "./costEngineService";
import { runSalesEngine } from "./salesEngineService";
import { runScenarioEngine } from "./scenarioEngineService";
import {
  projects,
  users,
  geoEngineData,
  costEngineData,
  salesEngineData,
  scenarios,
  partnershipAnalysis,
  configSnapshots,
} from "../../drizzle/schema";

describe("ScenarioEngineService — integração de ponta a ponta (Geo → Cost → Sales → Cenários/Parceria)", () => {
  let userId: number;
  let projectId: number;

  beforeAll(async () => {
    const db = await getDb();
    if (!db) throw new Error("DATABASE_URL não configurado — teste requer banco real");

    await db.insert(users).values({ openId: "scenarioengine-test-user", name: "ScenarioEngine Test" });
    const [user] = await db.select().from(users).where(eq(users.openId, "scenarioengine-test-user")).limit(1);
    userId = user.id;

    const project = await createProject({
      userId,
      name: "Loteamento Teste ScenarioEngine",
      type: "loteamento",
      location: "Município Sem Legislação Cadastrada — Teste ScenarioEngine",
    });
    projectId = project!.id;
  });

  afterAll(async () => {
    const db = await getDb();
    if (!db) return;
    await db.delete(geoEngineData).where(eq(geoEngineData.projectId, projectId));
    await db.delete(costEngineData).where(eq(costEngineData.projectId, projectId));
    await db.delete(salesEngineData).where(eq(salesEngineData.projectId, projectId));
    await db.delete(scenarios).where(eq(scenarios.projectId, projectId));
    await db.delete(partnershipAnalysis).where(eq(partnershipAnalysis.projectId, projectId));
    await db.delete(configSnapshots).where(eq(configSnapshots.projectId, projectId));
    await db.delete(projects).where(eq(projects.id, projectId));
    await db.delete(users).where(eq(users.id, userId));
  });

  it("recusa calcular sem o CostEngine ter rodado antes", async () => {
    await runGeoEngine(projectId, userId, { areaBruta: 150_000, modoLotes: "automatico", areaMediaLoteAlvo: 280 });
    await expect(
      runScenarioEngine(projectId, userId, {
        duracaoAprovacoesMeses: 12,
        inicioVendasMes: 20,
        precoBrutoPorLote: 250_000,
        prazoVendasMeses: 30,
        curvaVendas: "curva_s",
        percentualDeducoesVenda: 0.22,
        percentualEntrada: 0.2,
        numeroParcelas: 36,
        tmaAnualFracao: 0.14,
      })
    ).rejects.toThrow(/CostEngine/);
  });

  it("calcula os 3 cenários + parceria + matrizes, persiste tudo e grava snapshot", async () => {
    await runCostEngine(projectId, userId, {
      topografia: "plana",
      padraoPavimentacao: "asfalto",
      solucaoEsgoto: "rede_publica",
      solucaoAgua: "rede_publica",
      tipologia: "loteamento_aberto",
      participacaoEletrica: "concessionaria_cobre",
    });

    const salesOutput = await runSalesEngine(projectId, userId, {
      tipologia: "loteamento_aberto",
      modoPreco: "automatico",
      modoAbsorcao: "automatico",
      comissaoPercentual: 0.06,
      marketingPercentual: 0.03,
      impostosPercentual: 0.06,
      inadimplenciaPercentual: 0.05,
      despesasAdministrativasPercentual: 0.04,
    });

    const output = await runScenarioEngine(projectId, userId, {
      duracaoAprovacoesMeses: 12,
      inicioVendasMes: 20,
      precoBrutoPorLote: salesOutput.precoBrutoPorLote,
      prazoVendasMeses: salesOutput.prazoVendasMeses,
      curvaVendas: "curva_s",
      percentualDeducoesVenda: salesOutput.percentualDeducoesVenda,
      percentualEntrada: 0.2,
      numeroParcelas: 36,
      tmaAnualFracao: 0.14,
      percentualParceriaTerreno: 0.3,
    });

    expect(output.cenarios).toHaveLength(3);
    expect(output.cenarios.map((c) => c.nome)).toEqual(["Conservador", "Realista", "Otimista"]);
    expect(output.parceria.lotesTerreneiro).toBeGreaterThan(0);
    expect(output.matrizSensibilidade1.length).toBeGreaterThan(0);
    expect(output.matrizSensibilidade2.length).toBeGreaterThan(0);

    const persistedScenarios = await getScenariosByProjectId(projectId);
    expect(persistedScenarios).toHaveLength(3);

    const persistedParceria = await getPartnershipAnalysisByProjectId(projectId);
    expect(persistedParceria).toBeDefined();
    expect(Number(persistedParceria!.percentualParceriaTerreno)).toBeCloseTo(0.3, 4);
    expect((persistedParceria!.matrizSensibilidade1 as unknown[]).length).toBeGreaterThan(0);

    const snapshot = await getLatestConfigSnapshot(projectId, "scenario_engine");
    expect(snapshot).toBeDefined();
  });
});
