import { describe, expect, it } from "vitest";
import { calcularTaxEngine, LIMITE_ANUAL_ADICIONAL_IRPJ } from "./taxEngine";

describe("TaxEngine — RET", () => {
  it("calcula o imposto unificado sobre a receita bruta", () => {
    const output = calcularTaxEngine({
      regime: "ret",
      receitaBrutaTotal: 1_000_000,
      lucroContabil: 300_000,
      aliquotas: { unificada: 4 },
    });
    expect(output.impostosTotais).toBeCloseTo(40_000, 2);
    expect(output.linhas).toHaveLength(1);
  });

  it("aplica o redutor social sobre o valor do RET", () => {
    const output = calcularTaxEngine({
      regime: "ret",
      receitaBrutaTotal: 1_000_000,
      lucroContabil: 300_000,
      redutorSocialReais: 10_000,
      aliquotas: { unificada: 4 },
    });
    expect(output.impostosTotais).toBeCloseTo(30_000, 2);
  });

  it("alerta quando não há patrimônio de afetação", () => {
    const semAfetacao = calcularTaxEngine({
      regime: "ret",
      receitaBrutaTotal: 1_000_000,
      lucroContabil: 300_000,
      patrimonioAfetacao: false,
      aliquotas: { unificada: 4 },
    });
    expect(semAfetacao.alertas.some((a) => a.includes("patrimônio de afetação"))).toBe(true);

    const comAfetacao = calcularTaxEngine({
      regime: "ret",
      receitaBrutaTotal: 1_000_000,
      lucroContabil: 300_000,
      patrimonioAfetacao: true,
      aliquotas: { unificada: 4 },
    });
    expect(comAfetacao.alertas.some((a) => a.includes("patrimônio de afetação"))).toBe(false);
  });
});

describe("TaxEngine — Lucro Presumido", () => {
  it("calcula IRPJ+adicional+CSLL sobre o lucro e PIS/COFINS sobre a receita", () => {
    const output = calcularTaxEngine({
      regime: "lucro_presumido",
      receitaBrutaTotal: 1_000_000,
      lucroContabil: 500_000,
      aliquotas: { irpj: 15, adicionalIrpj: 10, csll: 9, pis: 0.65, cofins: 3 },
    });

    const irpj = output.linhas.find((l) => l.nome === "IRPJ")!;
    const adicional = output.linhas.find((l) => l.nome.includes("Adicional"))!;
    const csll = output.linhas.find((l) => l.nome === "CSLL")!;
    const pis = output.linhas.find((l) => l.nome === "PIS")!;
    const cofins = output.linhas.find((l) => l.nome === "COFINS")!;

    expect(irpj.valor).toBeCloseTo(500_000 * 0.15, 2);
    expect(adicional.baseCalculo).toBeCloseTo(500_000 - LIMITE_ANUAL_ADICIONAL_IRPJ, 2);
    expect(adicional.valor).toBeCloseTo((500_000 - LIMITE_ANUAL_ADICIONAL_IRPJ) * 0.1, 2);
    expect(csll.valor).toBeCloseTo(500_000 * 0.09, 2);
    expect(pis.valor).toBeCloseTo(1_000_000 * 0.0065, 2);
    expect(cofins.valor).toBeCloseTo(1_000_000 * 0.03, 2);
  });

  it("não aplica adicional de IRPJ quando o lucro está abaixo do limite anual", () => {
    const output = calcularTaxEngine({
      regime: "lucro_presumido",
      receitaBrutaTotal: 500_000,
      lucroContabil: 100_000, // abaixo de R$ 240.000/ano
      aliquotas: { irpj: 15, adicionalIrpj: 10, csll: 9, pis: 0.65, cofins: 3 },
    });
    const adicional = output.linhas.find((l) => l.nome.includes("Adicional"))!;
    expect(adicional.valor).toBe(0);
  });
});

describe("TaxEngine — Lucro Real (com IBS/CBS)", () => {
  it("calcula IRPJ+adicional+CSLL+IBS+CBS e o comparativo da reforma tributária", () => {
    const output = calcularTaxEngine({
      regime: "lucro_real",
      receitaBrutaTotal: 1_000_000,
      lucroContabil: 500_000,
      aliquotas: { irpj: 15, adicionalIrpj: 10, csll: 9, ibs: 17.7, cbs: 8.8, pis: 0.65, cofins: 3 },
    });

    const ibs = output.linhas.find((l) => l.nome === "IBS")!;
    const cbs = output.linhas.find((l) => l.nome === "CBS")!;
    expect(ibs.valor).toBeCloseTo(1_000_000 * 0.177, 2);
    expect(cbs.valor).toBeCloseTo(1_000_000 * 0.088, 2);

    expect(output.comparativoReforma).not.toBeNull();
    expect(output.comparativoReforma!.totalIbsCbs).toBeCloseTo(ibs.valor + cbs.valor, 2);
    expect(output.comparativoReforma!.totalRegimeAtual).toBeCloseTo(1_000_000 * 0.0365, 2);
    expect(output.comparativoReforma!.diferenca).toBeGreaterThan(0); // IBS/CBS (26,5%) > PIS/COFINS (3,65%)
  });

  it("RET e Lucro Presumido não têm comparativo de reforma (só se aplica a Lucro Real)", () => {
    const ret = calcularTaxEngine({ regime: "ret", receitaBrutaTotal: 1_000_000, lucroContabil: 300_000, aliquotas: { unificada: 4 } });
    expect(ret.comparativoReforma).toBeNull();

    const presumido = calcularTaxEngine({
      regime: "lucro_presumido",
      receitaBrutaTotal: 1_000_000,
      lucroContabil: 300_000,
      aliquotas: { irpj: 15, csll: 9, pis: 0.65, cofins: 3 },
    });
    expect(presumido.comparativoReforma).toBeNull();
  });
});

describe("TaxEngine — indicadores e alertas gerais", () => {
  it("calcula carga tributária sobre receita e lucro líquido após impostos", () => {
    const output = calcularTaxEngine({
      regime: "ret",
      receitaBrutaTotal: 1_000_000,
      lucroContabil: 300_000,
      aliquotas: { unificada: 4 },
    });
    expect(output.cargaTributariaSobreReceita).toBeCloseTo(0.04, 4);
    expect(output.lucroLiquidoAposImpostos).toBeCloseTo(300_000 - 40_000, 2);
  });

  it("alerta quando a carga tributária sobre a receita ultrapassa 15%", () => {
    const output = calcularTaxEngine({
      regime: "lucro_real",
      receitaBrutaTotal: 1_000_000,
      lucroContabil: 500_000,
      aliquotas: { irpj: 15, adicionalIrpj: 10, csll: 9, ibs: 17.7, cbs: 8.8 },
    });
    expect(output.alertas.some((a) => a.includes("Carga tributária"))).toBe(true);
  });
});
