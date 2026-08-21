import { afterAll, describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import { getDb } from "../db";
import { createConfigRow, deleteConfigRow, listConfigRows, updateConfigRow } from "./adminConfigService";
import { configCostParameters } from "../../drizzle/schema";

describe("AdminConfigService — CRUD administrativo do Módulo de Configuração (spec seção 5)", () => {
  let createdId: number | undefined;

  afterAll(async () => {
    const db = await getDb();
    if (!db || createdId === undefined) return;
    await db.delete(configCostParameters).where(eq(configCostParameters.id, createdId));
  });

  it("recusa listar/criar/editar/apagar para usuário não-admin", async () => {
    await expect(listConfigRows("cost_parameters", "user")).rejects.toThrow(/administradores/);
    await expect(createConfigRow("cost_parameters", "user", {})).rejects.toThrow(/administradores/);
    await expect(updateConfigRow("cost_parameters", "user", 1, {})).rejects.toThrow(/administradores/);
    await expect(deleteConfigRow("cost_parameters", "user", 1)).rejects.toThrow(/administradores/);
  });

  it("permite CRUD completo para admin", async () => {
    const chave = `teste_admin_${Date.now()}`;
    const rowsAfterCreate = await createConfigRow("cost_parameters", "admin", {
      chave,
      valor: "12.34",
      regiao: "Nacional",
      dataBase: new Date(),
    });
    const created = rowsAfterCreate.find((r: any) => r.chave === chave);
    expect(created).toBeDefined();
    createdId = (created as any).id;

    const rowsAfterUpdate = await updateConfigRow("cost_parameters", "admin", createdId!, { valor: "56.78" });
    const updated = rowsAfterUpdate.find((r: any) => r.id === createdId);
    expect(Number((updated as any).valor)).toBeCloseTo(56.78, 2);

    const rowsAfterDelete = await deleteConfigRow("cost_parameters", "admin", createdId!);
    expect(rowsAfterDelete.find((r: any) => r.id === createdId)).toBeUndefined();
    createdId = undefined;
  });
});
