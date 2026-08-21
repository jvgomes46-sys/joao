import { describe, expect, it } from "vitest";
import {
  createConfigSnapshot,
  getCostParameter,
  getLatestConfigSnapshot,
  getLegislationForLocation,
  getPrazoAprovacao,
  getPrazoObraPorPorte,
  getTaxRegime,
  getTypologyMatrixEntry,
} from "./config";

describe("Módulo de Configuração", () => {
  it("cai no piso federal quando o município não está cadastrado", async () => {
    const legislation = await getLegislationForLocation("Município Inexistente XYZ", "GO");
    expect(legislation.usedFederalFallback).toBe(true);
    expect(Number(legislation.areaMinimaLote)).toBe(125);
    expect(Number(legislation.frenteMinimaLote)).toBe(5);
  });

  it("lê o BDI padrão configurado", async () => {
    const bdi = await getCostParameter("bdi_infraestrutura");
    expect(Number(bdi.valor)).toBe(25);
  });

  it("lê a matriz de tipologia com flags de condomínio corretas", async () => {
    const loteamentoAberto = await getTypologyMatrixEntry("loteamento_aberto");
    expect(loteamentoAberto.temMuro).toBe(false);
    expect(loteamentoAberto.temPortaria).toBe(false);

    const condominio = await getTypologyMatrixEntry("condominio_fechado");
    expect(condominio.temMuro).toBe(true);
    expect(condominio.temPortaria).toBe(true);
    expect(condominio.temAreaLazer).toBe(true);
  });

  it("calcula prazo de obra por faixa de porte da gleba", async () => {
    const pequena = await getPrazoObraPorPorte(20000);
    expect(pequena.prazoMeses).toBe(12);

    const grande = await getPrazoObraPorPorte(200000);
    expect(grande.prazoMeses).toBe(24);
  });

  it("soma adicionais condicionais ao prazo de aprovação (ETE + supressão)", async () => {
    const semAdicionais = await getPrazoAprovacao([]);
    expect(semAdicionais.prazoTotalMeses).toBe(12);

    const comEteESupressao = await getPrazoAprovacao(["ete_propria", "supressao_vegetal"]);
    expect(comEteESupressao.prazoTotalMeses).toBe(12 + 6 + 6);
    expect(comEteESupressao.adicionaisAplicados).toHaveLength(2);
  });

  it("lê regime tributário RET do Brasil", async () => {
    const ret = await getTaxRegime("Brasil", "ret");
    expect((ret.aliquotas as { unificada: number }).unificada).toBe(4.0);
  });

  it("grava e recupera snapshot de configuração de um estudo (auditabilidade)", async () => {
    const fakeProjectId = 999999; // não precisa existir na tabela projects para este teste de infra
    await createConfigSnapshot({
      projectId: fakeProjectId,
      engine: "geo_engine",
      snapshotData: { percentualAreaVerdeMin: 15, areaMinimaLote: 125 },
      overrides: { bdi: 22 },
    });

    const snapshot = await getLatestConfigSnapshot(fakeProjectId, "geo_engine");
    expect(snapshot).toBeDefined();
    expect((snapshot!.snapshotData as { areaMinimaLote: number }).areaMinimaLote).toBe(125);
    expect((snapshot!.overrides as { bdi: number }).bdi).toBe(22);
  });
});
