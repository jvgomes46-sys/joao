import { describe, expect, it } from "vitest";
import {
  CENARIOS_PADRAO,
  calcularCenario,
  calcularCenarios,
  calcularMatrizSensibilidade1,
  calcularMatrizSensibilidade2,
  calcularParceria,
} from "./scenarioEngine";
import { FinanceEngineInput } from "./financeEngine";

const baseInput: FinanceEngineInput = {
  duracaoAprovacoesMeses: 12,
  duracaoObraMeses: 18,
  inicioVendasMes: 13,
  numeroLotes: 100,
  precoBrutoPorLote: 200_000,
  prazoVendasMeses: 30,
  curvaVendas: "curva_s",
  percentualDeducoesVenda: 0.2,
  percentualEntrada: 0.2,
  numeroParcelas: 24,
  tmaAnualFracao: 0.12,
  capexAprovacoesTotal: 1_000_000,
  curvaObra: "linear",
  gruposCustoObra: { terraplenagem: 5_000_000 },
  capexTotal: 12_000_000,
};

describe("ScenarioEngine — cenários (spec seção 2.10)", () => {
  it("cenário Otimista tem preço maior, prazo de vendas menor e CAPEX menor que o Conservador", () => {
    const [conservador, realista, otimista] = calcularCenarios(baseInput);

    expect(otimista.precoBrutoPorLote).toBeGreaterThan(conservador.precoBrutoPorLote);
    expect(otimista.prazoVendasMeses).toBeLessThan(conservador.prazoVendasMeses);
    expect(otimista.capexTotal).toBeLessThan(conservador.capexTotal);
    expect(realista.precoBrutoPorLote).toBe(baseInput.precoBrutoPorLote);
    expect(realista.capexTotal).toBe(baseInput.capexTotal);
  });

  it("lucro nominal do cenário Otimista é maior que o do Conservador", () => {
    const [conservador, , otimista] = calcularCenarios(baseInput);
    expect(otimista.lucroNominal).toBeGreaterThan(conservador.lucroNominal);
  });

  it("aceita variações customizadas além dos 3 cenários padrão", () => {
    const cenarioCustom = calcularCenario(baseInput, {
      nome: "Crise",
      tipo: "customizado",
      variacaoPrecoFracao: -0.3,
      variacaoAbsorcaoFracao: -0.5,
      variacaoCapexFracao: 0.2,
    });
    expect(cenarioCustom.precoBrutoPorLote).toBeCloseTo(baseInput.precoBrutoPorLote * 0.7, 2);
  });

  it("3 cenários padrão têm nomes Conservador/Realista/Otimista", () => {
    expect(CENARIOS_PADRAO.map((c) => c.nome)).toEqual(["Conservador", "Realista", "Otimista"]);
  });
});

describe("ScenarioEngine — análise de parceria (permuta)", () => {
  it("separa VGV/receita entre terreneiro e incorporadora proporcionalmente à participação", () => {
    const parceria = calcularParceria({
      numeroLotes: 100,
      percentualParceriaTerreno: 0.3,
      vgvTotal: 20_000_000,
      receitaLiquidaTotal: 16_000_000,
      capexTotal: 10_000_000,
    });

    expect(parceria.lotesTerreneiro).toBe(30);
    expect(parceria.lotesIncorporadora).toBe(70);
    expect(parceria.vgvTerreneiro).toBeCloseTo(6_000_000, 2);
    expect(parceria.vgvIncorporadora).toBeCloseTo(14_000_000, 2);
    expect(parceria.receitaLiquidaIncorporadora).toBeCloseTo(16_000_000 * 0.7, 2);
  });

  it("incorporadora arca com 100% do CAPEX independente da fração de permuta", () => {
    const semPermuta = calcularParceria({ numeroLotes: 100, percentualParceriaTerreno: 0, vgvTotal: 20_000_000, receitaLiquidaTotal: 16_000_000, capexTotal: 10_000_000 });
    const comPermuta = calcularParceria({ numeroLotes: 100, percentualParceriaTerreno: 0.5, vgvTotal: 20_000_000, receitaLiquidaTotal: 16_000_000, capexTotal: 10_000_000 });

    // O CAPEX subtraído é o mesmo valor absoluto nos dois casos — só a receita muda.
    expect(semPermuta.receitaLiquidaIncorporadora - semPermuta.lucroIncorporadora).toBeCloseTo(10_000_000, 2);
    expect(comPermuta.receitaLiquidaIncorporadora - comPermuta.lucroIncorporadora).toBeCloseTo(10_000_000, 2);
  });

  it("calcula o percentual de equilíbrio — participação em que o lucro da incorporadora zera", () => {
    const parceria = calcularParceria({
      numeroLotes: 100,
      percentualParceriaTerreno: 0, // não importa para o cálculo do equilíbrio em si
      vgvTotal: 20_000_000,
      receitaLiquidaTotal: 16_000_000,
      capexTotal: 8_000_000,
    });
    // 1 - 8mi/16mi = 0.5 -> com 50% de permuta, receita líquida da incorporadora (8mi) == CAPEX (8mi)
    expect(parceria.percentualEquilibrio).toBeCloseTo(0.5, 4);

    const noEquilibrio = calcularParceria({
      numeroLotes: 100,
      percentualParceriaTerreno: parceria.percentualEquilibrio,
      vgvTotal: 20_000_000,
      receitaLiquidaTotal: 16_000_000,
      capexTotal: 8_000_000,
    });
    expect(noEquilibrio.lucroIncorporadora).toBeCloseTo(0, 2);
  });
});

describe("ScenarioEngine — matrizes de sensibilidade", () => {
  it("matriz 1: sinaliza prejuízo quando a participação do terreneiro é alta demais no cenário Conservador", () => {
    const matriz = calcularMatrizSensibilidade1(baseInput, [0, 0.3, 0.6, 0.9]);
    expect(matriz.length).toBe(3 * 4); // 3 cenários × 4 percentuais

    const conservadorAlta = matriz.find((c) => c.cenario === "Conservador" && c.percentualParceria === 0.9)!;
    const conservadorBaixa = matriz.find((c) => c.cenario === "Conservador" && c.percentualParceria === 0)!;
    expect(conservadorAlta.lucroIncorporadora).toBeLessThan(conservadorBaixa.lucroIncorporadora);
  });

  it("matriz 2: lucro cai conforme o preço de venda cai, mesmo com permuta baixa", () => {
    const matriz = calcularMatrizSensibilidade2(baseInput, [-0.2, 0, 0.2], [0.1, 0.3]);
    expect(matriz.length).toBe(3 * 2);

    const precoBaixo = matriz.find((c) => c.variacaoPrecoFracao === -0.2 && c.percentualParceria === 0.1)!;
    const precoAlto = matriz.find((c) => c.variacaoPrecoFracao === 0.2 && c.percentualParceria === 0.1)!;
    expect(precoBaixo.lucroIncorporadora).toBeLessThan(precoAlto.lucroIncorporadora);
  });

  it("marca prejuizo=true quando o lucro da incorporadora é negativo", () => {
    const matriz = calcularMatrizSensibilidade2(baseInput, [-0.5], [0.8]);
    expect(matriz[0].prejuizo).toBe(matriz[0].lucroIncorporadora < 0);
  });
});
