import { describe, expect, it } from "vitest";
import { calcularPortfolio, type ProjetoNoPortfolio } from "./portfolioEngine";

function projeto(over: Partial<ProjetoNoPortfolio> = {}): ProjetoNoPortfolio {
  return {
    projectId: 1,
    nome: "P",
    offsetMeses: 0,
    fluxoLiquidoMensal: [-100, -100, 300],
    vgv: 1000,
    capexTotal: 200,
    vpl: 50,
    tmaAnualFracao: 0.14,
    ...over,
  };
}

describe("portfolioEngine", () => {
  it("portfólio vazio não quebra e diz por que a TIR não existe", () => {
    const out = calcularPortfolio([]);
    expect(out.numeroProjetos).toBe(0);
    expect(out.tirAnualConsolidada).toBeNull();
    expect(out.tirIndisponivelMotivo).toMatch(/Nenhum projeto/);
  });

  it("soma VGV, CAPEX e VPL entre projetos", () => {
    const out = calcularPortfolio([projeto(), projeto({ projectId: 2, nome: "Q" })]);
    expect(out.numeroProjetos).toBe(2);
    expect(out.vgvTotal).toBe(2000);
    expect(out.capexTotal).toBe(400);
    expect(out.vplSomado).toBe(100);
  });

  it("projetos simultâneos: a exposição consolidada é a soma (picos coincidem)", () => {
    const out = calcularPortfolio([projeto(), projeto({ projectId: 2 })]);
    // ambos: -100, -200 acumulado, depois +300 -> pico -200 cada, juntos -400
    expect(out.exposicaoMaximaConsolidada).toBe(-400);
    expect(out.somaDasExposicoesIndividuais).toBe(-400);
    expect(out.economiaVsSomaIngenua).toBe(0);
    expect(out.mesDaExposicaoMaxima).toBe(2);
  });

  it("projetos escalonados: a exposição consolidada é MENOR que a soma dos picos", () => {
    // O segundo começa quando o primeiro já está gerando caixa.
    const out = calcularPortfolio([
      projeto({ projectId: 1, offsetMeses: 0 }),
      projeto({ projectId: 2, offsetMeses: 2 }),
    ]);
    // consolidado: m1 -100 | m2 -100 | m3 300-100=200 | m4 -100 | m5 300
    // acumulado:   -100, -200, 0, -100, 200  -> pico -200
    expect(out.exposicaoMaximaConsolidada).toBe(-200);
    expect(out.somaDasExposicoesIndividuais).toBe(-400); // soma ingênua exagera
    expect(out.economiaVsSomaIngenua).toBe(200); // escalonar economiza 200 de capital
  });

  it("horizonte do portfólio cobre o projeto que termina mais tarde", () => {
    const out = calcularPortfolio([projeto({ offsetMeses: 0 }), projeto({ projectId: 2, offsetMeses: 5 })]);
    expect(out.fluxoConsolidado).toHaveLength(8); // 5 de offset + 3 meses
    expect(out.fluxoConsolidado.at(-1)!.mes).toBe(8);
  });

  it("TIR consolidada é a TIR do fluxo somado, não a média das TIRs", () => {
    // Dois projetos idênticos e simultâneos: o fluxo dobra, mas a TIR é a MESMA
    // (escalar um fluxo não muda sua TIR). Uma "média" ingênua daria o mesmo
    // por acidente aqui, então usamos projetos de perfis diferentes abaixo.
    const um = calcularPortfolio([projeto()]);
    const dois = calcularPortfolio([projeto(), projeto({ projectId: 2 })]);
    expect(dois.tirMensalConsolidada).toBeCloseTo(um.tirMensalConsolidada!, 8);
  });

  it("com perfis diferentes, a TIR consolidada não é a média aritmética das individuais", () => {
    const rapido = projeto({ projectId: 1, fluxoLiquidoMensal: [-100, 200] });
    const lento = projeto({ projectId: 2, fluxoLiquidoMensal: [-100, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 160] });
    const tirRapido = calcularPortfolio([rapido]).tirMensalConsolidada!;
    const tirLento = calcularPortfolio([lento]).tirMensalConsolidada!;
    const consolidada = calcularPortfolio([rapido, lento]).tirMensalConsolidada!;

    const mediaAritmetica = (tirRapido + tirLento) / 2;
    expect(consolidada).not.toBeCloseTo(mediaAritmetica, 4);
    // e fica entre as duas, como esperado de um fluxo combinado
    expect(consolidada).toBeGreaterThan(tirLento);
    expect(consolidada).toBeLessThan(tirRapido);
  });

  it("alerta quando os projetos usam TMAs diferentes (VPL somado mistura taxas)", () => {
    const out = calcularPortfolio([projeto(), projeto({ projectId: 2, tmaAnualFracao: 0.18 })]);
    expect(out.tmasDivergentes).toBe(true);
    expect(out.alertas.some((a) => /TMAs diferentes/.test(a))).toBe(true);
  });

  it("avisa quando os projetos foram alinhados no mesmo mês por falta de data de início", () => {
    const out = calcularPortfolio([projeto(), projeto({ projectId: 2 })]);
    expect(out.alertas.some((a) => /alinhados no mesmo mês inicial/.test(a))).toBe(true);
  });
});
