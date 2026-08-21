import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import { getDb, createProject } from "../db";
import { runGeoEngine } from "./geoEngineService";
import { runCostEngine } from "./costEngineService";
import {
  createCategory,
  createSubcategoryFromCostEngine,
  createSubcategoryManual,
  getConstructionDashboard,
  getConstructionTree,
  removeCategory,
  updateStage,
} from "./constructionService";
import {
  projects,
  users,
  geoEngineData,
  costEngineData,
  configSnapshots,
  constructionCategories,
  constructionSubcategories,
  constructionStages,
} from "../../drizzle/schema";

describe("ConstructionService — EAP de Execução de Obra (FASE 3, spec seção 4)", () => {
  let userId: number;
  let projectId: number;

  beforeAll(async () => {
    const db = await getDb();
    if (!db) throw new Error("DATABASE_URL não configurado — teste requer banco real");

    await db.insert(users).values({ openId: "construction-test-user", name: "Construction Test" });
    const [user] = await db.select().from(users).where(eq(users.openId, "construction-test-user")).limit(1);
    userId = user.id;

    const project = await createProject({
      userId,
      name: "Loteamento Teste Obra",
      type: "loteamento",
      location: "Município Sem Legislação Cadastrada — Teste Obra",
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
  });

  afterAll(async () => {
    const db = await getDb();
    if (!db) return;
    const cats = await db.select({ id: constructionCategories.id }).from(constructionCategories).where(eq(constructionCategories.projectId, projectId));
    for (const cat of cats) {
      const subs = await db.select({ id: constructionSubcategories.id }).from(constructionSubcategories).where(eq(constructionSubcategories.categoryId, cat.id));
      for (const sub of subs) {
        await db.delete(constructionStages).where(eq(constructionStages.subcategoryId, sub.id));
      }
      await db.delete(constructionSubcategories).where(eq(constructionSubcategories.categoryId, cat.id));
    }
    await db.delete(constructionCategories).where(eq(constructionCategories.projectId, projectId));
    await db.delete(geoEngineData).where(eq(geoEngineData.projectId, projectId));
    await db.delete(costEngineData).where(eq(costEngineData.projectId, projectId));
    await db.delete(configSnapshots).where(eq(configSnapshots.projectId, projectId));
    await db.delete(projects).where(eq(projects.id, projectId));
    await db.delete(users).where(eq(users.id, userId));
  });

  it("cria categoria + subcategoria manual com etapas do template de edificação (13 etapas)", async () => {
    const category = await createCategory(projectId, userId, "Áreas Construídas");
    expect(category).toBeDefined();

    const subcategory = await createSubcategoryManual(category!.id, projectId, userId, {
      nome: "Vestiário",
      templateKey: "edificacao",
      valorPrevistoTotal: 130_000,
    });
    expect(subcategory).toBeDefined();

    const tree = await getConstructionTree(projectId, userId);
    expect(tree).toHaveLength(1);
    expect(tree[0].subcategories).toHaveLength(1);
    expect(tree[0].subcategories[0].stages).toHaveLength(13);
    const somaValorPrevisto = tree[0].subcategories[0].stages.reduce((s, e) => s + e.valorPrevisto, 0);
    expect(somaValorPrevisto).toBeCloseTo(130_000, 2);
  });

  it("cria subcategoria puxando o Valor Previsto do CostEngine (não redigitado)", async () => {
    const category = await createCategory(projectId, userId, "Infraestrutura");
    const subcategory = await createSubcategoryFromCostEngine(category!.id, projectId, userId, {
      nome: "Terraplenagem do Loteamento",
      templateKey: "infraestrutura_loteamento",
      grupo: "terraplenagem",
    });
    expect(subcategory).toBeDefined();
    expect(subcategory!.origemCostEngineGrupo).toBe("terraplenagem");

    const tree = await getConstructionTree(projectId, userId);
    const infra = tree.find((c) => c.nome === "Infraestrutura")!;
    const somaValorPrevisto = infra.subcategories[0].stages.reduce((s, e) => s + e.valorPrevisto, 0);
    expect(somaValorPrevisto).toBeGreaterThan(0);
  });

  it("atualiza % executado de uma etapa e reflete no dashboard consolidado", async () => {
    const tree = await getConstructionTree(projectId, userId);
    const vestiario = tree.flatMap((c) => c.subcategories).find((s) => s.nome === "Vestiário")!;
    const fundacao = vestiario.stages.find((e) => e.nome === "Fundação")!;

    await updateStage(fundacao.id, projectId, userId, { percentualExecutado: 50, status: "em_execucao" });

    const dashboard = await getConstructionDashboard(projectId, userId);
    expect(dashboard.valorExecutadoTotal).toBeGreaterThan(0);
    expect(dashboard.progressoGeralPercentual).toBeGreaterThan(0);
    expect(dashboard.progressoGeralPercentual).toBeLessThan(100);

    const somaPrevistoPorCategoria = dashboard.porCategoria.reduce((s, c) => s + c.valorPrevistoTotal, 0);
    expect(somaPrevistoPorCategoria).toBeCloseTo(dashboard.valorPrevistoTotal, 2);
  });

  it("recusa criar categoria/atualizar etapa para projeto de outro usuário", async () => {
    await expect(createCategory(projectId, userId + 999_999, "X")).rejects.toThrow(/não encontrado/);
  });

  it("remover categoria remove subcategorias e etapas em cascata", async () => {
    const before = await getConstructionTree(projectId, userId);
    const infraCategory = before.find((c) => c.nome === "Infraestrutura")!;
    await removeCategory(infraCategory.id, projectId, userId);

    const after = await getConstructionTree(projectId, userId);
    expect(after.find((c) => c.nome === "Infraestrutura")).toBeUndefined();
  });
});
