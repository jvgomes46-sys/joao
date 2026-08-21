import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import { getDb, createProject } from "../db";
import { runGeoEngine } from "./geoEngineService";
import { runCostEngine } from "./costEngineService";
import { runSalesEngine } from "./salesEngineService";
import { runFinanceEngine } from "./financeEngineService";
import { getDashboardData } from "./dashboardService";
import { projects, users, geoEngineData, costEngineData, salesEngineData, financeEngineData, configSnapshots } from "../../drizzle/schema";

describe("DashboardService — agregação de ponta a ponta (Geo → Cost → Sales → Finance → Dashboard)", () => {
  let userId: number;
  let projectId: number;

  beforeAll(async () => {
    const db = await getDb();
    if (!db) throw new Error("DATABASE_URL não configurado — teste requer banco real");

    await db.insert(users).values({ openId: "dashboard-test-user", name: "Dashboard Test" });
    const [user] = await db.select().from(users).where(eq(users.openId, "dashboard-test-user")).limit(1);
    userId = user.id;

    const project = await createProject({
      userId,
      name: "Loteamento Teste Dashboard",
      type: "loteamento",
      location: "Município Sem Legislação Cadastrada — Teste Dashboard",
    });
    projectId = project!.id;
  });

  afterAll(async () => {
    const db = await getDb();
    if (!db) return;
    await db.delete(geoEngineData).where(eq(geoEngineData.projectId, projectId));
    await db.delete(costEngineData).where(eq(costEngineData.projectId, projectId));
    await db.delete(salesEngineData).where(eq(salesEngineData.projectId, projectId));
    await db.delete(financeEngineData).where(eq(financeEngineData.projectId, projectId));
    await db.delete(configSnapshots).where(eq(configSnapshots.projectId, projectId));
    await db.delete(projects).where(eq(projects.id, projectId));
    await db.delete(users).where(eq(users.id, userId));
  });

  it("recusa montar o dashboard sem o FinanceEngine ter rodado antes", async () => {
    await runGeoEngine(projectId, userId, { areaBruta: 150_000, modoLotes: "automatico", areaMediaLoteAlvo: 280 });
    await expect(getDashboardData(projectId, userId)).rejects.toThrow(/GeoEngine|CostEngine|SalesEngine|FinanceEngine/);
  });

  it("agrega KPIs, DRE, composição de CAPEX e alertas depois de rodar toda a cadeia", async () => {
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

    const financeOutput = await runFinanceEngine(projectId, userId, {
      duracaoAprovacoesMeses: 12,
      inicioVendasMes: 20,
      precoBrutoPorLote: salesOutput.precoBrutoPorLote,
      prazoVendasMeses: salesOutput.prazoVendasMeses,
      curvaVendas: "curva_s",
      percentualDeducoesVenda: salesOutput.percentualDeducoesVenda,
      percentualEntrada: 0.2,
      numeroParcelas: 36,
      tmaAnualFracao: 0.14,
    });

    const dashboard = await getDashboardData(projectId, userId);

    expect(dashboard.projectName).toBe("Loteamento Teste Dashboard");
    expect(dashboard.vgvTotal).toBeCloseTo(Number(salesOutput.vgvTotal), 2);
    expect(dashboard.vgvIncorporador).toBeCloseTo(dashboard.vgvTotal, 2); // sem parceria cadastrada
    expect(dashboard.capexTotal).toBeGreaterThan(0);
    expect(dashboard.capexSobreVgv).toBeGreaterThan(0);
    expect(dashboard.vpl).toBeCloseTo(financeOutput.vpl, 2);
    expect(dashboard.paybackMes).toEqual(financeOutput.paybackMes);

    const somaPercentuais = dashboard.composicaoCapexPorDisciplina.reduce((s, i) => s + i.percentual, 0);
    expect(somaPercentuais).toBeCloseTo(100, 1);
    expect(dashboard.composicaoCapexPorDisciplina.length).toBeGreaterThan(0);

    expect(dashboard.dreResumido.receitaBrutaTotal).toBeGreaterThan(0);
    expect(dashboard.dreResumido.lucroLiquido).toBeCloseTo(financeOutput.resultadoNominal, 2);

    expect(Array.isArray(dashboard.alertas)).toBe(true);
    expect(dashboard.regimeTributario).toBeNull();
    expect(dashboard.impostosTotais).toBeNull();
  });
});
