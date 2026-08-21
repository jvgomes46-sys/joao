import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import { getDb, createProject } from "../db";
import { runGeoEngine } from "./geoEngineService";
import { runCostEngine } from "./costEngineService";
import { runSalesEngine } from "./salesEngineService";
import { runFinanceEngine } from "./financeEngineService";
import { generateOnePagerPdf, generateTechnicalReportPdf } from "./reportService";
import { projects, users, geoEngineData, costEngineData, salesEngineData, financeEngineData, configSnapshots } from "../../drizzle/schema";

describe("ReportService — exportação de PDF (spec 2.12)", () => {
  let userId: number;
  let projectId: number;

  beforeAll(async () => {
    const db = await getDb();
    if (!db) throw new Error("DATABASE_URL não configurado — teste requer banco real");

    await db.insert(users).values({ openId: "report-test-user", name: "Report Test" });
    const [user] = await db.select().from(users).where(eq(users.openId, "report-test-user")).limit(1);
    userId = user.id;

    const project = await createProject({
      userId,
      name: "Loteamento Teste Relatório",
      type: "loteamento",
      location: "Município Sem Legislação Cadastrada — Teste Relatório",
    });
    projectId = project!.id;

    await runGeoEngine(projectId, userId, { areaBruta: 150_000, modoLotes: "automatico", areaMediaLoteAlvo: 280 });
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
    await runFinanceEngine(projectId, userId, {
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

  it("gera um one-pager executivo em PDF válido", async () => {
    const buffer = await generateOnePagerPdf(projectId, userId);
    expect(buffer.subarray(0, 5).toString("latin1")).toBe("%PDF-");
    expect(buffer.length).toBeGreaterThan(1000);
  });

  it("gera o relatório técnico completo em PDF válido", async () => {
    const buffer = await generateTechnicalReportPdf(projectId, userId);
    expect(buffer.subarray(0, 5).toString("latin1")).toBe("%PDF-");
    expect(buffer.length).toBeGreaterThan(1000);
  });

  it("recusa gerar relatório para projeto de outro usuário", async () => {
    await expect(generateOnePagerPdf(projectId, userId + 999_999)).rejects.toThrow(/não encontrado/);
  });
});
