import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { eq, inArray } from "drizzle-orm";
import { appRouter } from "./routers";
import { getDb } from "./db";
import {
  projects,
  users,
  geoEngineData,
  costEngineData,
  salesEngineData,
  financeEngineData,
  taxEngineData,
  configSnapshots,
} from "../drizzle/schema";
import type { TrpcContext } from "./_core/context";

/**
 * Simula o fluxo completo do StudyWizard batendo direto no appRouter
 * (mesmo padrão de server/auth.logout.test.ts), contra o MySQL real —
 * sem isso, não dá pra provar que "o wizard grava no banco" de verdade.
 */
describe("StudyWizard → Banco (fluxo completo via tRPC)", () => {
  let userId: number;

  function createCaller() {
    const ctx: TrpcContext = {
      user: { id: userId, openId: "wizard-flow-test", name: "Wizard Test", email: null, loginMethod: null, role: "user", createdAt: new Date(), updatedAt: new Date(), lastSignedIn: new Date() },
      req: {} as TrpcContext["req"],
      res: { clearCookie: () => {} } as unknown as TrpcContext["res"],
    };
    return appRouter.createCaller(ctx);
  }

  beforeAll(async () => {
    const db = await getDb();
    if (!db) throw new Error("DATABASE_URL não configurado — teste requer banco real");
    await db.insert(users).values({ openId: "wizard-flow-test", name: "Wizard Test" });
    const [user] = await db.select().from(users).where(eq(users.openId, "wizard-flow-test")).limit(1);
    userId = user.id;
  });

  afterAll(async () => {
    const db = await getDb();
    if (!db) return;
    const ownedProjects = await db.select({ id: projects.id }).from(projects).where(eq(projects.userId, userId));
    const projectIds = ownedProjects.map((p) => p.id);
    if (projectIds.length > 0) {
      await db.delete(geoEngineData).where(inArray(geoEngineData.projectId, projectIds));
      await db.delete(costEngineData).where(inArray(costEngineData.projectId, projectIds));
      await db.delete(salesEngineData).where(inArray(salesEngineData.projectId, projectIds));
      await db.delete(financeEngineData).where(inArray(financeEngineData.projectId, projectIds));
      await db.delete(taxEngineData).where(inArray(taxEngineData.projectId, projectIds));
      await db.delete(configSnapshots).where(inArray(configSnapshots.projectId, projectIds));
    }
    await db.delete(projects).where(eq(projects.userId, userId));
    await db.delete(users).where(eq(users.id, userId));
  });

  it("cria o projeto e persiste dados de todas as 5 etapas técnicas/financeiras", async () => {
    const caller = createCaller();

    const project = await caller.projects.create({
      name: "Loteamento Wizard E2E",
      description: "Teste de fluxo completo",
      type: "loteamento",
      location: "Cidade Sem Legislação Cadastrada — Teste E2E",
    });
    expect(project).toBeDefined();
    const projectId = project!.id;

    const geoResult = await caller.geoEngine.calculate({
      projectId,
      areaBruta: 150_000,
      areaAPP: 8_000,
      percentualVerde: 15,
      percentualInstitucional: 5,
      percentualSistemaViario: 20,
      modoLotes: "automatico",
      areaMediaLoteAlvo: 280,
    });
    expect(geoResult.numeroLotes).toBeGreaterThan(0);

    await caller.costEngine.save({
      projectId,
      terraplanagem: 12.5,
      pavimentacao: 45.0,
    });

    await caller.salesEngine.save({
      projectId,
      vgv: 25_000_000,
      precoMedioM2: 350,
      velocidadeVendas: 6,
    });

    await caller.financeEngine.save({
      projectId,
      tmaUtilizada: 12,
      capitalDisponivel: 3_000_000,
    });

    await caller.taxEngine.save({
      projectId,
      regimeTributario: "ret",
    });

    // Verifica que TUDO foi persistido — nada foi descartado silenciosamente
    const geo = await caller.geoEngine.getByProjectId({ projectId });
    expect(geo).toBeDefined();
    expect(geo!.numeroLotes).toBe(geoResult.numeroLotes);

    const cost = await caller.costEngine.getByProjectId({ projectId });
    expect(Number(cost!.terraplanagem)).toBe(12.5);
    expect(Number(cost!.pavimentacao)).toBe(45.0);

    const sales = await caller.salesEngine.getByProjectId({ projectId });
    expect(Number(sales!.vgv)).toBe(25_000_000);
    expect((sales!.curvaVendas as { velocidadeMensalLotes: number }).velocidadeMensalLotes).toBe(6);

    const finance = await caller.financeEngine.getByProjectId({ projectId });
    expect(Number(finance!.tmaUtilizada)).toBe(12);
    expect(Number(finance!.capitalProprio)).toBe(3_000_000);

    const tax = await caller.taxEngine.getByProjectId({ projectId });
    expect(tax!.regimeTributario).toBe("ret");
  });

  it("rejeita acesso a dados de projeto de outro usuário", async () => {
    const caller = createCaller();
    const outroUsuarioProjectId = 999999999;

    await expect(caller.geoEngine.getByProjectId({ projectId: outroUsuarioProjectId })).rejects.toThrow();
  });
});
