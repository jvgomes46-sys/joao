import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import { getDb, createProject, getCostEngineDataByProjectId } from "../db";
import { getLatestConfigSnapshot } from "../config";
import { runGeoEngine } from "./geoEngineService";
import { runCostEngine } from "./costEngineService";
import { projects, users, geoEngineData, costEngineData, configSnapshots } from "../../drizzle/schema";

describe("CostEngineService — integração com GeoEngine e Módulo de Configuração", () => {
  let userId: number;
  let projectId: number;

  beforeAll(async () => {
    const db = await getDb();
    if (!db) throw new Error("DATABASE_URL não configurado — teste requer banco real");

    await db.insert(users).values({ openId: "costengine-test-user", name: "CostEngine Test" });
    const [user] = await db.select().from(users).where(eq(users.openId, "costengine-test-user")).limit(1);
    userId = user.id;

    const project = await createProject({
      userId,
      name: "Loteamento Teste CostEngine",
      type: "loteamento",
      location: "Município Sem Legislação Cadastrada — Teste CostEngine",
    });
    projectId = project!.id;
  });

  afterAll(async () => {
    const db = await getDb();
    if (!db) return;
    await db.delete(geoEngineData).where(eq(geoEngineData.projectId, projectId));
    await db.delete(costEngineData).where(eq(costEngineData.projectId, projectId));
    await db.delete(configSnapshots).where(eq(configSnapshots.projectId, projectId));
    await db.delete(projects).where(eq(projects.id, projectId));
    await db.delete(users).where(eq(users.id, userId));
  });

  it("recusa calcular sem o GeoEngine ter rodado antes", async () => {
    await expect(
      runCostEngine(projectId, userId, {
        topografia: "plana",
        padraoPavimentacao: "asfalto",
        solucaoEsgoto: "rede_publica",
        solucaoAgua: "rede_publica",
        tipologia: "loteamento_aberto",
        participacaoEletrica: "concessionaria_cobre",
      })
    ).rejects.toThrow(/GeoEngine/);
  });

  it("calcula a partir do resultado real do GeoEngine, persiste e grava snapshot", async () => {
    const geoOutput = await runGeoEngine(projectId, userId, {
      areaBruta: 150_000,
      areaAPP: 5_000,
      modoLotes: "automatico",
      areaMediaLoteAlvo: 280,
    });
    expect(geoOutput.numeroLotes).toBeGreaterThan(0);

    const costOutput = await runCostEngine(projectId, userId, {
      topografia: "ondulada",
      padraoPavimentacao: "asfalto",
      solucaoEsgoto: "rede_publica",
      necessitaElevatoria: true,
      solucaoAgua: "rede_publica",
      tipologia: "loteamento_aberto",
      participacaoEletrica: "cliente_paga",
      contingenciaPercentual: 5,
    });

    expect(costOutput.capexTotal).toBeGreaterThan(0);
    expect(costOutput.itens.length).toBeGreaterThan(30);

    const persisted = await getCostEngineDataByProjectId(projectId);
    expect(persisted).toBeDefined();
    expect(Number(persisted!.investimentoTotal)).toBeCloseTo(costOutput.capexTotal, 2);
    expect((persisted!.detalhamentoItens as unknown[]).length).toBe(costOutput.itens.length);

    const snapshot = await getLatestConfigSnapshot(projectId, "cost_engine");
    expect(snapshot).toBeDefined();
    const snapshotData = snapshot!.snapshotData as { bdiPercentual: number; custosUnitarios: Record<string, number> };
    expect(snapshotData.bdiPercentual).toBe(20); // calibrado a partir do orçamento real Residencial Mirante (Formosa/GO)
    expect(snapshotData.custosUnitarios["limpeza_destocamento"]).toBeGreaterThan(0);
  });

  it("respeita a densidade calculada pelo GeoEngine (dispensa de rede coletora em cascata)", async () => {
    // gleba grande e poucos lotes -> baixa densidade -> GeoEngine marca dispensaRedeColetora
    const geoOutput = await runGeoEngine(projectId, userId, {
      areaBruta: 1_000_000,
      modoLotes: "manual",
      numeroLotesManual: 300,
    });
    expect(geoOutput.dispensaRedeColetora).toBe(true);

    const costOutput = await runCostEngine(projectId, userId, {
      topografia: "plana",
      padraoPavimentacao: "asfalto",
      solucaoEsgoto: "rede_publica", // usuário escolheu rede pública, mas baixa densidade deve forçar fossa
      solucaoAgua: "rede_publica",
      tipologia: "loteamento_aberto",
      participacaoEletrica: "concessionaria_cobre",
    });

    const fossa = costOutput.itens.find((i) => i.itemCodigo === "fossa_sumidouro")!;
    const redeColetora = costOutput.itens.find((i) => i.itemCodigo === "rede_coletora_esgoto")!;
    expect(fossa.ativo).toBe(true);
    expect(redeColetora.ativo).toBe(false);
  });
});
