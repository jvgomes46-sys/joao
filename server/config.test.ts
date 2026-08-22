import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import { getDb } from "./db";
import { configSnapshots, configLegislation } from "../drizzle/schema";
import {
  createConfigSnapshot,
  extrairUfDaLocalizacao,
  separarMunicipioUf,
  getAllCurrentUnitCosts,
  getCostParameter,
  getLatestConfigSnapshot,
  getLegislationForLocation,
  getMergedUnitCosts,
  getPrazoAprovacao,
  getPrazoObraPorPorte,
  getTaxRegime,
  getTypologyMatrixEntry,
} from "./config";
import { configUnitCosts } from "../drizzle/schema";

describe("Módulo de Configuração", () => {
  it("cai no piso federal quando o município não está cadastrado", async () => {
    const legislation = await getLegislationForLocation("Município Inexistente XYZ", "GO");
    expect(legislation.usedFederalFallback).toBe(true);
    expect(Number(legislation.areaMinimaLote)).toBe(125);
    expect(Number(legislation.frenteMinimaLote)).toBe(5);
  });

  it("lê o BDI padrão configurado", async () => {
    const bdi = await getCostParameter("bdi_infraestrutura");
    expect(Number(bdi.valor)).toBe(20); // calibrado a partir do orçamento real Residencial Mirante (Formosa/GO)
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
    const db = await getDb();
    await db!.delete(configSnapshots).where(eq(configSnapshots.projectId, fakeProjectId));
    expect((snapshot!.snapshotData as { areaMinimaLote: number }).areaMinimaLote).toBe(125);
    expect((snapshot!.overrides as { bdi: number }).bdi).toBe(22);
  });

  it("extrai a UF de textos livres de localização em vários formatos", () => {
    expect(extrairUfDaLocalizacao("Formosa, GO")).toBe("GO");
    expect(extrairUfDaLocalizacao("Formosa - GO")).toBe("GO");
    expect(extrairUfDaLocalizacao("Formosa/GO")).toBe("GO");
    expect(extrairUfDaLocalizacao("Formosa go")).toBe("GO");
    expect(extrairUfDaLocalizacao("Cambyretá, Paraguai")).toBeNull();
    expect(extrairUfDaLocalizacao(null)).toBeNull();
    expect(extrairUfDaLocalizacao("")).toBeNull();
  });

  it("getMergedUnitCosts sobrepõe a região sobre o nacional sem zerar itens não cobertos pela região", async () => {
    const db = await getDb();
    await db!.insert(configUnitCosts).values([
      { grupo: "terraplenagem", itemCodigo: "corte_aterro", itemDescricao: "teste", unidade: "m3", valorUnitario: "999.99", regiao: "GO-TESTE-MERGE", dataBase: new Date() },
    ]);

    const nacional = await getAllCurrentUnitCosts("Nacional");
    const merged = await getMergedUnitCosts("GO-TESTE-MERGE");

    // item coberto pela região -> usa o valor regional
    const corteAterroMerged = merged.find((r) => r.itemCodigo === "corte_aterro");
    expect(Number(corteAterroMerged!.valorUnitario)).toBe(999.99);

    // itens NÃO cobertos pela região continuam presentes (com o valor nacional), não zerados/ausentes
    expect(merged.length).toBe(nacional.length);
    const outroItem = merged.find((r) => r.itemCodigo === "regularizacao");
    expect(outroItem).toBeDefined();
    expect(Number(outroItem!.valorUnitario)).toBeGreaterThan(0);

    await db!.delete(configUnitCosts).where(eq(configUnitCosts.regiao, "GO-TESTE-MERGE"));
  });
});

describe("getLegislationForLocation — casamento do município a partir do texto livre", () => {
  const MUNICIPIO = "Formosa Teste Config";

  beforeAll(async () => {
    const db = await getDb();
    await db!.insert(configLegislation).values({
      municipio: MUNICIPIO, uf: "GO",
      percentualAreaVerdeMin: "20", percentualAreaInstitucionalMin: "8",
      percentualSistemaViarioMin: "25", areaMinimaLote: "200", isFederalFallback: false,
    });
  });

  afterAll(async () => {
    const db = await getDb();
    await db!.delete(configLegislation).where(eq(configLegislation.municipio, MUNICIPIO));
  });

  it("separa município e UF nos formatos aceitos pelo wizard", () => {
    expect(separarMunicipioUf("Formosa, GO")).toEqual({ municipio: "Formosa", uf: "GO" });
    expect(separarMunicipioUf("Formosa - GO")).toEqual({ municipio: "Formosa", uf: "GO" });
    expect(separarMunicipioUf("Formosa/GO")).toEqual({ municipio: "Formosa", uf: "GO" });
    expect(separarMunicipioUf("Formosa")).toEqual({ municipio: "Formosa", uf: null });
  });

  it("casa o município mesmo com a UF no texto (formato que o wizard sugere)", async () => {
    const leg = await getLegislationForLocation(`${MUNICIPIO}, GO`);
    expect(leg.usedFederalFallback).toBe(false);
    expect(Number(leg.percentualAreaVerdeMin)).toBe(20);
  });

  it("casa ignorando caixa, acentos e espaços extras", async () => {
    for (const variacao of [`  ${MUNICIPIO.toUpperCase()}  - GO`, `${MUNICIPIO}/go`, MUNICIPIO]) {
      const leg = await getLegislationForLocation(variacao);
      expect(leg.usedFederalFallback).toBe(false);
    }
  });

  it("UF divergente não casa — cai no piso federal em vez de usar a lei de outro estado", async () => {
    const leg = await getLegislationForLocation(`${MUNICIPIO}, SP`);
    expect(leg.usedFederalFallback).toBe(true);
  });

  it("município não cadastrado cai no piso federal", async () => {
    const leg = await getLegislationForLocation("Cidade Inexistente, MG");
    expect(leg.usedFederalFallback).toBe(true);
    expect(Number(leg.percentualAreaVerdeMin)).toBe(15);
  });
});
