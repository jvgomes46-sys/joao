import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import { getDb, createProject } from "../db";
import { runGeoEngine } from "./geoEngineService";
import { seedApprovalsForProject, listApprovals } from "./approvalsService";
import { projects, users, geoEngineData, approvals, configSnapshots } from "../../drizzle/schema";

describe("ApprovalsService — checklist de Aprovação/Licenciamento (FASE 2, spec seção 3)", () => {
  let userId: number;
  let projectId: number;

  beforeAll(async () => {
    const db = await getDb();
    if (!db) throw new Error("DATABASE_URL não configurado — teste requer banco real");

    await db.insert(users).values({ openId: "approvals-test-user", name: "Approvals Test" });
    const [user] = await db.select().from(users).where(eq(users.openId, "approvals-test-user")).limit(1);
    userId = user.id;

    const project = await createProject({
      userId,
      name: "Loteamento Teste Aprovações",
      type: "loteamento",
      location: "Município Sem Legislação Cadastrada — Teste Aprovações",
    });
    projectId = project!.id;
  });

  afterAll(async () => {
    const db = await getDb();
    if (!db) return;
    await db.delete(geoEngineData).where(eq(geoEngineData.projectId, projectId));
    await db.delete(approvals).where(eq(approvals.projectId, projectId));
    await db.delete(configSnapshots).where(eq(configSnapshots.projectId, projectId));
    await db.delete(projects).where(eq(projects.id, projectId));
    await db.delete(users).where(eq(users.id, userId));
  });

  it("recusa semear o checklist sem o GeoEngine ter rodado antes", async () => {
    await expect(seedApprovalsForProject(projectId, userId)).rejects.toThrow(/GeoEngine/);
  });

  it("semeia o checklist a partir do GRAPROHAB (14 itens) + módulo 2.5 (13 itens) e não duplica ao rodar de novo", async () => {
    await runGeoEngine(projectId, userId, { areaBruta: 150_000, modoLotes: "automatico", areaMediaLoteAlvo: 280 });

    const seeded = await seedApprovalsForProject(projectId, userId);
    expect(seeded).toHaveLength(27); // 14 GRAPROHAB + 13 do módulo 2.5

    const grupos = new Set(seeded.map((a) => a.grupo));
    expect(grupos).toEqual(new Set(["graprohab", "levantamentos", "ambiental", "taxas_oficiais", "concessionarias"]));
    expect(seeded.every((a) => a.status === "nao_iniciado")).toBe(true);

    // idempotente — rodar de novo não duplica
    const seededAgain = await seedApprovalsForProject(projectId, userId);
    expect(seededAgain).toHaveLength(27);

    const listed = await listApprovals(projectId, userId);
    expect(listed).toHaveLength(27);
  });

  it("recusa listar/semear para projeto de outro usuário", async () => {
    await expect(listApprovals(projectId, userId + 999_999)).rejects.toThrow(/não encontrado/);
  });
});
