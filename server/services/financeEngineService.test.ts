import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import { getDb, createProject, getFinanceEngineDataByProjectId } from "../db";
import { getLatestConfigSnapshot } from "../config";
import { runGeoEngine } from "./geoEngineService";
import { runCostEngine } from "./costEngineService";
import { runFinanceEngine } from "./financeEngineService";
import { projects, users, geoEngineData, costEngineData, financeEngineData, configSnapshots } from "../../drizzle/schema";


describe("FinanceEngineService — prazo de aprovações derivado da Configuração", () => {
  let userId: number;
  let projectId: number;

  beforeAll(async () => {
    const db = await getDb();
    if (!db) throw new Error("DATABASE_URL não configurado — teste requer banco real");
    await db.insert(users).values({ openId: "prazoaprov-test-user", name: "Prazo Test" });
    const [user] = await db.select().from(users).where(eq(users.openId, "prazoaprov-test-user")).limit(1);
    userId = user.id;
    const project = await createProject({ userId, name: "Prazo Aprovações", type: "loteamento", location: "Sem Legislação — Teste Prazo" });
    projectId = project!.id;
    await runGeoEngine(projectId, userId, { areaBruta: 100_000, modoLotes: "automatico", areaMediaLoteAlvo: 300 });
  });

  afterAll(async () => {
    const db = await getDb();
    if (!db) return;
    for (const t of [geoEngineData, costEngineData, financeEngineData, configSnapshots]) {
      await db.delete(t).where(eq(t.projectId, projectId));
    }
    await db.delete(projects).where(eq(projects.id, projectId));
    await db.delete(users).where(eq(users.id, userId));
  });

  const financeBase = {
    inicioVendasMes: 20,
    precoBrutoPorLote: 250_000,
    prazoVendasMeses: 30,
    curvaVendas: "curva_s" as const,
    percentualDeducoesVenda: 0.22,
    percentualEntrada: 0.2,
    numeroParcelas: 36,
    tmaAnualFracao: 0.14,
  };

  async function prazoDoSnapshot() {
    const snap = await getLatestConfigSnapshot(projectId, "finance_engine");
    return (snap!.snapshotData as { prazoAprovacao: { prazoTotalMeses: number; adicionaisAplicados: { gatilho: string }[] } }).prazoAprovacao;
  }

  it("sem gatilhos, usa só o prazo base da Configuração (12 meses)", async () => {
    await runCostEngine(projectId, userId, {
      topografia: "plana", padraoPavimentacao: "asfalto", solucaoEsgoto: "rede_publica", solucaoAgua: "rede_publica",
      tipologia: "loteamento_aberto", participacaoEletrica: "concessionaria_cobre",
    });
    await runFinanceEngine(projectId, userId, financeBase); // duracaoAprovacoesMeses omitido

    const prazo = await prazoDoSnapshot();
    expect(prazo.prazoBaseMeses).toBe(12);
    expect(prazo.adicionaisAplicados).toHaveLength(0);
    expect(prazo.prazoTotalMeses).toBe(12);
  });

  it("ETE própria + supressão vegetal somam os adicionais (12 + 6 + 6 = 24)", async () => {
    await runCostEngine(projectId, userId, {
      topografia: "plana", padraoPavimentacao: "asfalto", solucaoEsgoto: "ete_propria", solucaoAgua: "rede_publica",
      areaSupressaoVegetalM2: 3_000, tipologia: "loteamento_aberto", participacaoEletrica: "concessionaria_cobre",
    });
    await runFinanceEngine(projectId, userId, financeBase);

    const prazo = await prazoDoSnapshot();
    expect(prazo.prazoTotalMeses).toBe(24);
    expect(prazo.adicionaisAplicados.map((a) => a.gatilho).sort()).toEqual(["ete_propria", "supressao_vegetal"]);
  });

  it("condomínio fechado adiciona 3 meses (12 + 3 = 15)", async () => {
    await runCostEngine(projectId, userId, {
      topografia: "plana", padraoPavimentacao: "asfalto", solucaoEsgoto: "rede_publica", solucaoAgua: "rede_publica",
      tipologia: "condominio_fechado", participacaoEletrica: "concessionaria_cobre",
    });
    await runFinanceEngine(projectId, userId, financeBase);

    const prazo = await prazoDoSnapshot();
    expect(prazo.prazoTotalMeses).toBe(15);
    expect(prazo.adicionaisAplicados.map((a) => a.gatilho)).toEqual(["condominio_fechado"]);
  });

  it("prazo informado explicitamente tem precedência sobre o derivado", async () => {
    await runCostEngine(projectId, userId, {
      topografia: "plana", padraoPavimentacao: "asfalto", solucaoEsgoto: "ete_propria", solucaoAgua: "rede_publica",
      tipologia: "condominio_fechado", participacaoEletrica: "concessionaria_cobre",
    });
    await runFinanceEngine(projectId, userId, { ...financeBase, duracaoAprovacoesMeses: 5 });

    const snap = await getLatestConfigSnapshot(projectId, "finance_engine");
    expect((snap!.overrides as { duracaoAprovacoesMeses: number }).duracaoAprovacoesMeses).toBe(5);
  });
});

