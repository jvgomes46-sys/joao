import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { eq, inArray } from "drizzle-orm";
import { getDb, createProject } from "../db";
import { runGeoEngine } from "./geoEngineService";
import { runCostEngine } from "./costEngineService";
import { runSalesEngine } from "./salesEngineService";
import { runFinanceEngine } from "./financeEngineService";
import { getPortfolioData } from "./portfolioService";
import { projects, users, geoEngineData, costEngineData, salesEngineData, financeEngineData, configSnapshots } from "../../drizzle/schema";

describe("PortfolioService — consolidação multiprojeto (spec seção 8, item 6)", () => {
  let userId: number;
  const ids: number[] = [];

  async function criarEstudoCompleto(nome: string, dataInicioPrevista?: Date) {
    const p = await createProject({ userId, name: nome, type: "loteamento", location: "Sem Legislacao Portfolio", dataInicioPrevista });
    ids.push(p!.id);
    await runGeoEngine(p!.id, userId, { areaBruta: 100_000, modoLotes: "automatico", areaMediaLoteAlvo: 300 });
    await runCostEngine(p!.id, userId, {
      topografia: "plana", padraoPavimentacao: "asfalto", solucaoEsgoto: "rede_publica", solucaoAgua: "rede_publica",
      tipologia: "loteamento_aberto", participacaoEletrica: "concessionaria_cobre",
    });
    const sales = await runSalesEngine(p!.id, userId, { tipologia: "loteamento_aberto", modoPreco: "automatico", modoAbsorcao: "automatico" });
    await runFinanceEngine(p!.id, userId, {
      precoBrutoPorLote: sales.precoBrutoPorLote,
      prazoVendasMeses: sales.prazoVendasMeses,
      curvaVendas: "curva_s",
      percentualDeducoesVenda: sales.percentualDeducoesVenda,
      tmaAnualFracao: 0.14,
    });
    return p!.id;
  }

  beforeAll(async () => {
    const db = await getDb();
    if (!db) throw new Error("DATABASE_URL não configurado — teste requer banco real");
    await db.insert(users).values({ openId: "portfolio-test-user", name: "Portfolio Test" });
    const [u] = await db.select().from(users).where(eq(users.openId, "portfolio-test-user")).limit(1);
    userId = u.id;
  });

  afterAll(async () => {
    const db = await getDb();
    if (!db) return;
    for (const t of [geoEngineData, costEngineData, salesEngineData, financeEngineData, configSnapshots]) {
      await db.delete(t).where(inArray(t.projectId, ids));
    }
    await db.delete(projects).where(eq(projects.userId, userId));
    await db.delete(users).where(eq(users.id, userId));
  });

  it("usuário sem projetos devolve portfólio vazio sem quebrar", async () => {
    const out = await getPortfolioData(userId);
    expect(out.numeroProjetos).toBe(0);
    expect(out.projetos).toHaveLength(0);
  });

  it("consolida dois projetos e a exposição consolidada nunca é pior que a soma dos picos", async () => {
    await criarEstudoCompleto("Portfolio A", new Date("2026-01-01"));
    await criarEstudoCompleto("Portfolio B", new Date("2027-01-01")); // 12 meses depois

    const out = await getPortfolioData(userId);
    expect(out.numeroProjetos).toBe(2);
    expect(out.vgvTotal).toBeGreaterThan(0);
    expect(out.capexTotal).toBeGreaterThan(0);

    // o offset foi calculado a partir das datas de início
    const b = out.projetos.find((p) => p.nome === "Portfolio B")!;
    expect(b.offsetMeses).toBe(12);

    // escalonar nunca exige MAIS capital do que somar os picos individuais
    expect(out.exposicaoMaximaConsolidada).toBeGreaterThanOrEqual(out.somaDasExposicoesIndividuais);
    expect(out.fluxoConsolidado.length).toBeGreaterThan(120); // 120 do A + 12 de offset do B
  });

  it("projeto sem FinanceEngine fica fora da consolidação e é reportado, não contado como zero", async () => {
    const semCalculo = await createProject({ userId, name: "So Rascunho", type: "loteamento", location: "x" });
    ids.push(semCalculo!.id);

    const out = await getPortfolioData(userId);
    expect(out.numeroProjetos).toBe(2); // continua 2, o rascunho não entra
    expect(out.projetosSemCalculo.map((p) => p.nome)).toContain("So Rascunho");
    expect(out.alertas.some((a) => /fora da consolidação/.test(a))).toBe(true);
  });
});
