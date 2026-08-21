import { describe, expect, it } from "vitest";
import { calcularSalesEngine } from "./salesEngine";

describe("SalesEngine — validado contra a Planilha Mestre de Viabilidade real", () => {
  // Cenário real da planilha: Loteamento Aberto, 186 lotes, área média 360.1675 m²
  it("bate com Premissas!B42 (preço), B44 (VGV) e B60 (absorção) do cenário real", () => {
    const output = calcularSalesEngine({
      numeroLotes: 186,
      areaMediaLote: 360.16752688172045,
      modoPreco: "automatico",
      precoBaseM2Tipologia: 450, // Tabelas!B74 — Loteamento Aberto
      agioPercentual: 0, // Premissas!B43
      modoAbsorcao: "automatico",
      velocidadeAbsorcaoPadrao: 0.015, // Tabelas!C74 — Loteamento Aberto
      comissaoPercentual: 0.06,
      marketingPercentual: 0.03,
      impostosPercentual: 0.06,
      inadimplenciaPercentual: 0.05,
      despesasAdministrativasPercentual: 0.04,
    });

    expect(output.precoM2).toBe(450);
    expect(output.vgvTotal).toBeCloseTo(30146022, -1); // Premissas!B44
    expect(output.absorcaoLotesMes).toBe(3); // Premissas!B60
    expect(output.percentualDeducoesVenda).toBeCloseTo(0.24, 5); // Premissas!B67
  });
});

describe("SalesEngine — regra 12 (seção 6) e casos de borda", () => {
  const base = {
    numeroLotes: 100,
    areaMediaLote: 300,
    comissaoPercentual: 0.05,
    marketingPercentual: 0.02,
    impostosPercentual: 0.05,
    inadimplenciaPercentual: 0.03,
    despesasAdministrativasPercentual: 0.02,
  };

  it("modo automático de preço usa matriz × (1+ágio)", () => {
    const output = calcularSalesEngine({
      ...base,
      modoPreco: "automatico",
      precoBaseM2Tipologia: 400,
      agioPercentual: 0.1,
      modoAbsorcao: "manual",
      absorcaoManualLotesMes: 5,
    });
    expect(output.precoM2).toBeCloseTo(440, 2);
  });

  it("modo manual de preço usa o valor digitado, ignorando a matriz", () => {
    const output = calcularSalesEngine({
      ...base,
      modoPreco: "manual",
      precoManualM2: 999,
      precoBaseM2Tipologia: 400, // deve ser ignorado
      modoAbsorcao: "manual",
      absorcaoManualLotesMes: 5,
    });
    expect(output.precoM2).toBe(999);
  });

  it("modo automático de absorção usa fração da matriz × número de lotes, mínimo 1", () => {
    const output = calcularSalesEngine({
      ...base,
      numeroLotes: 10,
      modoPreco: "manual",
      precoManualM2: 500,
      modoAbsorcao: "automatico",
      velocidadeAbsorcaoPadrao: 0.01, // 10*0.01=0.1 -> arredonda para 0 -> MAX(1,...) = 1
    });
    expect(output.absorcaoLotesMes).toBe(1);
  });

  it("modo manual de absorção usa o valor digitado", () => {
    const output = calcularSalesEngine({
      ...base,
      modoPreco: "manual",
      precoManualM2: 500,
      modoAbsorcao: "manual",
      absorcaoManualLotesMes: 7,
    });
    expect(output.absorcaoLotesMes).toBe(7);
    expect(output.prazoVendasMeses).toBe(Math.ceil(100 / 7));
  });

  it("modo automático sem precoBaseM2Tipologia lança erro", () => {
    expect(() =>
      calcularSalesEngine({ ...base, modoPreco: "automatico", modoAbsorcao: "manual", absorcaoManualLotesMes: 5 })
    ).toThrow();
  });

  it("modo manual sem precoManualM2 lança erro", () => {
    expect(() => calcularSalesEngine({ ...base, modoPreco: "manual", modoAbsorcao: "manual", absorcaoManualLotesMes: 5 })).toThrow();
  });

  it("deduções somam os 5 componentes corretamente", () => {
    const output = calcularSalesEngine({
      ...base,
      modoPreco: "manual",
      precoManualM2: 500,
      modoAbsorcao: "manual",
      absorcaoManualLotesMes: 5,
    });
    expect(output.percentualDeducoesVenda).toBeCloseTo(0.17, 5);
    expect(output.deducoesTotalReais).toBeCloseTo(output.vgvTotal * 0.17, 2);
  });
});