describe("FinanceEngineService — integração de ponta a ponta (Geo → Cost → Finance)", () => {
  let userId: number;
  let projectId: number;

  beforeAll(async () => {
    const db = await getDb();
    if (!db) throw new Error("DATABASE_URL não configurado — teste requer banco real");

    await db.insert(users).values({ openId: "financeengine-test-user", name: "FinanceEngine Test" });
    const [user] = await db.select().from(users).where(eq(users.openId, "financeengine-test-user")).limit(1);
    userId = user.id;

    const project = await createProject({
      userId,
      name: "Loteamento Teste FinanceEngine",
      type: "loteamento",
      location: "Município Sem Legislação Cadastrada — Teste FinanceEngine",
    });
    projectId = project!.id;
  });

  afterAll(async () => {
    const db = await getDb();
    if (!db) return;
    await db.delete(geoEngineData).where(eq(geoEngineData.projectId, projectId));
    await db.delete(costEngineData).where(eq(costEngineData.projectId, projectId));
    await db.delete(financeEngineData).where(eq(financeEngineData.projectId, projectId));
    await db.delete(configSnapshots).where(eq(configSnapshots.projectId, projectId));
    await db.delete(projects).where(eq(projects.id, projectId));
    await db.delete(users).where(eq(users.id, userId));
  });

  it("recusa calcular sem o CostEngine ter rodado antes", async () => {
    await runGeoEngine(projectId, userId, {
      areaBruta: 150_000,
      modoLotes: "automatico",
      areaMediaLoteAlvo: 280,
    });

    await expect(
      runFinanceEngine(projectId, userId, {
        duracaoAprovacoesMeses: 12,
        inicioVendasMes: 20,
        precoBrutoPorLote: 200_000,
        prazoVendasMeses: 30,
        curvaVendas: "curva_s",
        percentualDeducoesVenda: 0.2,
        percentualEntrada: 0.2,
        numeroParcelas: 24,
        tmaAnualFracao: 0.14,
      })
    ).rejects.toThrow(/CostEngine/);
  });

  it("calcula o fluxo de caixa de ponta a ponta, persiste e grava snapshot", async () => {
    await runCostEngine(projectId, userId, {
      topografia: "plana",
      padraoPavimentacao: "asfalto",
      solucaoEsgoto: "rede_publica",
      necessitaElevatoria: false,
      solucaoAgua: "rede_publica",
      tipologia: "loteamento_aberto",
      participacaoEletrica: "concessionaria_cobre",
      contingenciaPercentual: 5,
      custoFinanceiroPercentual: 6,
    });

    const output = await runFinanceEngine(projectId, userId, {
      duracaoAprovacoesMeses: 12,
      inicioVendasMes: 20, // depois do fim das aprovações+parte da obra, evita alerta de cronograma
      precoBrutoPorLote: 250_000,
      prazoVendasMeses: 30,
      curvaVendas: "curva_s",
      percentualDeducoesVenda: 0.22,
      percentualEntrada: 0.2,
      numeroParcelas: 36,
      tmaAnualFracao: 0.14,
      custosIndexados: true,
      recebiveisIndexados: true,
    });

    expect(output.fluxoMensal).toHaveLength(120);
    expect(output.receitaBrutaTotal).toBeGreaterThan(0);

    const persisted = await getFinanceEngineDataByProjectId(projectId);
    expect(persisted).toBeDefined();
    expect(Number(persisted!.vpl)).toBeCloseTo(output.vpl, 2);
    expect((persisted!.fluxoCaixaMensal as unknown[]).length).toBe(120);
    expect((persisted!.alertasConsistencia as string[]).length).toBe(output.alertas.length);

    const snapshot = await getLatestConfigSnapshot(projectId, "finance_engine");
    expect(snapshot).toBeDefined();
    const snapshotData = snapshot!.snapshotData as { indiceCustosAnualFracao: number; indiceRecebiveisAnualFracao: number };
    // custosIndexados/recebiveisIndexados=true sem taxa explícita -> deve ter puxado INCC/IPCA da Configuração
    expect(snapshotData.indiceCustosAnualFracao).toBeCloseTo(0.065, 3);
    expect(snapshotData.indiceRecebiveisAnualFracao).toBeCloseTo(0.042, 3);
  });
});
