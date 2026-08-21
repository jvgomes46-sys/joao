import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import { getDb, createProject } from "../db";
import { runGeoEngine } from "./geoEngineService";
import { getLegalComplianceChecklist } from "./legalComplianceService";
import { projects, users, geoEngineData, configSnapshots } from "../../drizzle/schema";

describe("LegalComplianceService — checklist Lei 6.766/79 (spec seção 2.6)", () => {
  let userId: number;
  let projectId: number;

  beforeAll(async () => {
    const db = await getDb();
    if (!db) throw new Error("DATABASE_URL não configurado — teste requer banco real");

    await db.insert(users).values({ openId: "legalcompliance-test-user", name: "LegalCompliance Test" });
    const [user] = await db.select().from(users).where(eq(users.openId, "legalcompliance-test-user")).limit(1);
    userId = user.id;

    const project = await createProject({
      userId,
      name: "Loteamento Teste Conformidade Legal",
      type: "loteamento",
      location: "Município Sem Legislação Cadastrada — Teste Conformidade Legal",
    });
    projectId = project!.id;
  });

  afterAll(async () => {
    const db = await getDb();
    if (!db) return;
    await db.delete(geoEngineData).where(eq(geoEngineData.projectId, projectId));
    await db.delete(configSnapshots).where(eq(configSnapshots.projectId, projectId));
    await db.delete(projects).where(eq(projects.id, projectId));
    await db.delete(users).where(eq(users.id, userId));
  });

  it("recusa montar o checklist sem o GeoEngine ter rodado antes", async () => {
    await expect(getLegalComplianceChecklist(projectId, userId)).rejects.toThrow(/GeoEngine/);
  });

  it("usa a área média de lote do GeoEngine e aplica o piso federal de 125m²", async () => {
    await runGeoEngine(projectId, userId, { areaBruta: 150_000, modoLotes: "automatico", areaMediaLoteAlvo: 280 });

    const checklist = await getLegalComplianceChecklist(projectId, userId);
    const itemAreaMinima = checklist.itens.find((i) => i.id === "area_minima_lote")!;
    expect(itemAreaMinima.status).toBe("ok"); // 280m² informado no modo automático >= 125m²
    expect(checklist.avisoPisoFederal).toMatch(/plano diretor/i);
  });

  it("aceita extras (declividade, curso d'água) via input do wizard/relatório", async () => {
    const checklist = await getLegalComplianceChecklist(projectId, userId, {
      declividadeTerrenoPercentual: 40,
      possuiCursoDagua: true,
      faixaNonAedificandiM: 10,
    });
    expect(checklist.itens.find((i) => i.id === "declividade_terreno")!.status).toBe("rever_atencao");
    expect(checklist.itens.find((i) => i.id === "faixa_non_aedificandi")!.status).toBe("rever_atencao");
    expect(checklist.conformidade).toBe(false);
  });

  it("recusa para projeto de outro usuário", async () => {
    await expect(getLegalComplianceChecklist(projectId, userId + 999_999)).rejects.toThrow(/não encontrado/);
  });
});
