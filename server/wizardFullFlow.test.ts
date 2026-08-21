import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import { appRouter } from "./routers";
import { getDb } from "./db";
import { projects, users, geoEngineData, costEngineData, salesEngineData, financeEngineData, taxEngineData, configSnapshots } from "../drizzle/schema";
import type { TrpcContext } from "./_core/context";

/**
 * Simula EXATAMENTE a sequência de chamadas que o StudyWizard faz em
 * handleFinish (client/src/components/StudyWizard.tsx) — projects.create,
 * geoEngine.calculate, costEngine.calculate, salesEngine.calculate,
 * financeEngine.calculate, taxEngine.calculate — usando os MESMOS valores
 * padrão do WIZARD_DATA_DEFAULTS, para provar que o wizard reconectado
 * aos motores reais realmente funciona de ponta a ponta.
 */
describe("StudyWizard reconectado — fluxo completo Geo → Cost → Sales → Finance", () => {
  let userId: number;
  let projectId: number;

  function createCaller() {
    const ctx: TrpcContext = {
      user: {
        id: userId,
        openId: "wizard-full-flow-test",
        name: "Wizard Full Flow Test",
        email: null,
        loginMethod: null,
        role: "user",
        createdAt: new Date(),
        updatedAt: new Date(),
        lastSignedIn: new Date(),
      },
      req: {} as TrpcContext["req"],
      res: { clearCookie: () => {} } as unknown as TrpcContext["res"],
    };
    return appRouter.createCaller(ctx);
  }

  beforeAll(async () => {
    const db = await getDb();
    if (!db) throw new Error("DATABASE_URL não configurado — teste requer banco real");
    await db.insert(users).values({ openId: "wizard-full-flow-test", name: "Wizard Full Flow Test" });
    const [user] = await db.select().from(users).where(eq(users.openId, "wizard-full-flow-test")).limit(1);
    userId = user.id;
  });

  afterAll(async () => {
    const db = await getDb();
    if (!db) return;
    if (projectId) {
      await db.delete(geoEngineData).where(eq(geoEngineData.projectId, projectId));
      await db.delete(costEngineData).where(eq(costEngineData.projectId, projectId));
      await db.delete(salesEngineData).where(eq(salesEngineData.projectId, projectId));
      await db.delete(financeEngineData).where(eq(financeEngineData.projectId, projectId));
      await db.delete(taxEngineData).where(eq(taxEngineData.projectId, projectId));
      await db.delete(configSnapshots).where(eq(configSnapshots.projectId, projectId));
    }
    await db.delete(projects).where(eq(projects.userId, userId));
    await db.delete(users).where(eq(users.id, userId));
  });

  it("cria o projeto e roda os 4 motores em sequência com os defaults do wizard", async () => {
    const caller = createCaller();

    // 1) info
    const project = await caller.projects.create({
      name: "Loteamento Teste Wizard Completo",
      description: "",
      type: "loteamento",
      location: "Formosa, GO",
    });
    expect(project).toBeDefined();
    projectId = project!.id;

    // 2) geo — mesmos defaults do WIZARD_DATA_DEFAULTS
    const geoOutput = await caller.geoEngine.calculate({
      projectId,
      areaBruta: 100_000,
      percentualVerde: 15,
      percentualInstitucional: 5,
      percentualSistemaViario: 20,
      modoLotes: "automatico",
      areaMediaLoteAlvo: 300,
    });
    expect(geoOutput.numeroLotes).toBeGreaterThan(0);

    // 3) cost — mesmos defaults do WIZARD_DATA_DEFAULTS
    const costOutput = await caller.costEngine.calculate({
      projectId,
      topografia: "plana",
      padraoPavimentacao: "asfalto",
      solucaoEsgoto: "rede_publica",
      necessitaElevatoria: false,
      solucaoAgua: "rede_publica",
      tipologia: "loteamento_aberto",
      participacaoEletrica: "concessionaria_cobre",
      contingenciaPercentual: 5,
      custoFinanceiroPercentual: 6,
      custoAprovacoesTotal: 0,
    });
    expect(costOutput.capexTotal).toBeGreaterThan(0);

    // 4) sales — mesmos defaults do WIZARD_DATA_DEFAULTS
    const salesOutput = await caller.salesEngine.calculate({
      projectId,
      tipologia: "loteamento_aberto",
      modoPreco: "automatico",
      agioPercentual: 0,
      modoAbsorcao: "automatico",
      comissaoPercentual: 0.06,
      marketingPercentual: 0.03,
      impostosPercentual: 0.06,
      inadimplenciaPercentual: 0.05,
      despesasAdministrativasPercentual: 0.04,
    });
    expect(salesOutput.vgvTotal).toBeGreaterThan(0);
    expect(salesOutput.precoBrutoPorLote).toBeGreaterThan(0);
    expect(salesOutput.prazoVendasMeses).toBeGreaterThan(0);

    // 5) finance — usa o preço/prazo que o SalesEngine calculou, não redigitado
    const financeOutput = await caller.financeEngine.calculate({
      projectId,
      duracaoAprovacoesMeses: 12,
      inicioVendasMes: 6,
      precoBrutoPorLote: salesOutput.precoBrutoPorLote,
      prazoVendasMeses: salesOutput.prazoVendasMeses,
      curvaVendas: "curva_s",
      percentualDeducoesVenda: salesOutput.percentualDeducoesVenda,
      percentualEntrada: 0.2,
      numeroParcelas: 120,
      tmaAnualFracao: 0.14,
      reinvestirCaixaPositivo: false,
      custosIndexados: true,
      recebiveisIndexados: true,
      capexAprovacoesTotal: 0,
      curvaObra: "curva_s",
    });
    expect(financeOutput.fluxoMensal).toHaveLength(120);

    // 6) tax — impostos sobre a receita/lucro reais que os motores anteriores calcularam
    const taxOutput = await caller.taxEngine.calculate({ projectId, regime: "ret", patrimonioAfetacao: true });
    expect(taxOutput.impostosTotais).toBeGreaterThan(0);

    // Confirma que TUDO foi persistido e é lido de volta — o wizard reconectado
    // não deixa nenhum motor "mudo" (só gravando dados brutos sem calcular).
    const geoPersisted = await caller.geoEngine.getByProjectId({ projectId });
    const costPersisted = await caller.costEngine.getByProjectId({ projectId });
    const salesPersisted = await caller.salesEngine.getByProjectId({ projectId });
    const financePersisted = await caller.financeEngine.getByProjectId({ projectId });
    const taxPersisted = await caller.taxEngine.getByProjectId({ projectId });

    expect(geoPersisted?.numeroLotes).toBe(geoOutput.numeroLotes);
    expect(Number(costPersisted?.investimentoTotal)).toBeCloseTo(costOutput.capexTotal, 2);
    expect(Number(salesPersisted?.vgv)).toBeCloseTo(salesOutput.vgvTotal, 2);
    expect(Number(financePersisted?.vpl)).toBeCloseTo(financeOutput.vpl, 2);
    expect(taxPersisted?.regimeTributario).toBe("ret");
  });
});
