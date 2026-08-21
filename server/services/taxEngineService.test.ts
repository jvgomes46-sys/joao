import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import { getDb, createProject, getTaxEngineDataByProjectId } from "../db";
import { getLatestConfigSnapshot } from "../config";
import { runGeoEngine } from "./geoEngineService";
import { runCostEngine } from "./costEngineService";
import { runSalesEngine } from "./salesEngineService";
import { runFinanceEngine } from "./financeEngineService";
import { runTaxEngine } from "./taxEngineService";
import {
  projects,
  users,
  geoEngineData,
  costEngineData,
  salesEngineData,
  financeEngineData,
  taxEngineData,
  configSnapshots,
} from "../../drizzle/schema";

describe("TaxEngineService — integração de ponta a ponta (Geo → Cost → Sales → Finance → Tax)", () => {
  let userId: number;
  let projectId: number;

  beforeAll(async () => {
    const db = await getDb();
    if (!db) throw new Error("DATABASE_URL não configurado — teste requer banco real");

    await db.insert(users).values({ openId: "taxengine-test-user", name: "TaxEngine Test" });
    const [user] = await db.select().from(users).where(eq(users.openId, "taxengine-test-user")).limit(1);
    userId = user.id;

    const project = await createProject({
      userId,
      name: "Loteamento Teste TaxEngine",
      type: "loteamento",
      location: "Município Sem Legislação Cadastrada — Teste TaxEngine",
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
    await db.delete(taxEngineData).where(eq(taxEngineData.projectId, projectId));
    await db.delete(configSnapshots).where(eq(configSnapshots.projectId, projectId));
    await db.delete(projects).where(eq(projects.id, projectId));
    await db.delete(users).where(eq(users.id, userId));
  });

  it("recusa calcular sem o SalesEngine e o FinanceEngine terem rodado antes", async () => {
    await expect(runTaxEngine(projectId, userId, { regime: "ret" })).rejects.toThrow(/SalesEngine/);
  });

  it("calcula a partir da receita real (SalesEngine) e do lucro real (FinanceEngine), persiste e grava snapshot", async () => {
    await runGeoEngine(projectId, userId, {
      areaBruta: 150_000,
      modoLotes: "automatico",
      areaMediaLoteAlvo: 280,
    });

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
      custosIndexados: true,
      recebiveisIndexados: true,
    });

    const taxOutput = await runTaxEngine(projectId, userId, {
      regime: "lucro_real",
      patrimonioAfetacao: true,
    });

    expect(taxOutput.impostosTotais).toBeGreaterThan(0);
    expect(taxOutput.comparativoReforma).not.toBeNull();

    const persisted = await getTaxEngineDataByProjectId(projectId);
    expect(persisted).toBeDefined();
    expect(persisted!.regimeTributario).toBe("lucro_real");
    expect(Number(persisted!.impostosTotais)).toBeCloseTo(taxOutput.impostosTotais, 2);
    expect((persisted!.impactoReforma as { linhas: unknown[] }).linhas.length).toBeGreaterThan(0);

    const snapshot = await getLatestConfigSnapshot(projectId, "tax_engine");
    expect(snapshot).toBeDefined();
    const snapshotData = snapshot!.snapshotData as { pais: string; regime: string; aliquotas: Record<string, number> };
    expect(snapshotData.pais).toBe("Brasil");
    expect(snapshotData.regime).toBe("lucro_real");
    expect(snapshotData.aliquotas.ibs).toBeGreaterThan(0);
  });
});
