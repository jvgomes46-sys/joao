import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import { getDb, createProject, getCostEngineDataByProjectId } from "../db";
import { getLatestConfigSnapshot } from "../config";
import { runGeoEngine } from "./geoEngineService";
import { runCostEngine } from "./costEngineService";
import { projects, users, geoEngineData, costEngineData, configSnapshots, configUnitCosts } from "../../drizzle/schema";

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

  it("calcula o custo de aprovações sozinho (módulo 2.5) — sem nada digitado à mão", async () => {
    await runGeoEngine(projectId, userId, { areaBruta: 100_000, modoLotes: "automatico", areaMediaLoteAlvo: 300 });

    const costOutput = await runCostEngine(projectId, userId, {
      topografia: "plana",
      padraoPavimentacao: "asfalto",
      solucaoEsgoto: "rede_publica",
      solucaoAgua: "poco", // ativa a outorga de recursos hídricos
      areaSupressaoVegetalM2: 5_000, // ativa a compensação florestal
      tipologia: "loteamento_aberto",
      participacaoEletrica: "cliente_paga",
      // NOTE: custoAprovacoesTotal NÃO é informado — deve vir calculado.
    });

    // Índices da Configuração × 100.000 m² de gleba:
    // A: (0,30 + 2,00 + 0,12) = 2,42 → 242.000
    // B: 0,25×100k + 0,35×100k + 2.500 (outorga) = 25.000 + 35.000 + 2.500 = 62.500
    // C: (0,80 + 0,18 + 0,10) = 1,08 → 108.000
    // D: 5.000 + 5.000 + 95.000 (rede pública) + 0,30×100k = 135.000
    expect(costOutput.aprovacoes.totaisPorGrupo["levantamentos"]).toBeCloseTo(242_000, 2);
    expect(costOutput.aprovacoes.totaisPorGrupo["ambiental"]).toBeCloseTo(62_500, 2);
    expect(costOutput.aprovacoes.totaisPorGrupo["taxas_oficiais"]).toBeCloseTo(108_000, 2);
    expect(costOutput.aprovacoes.totaisPorGrupo["concessionarias"]).toBeCloseTo(135_000, 2);
    expect(costOutput.aprovacoes.custoAprovacoesTotal).toBeCloseTo(547_500, 2);

    // e o valor calculado entra de fato no CAPEX, não fica só informativo
    expect(costOutput.aprovacoesValor).toBeCloseTo(547_500, 2);

    const persisted = await getCostEngineDataByProjectId(projectId);
    const detalhe = persisted!.detalhamentoAprovacoes as { custoAprovacoesTotal: number };
    expect(detalhe.custoAprovacoesTotal).toBeCloseTo(547_500, 2);

    // os índices usados entram no snapshot (auditabilidade — spec 5.3)
    const snapshot = await getLatestConfigSnapshot(projectId, "cost_engine");
    const snapshotData = snapshot!.snapshotData as { indicesAprovacao: Record<string, number> };
    expect(snapshotData.indicesAprovacao.projetosEngenhariaM2).toBe(2);
  });

  it("override manual do custo de aprovações tem precedência sobre o cálculo automático", async () => {
    await runGeoEngine(projectId, userId, { areaBruta: 100_000, modoLotes: "automatico", areaMediaLoteAlvo: 300 });

    const costOutput = await runCostEngine(projectId, userId, {
      topografia: "plana",
      padraoPavimentacao: "asfalto",
      solucaoEsgoto: "rede_publica",
      solucaoAgua: "rede_publica",
      tipologia: "loteamento_aberto",
      participacaoEletrica: "cliente_paga",
      custoAprovacoesTotal: 12_345,
    });

    expect(costOutput.aprovacoesValor).toBe(12_345);
    // o cálculo automático continua disponível para comparação/auditoria
    expect(costOutput.aprovacoes.custoAprovacoesTotal).toBeGreaterThan(0);
    expect(costOutput.aprovacoes.custoAprovacoesTotal).not.toBe(12_345);
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

  it("detecta a UF pela localização do projeto e não zera itens fora da cobertura regional", async () => {
    // UF isolada (PR) para não colidir com outros testes que usam GO em paralelo.
    const db = await getDb();
    // Simula uma importação SINAPI regional parcial: só 1 item tem preço para PR
    await db!.insert(configUnitCosts).values([
      {
        grupo: "terraplenagem",
        itemCodigo: "corte_aterro",
        itemDescricao: "teste cobertura parcial",
        unidade: "m3",
        valorUnitario: "777.77",
        regiao: "PR",
        dataBase: new Date(),
      },
    ]);

    const projetoPr = await createProject({
      userId,
      name: "Loteamento Teste Cobertura Regional",
      type: "loteamento",
      location: "Curitiba, PR",
    });

    await runGeoEngine(projetoPr!.id, userId, {
      areaBruta: 100_000,
      modoLotes: "automatico",
      areaMediaLoteAlvo: 300,
    });

    const output = await runCostEngine(projetoPr!.id, userId, {
      topografia: "plana",
      padraoPavimentacao: "asfalto",
      solucaoEsgoto: "rede_publica",
      solucaoAgua: "rede_publica",
      tipologia: "loteamento_aberto",
      participacaoEletrica: "concessionaria_cobre",
      // regiao NÃO informado — precisa detectar "PR" da location
    });

    const corteAterro = output.itens.find((i) => i.itemCodigo === "corte_aterro")!;
    expect(corteAterro.custoUnitario).toBe(777.77); // veio da região detectada, não do nacional

    // Itens fora da cobertura da região de teste continuam com custo > 0
    // (vieram do fallback nacional) — não foram zerados silenciosamente.
    const regularizacao = output.itens.find((i) => i.itemCodigo === "regularizacao")!;
    expect(regularizacao.custoUnitario).toBeGreaterThan(0);

    await db!.delete(geoEngineData).where(eq(geoEngineData.projectId, projetoPr!.id));
    await db!.delete(costEngineData).where(eq(costEngineData.projectId, projetoPr!.id));
    await db!.delete(configSnapshots).where(eq(configSnapshots.projectId, projetoPr!.id));
    await db!.delete(projects).where(eq(projects.id, projetoPr!.id));
    await db!.delete(configUnitCosts).where(eq(configUnitCosts.regiao, "PR"));
  });
});
