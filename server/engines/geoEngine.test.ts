import { describe, expect, it } from "vitest";
import { calcularGeoEngine, calcularLotesPorTipologia } from "./geoEngine";

describe("GeoEngine — cálculo puro", () => {
  it("deduz APP/Reserva Legal antes de aplicar percentuais (spec 2.1)", () => {
    const semAPP = calcularGeoEngine({
      areaBruta: 100_000,
      modoLotes: "automatico",
      areaMediaLoteAlvo: 250,
    });
    const comAPP = calcularGeoEngine({
      areaBruta: 100_000,
      areaAPP: 20_000,
      modoLotes: "automatico",
      areaMediaLoteAlvo: 250,
    });

    expect(comAPP.areaParcelavel).toBe(80_000);
    // área verde é % da PARCELÁVEL, não da bruta — deve ser menor com APP
    expect(comAPP.areaVerde).toBeLessThan(semAPP.areaVerde);
    expect(comAPP.areaVerde).toBeCloseTo(80_000 * 0.15, 5);
  });

  it("rejeita APP maior que a área bruta", () => {
    expect(() => calcularGeoEngine({ areaBruta: 10_000, areaAPP: 20_000, modoLotes: "automatico", areaMediaLoteAlvo: 250 })).toThrow();
  });

  it("modo Automático: nº de lotes = área vendável ÷ lote-alvo; área média é o input ecoado", () => {
    const result = calcularGeoEngine({
      areaBruta: 100_000,
      modoLotes: "automatico",
      areaMediaLoteAlvo: 300,
    });
    const numeroLotesEsperado = Math.floor(result.areaVendavel / 300);
    expect(result.numeroLotes).toBe(numeroLotesEsperado);
    expect(result.areaMediaLote).toBe(300);
  });

  it("modo Manual: nº de lotes é o input; área média vira RESULTADO calculado, não input", () => {
    const result = calcularGeoEngine({
      areaBruta: 100_000,
      modoLotes: "manual",
      numeroLotesManual: 150,
    });
    expect(result.numeroLotes).toBe(150);
    expect(result.areaMediaLote).toBeCloseTo(result.areaVendavel / 150, 5);
  });

  it("modo Automático sem areaMediaLoteAlvo lança erro", () => {
    expect(() => calcularGeoEngine({ areaBruta: 100_000, modoLotes: "automatico" })).toThrow();
  });

  it("modo Manual sem numeroLotesManual lança erro", () => {
    expect(() => calcularGeoEngine({ areaBruta: 100_000, modoLotes: "manual" })).toThrow();
  });

  it("calcula densidade (hab/ha) e aplica a regra de dispensa de rede coletora < 20 hab/ha", () => {
    // gleba grande, poucos lotes por hectare -> baixa densidade -> dispensa rede coletora
    const baixaDensidade = calcularGeoEngine({
      areaBruta: 1_000_000, // 100 ha
      modoLotes: "manual",
      numeroLotesManual: 300, // ~3 lotes/ha * 3.5 hab/lote ~ 10.5 hab/ha
    });
    expect(baixaDensidade.densidadeHabHa).toBeLessThan(20);
    expect(baixaDensidade.dispensaRedeColetora).toBe(true);
    expect(baixaDensidade.alertasConformidade.some((a) => a.includes("dispensa rede coletora"))).toBe(true);

    // gleba pequena e muito adensada -> densidade alta -> NÃO dispensa
    const altaDensidade = calcularGeoEngine({
      areaBruta: 50_000, // 5 ha
      modoLotes: "manual",
      numeroLotesManual: 400, // 80 lotes/ha * 3.5 hab/lote = 280 hab/ha
    });
    expect(altaDensidade.densidadeHabHa).toBeGreaterThan(20);
    expect(altaDensidade.dispensaRedeColetora).toBe(false);
  });

  it("usa os pisos de conformidade recebidos (legislação/config), não constantes fixas", () => {
    const result = calcularGeoEngine({
      areaBruta: 100_000,
      modoLotes: "automatico",
      areaMediaLoteAlvo: 250,
      percentualVerde: 10, // abaixo do piso federal de 15%
      pisoPercentualVerdeMin: 8, // mas piso local (fictício) é só 8%
    });
    expect(result.conformidadeLei6766).toBe(true);
    expect(result.alertasConformidade.some((a) => a.includes("Área verde insuficiente"))).toBe(false);
  });

  it("rejeita área vendável zero/negativa quando percentuais somam >= 100%", () => {
    expect(() =>
      calcularGeoEngine({
        areaBruta: 100_000,
        modoLotes: "automatico",
        areaMediaLoteAlvo: 250,
        percentualVerde: 40,
        percentualInstitucional: 30,
        percentualSistemaViario: 35,
      })
    ).toThrow();
  });
});

describe("GeoEngine — distribuição por tipologia", () => {
  it("não quebra com divisão por zero quando uma tipologia não cabe nenhum lote", () => {
    const result = calcularLotesPorTipologia(1000, [{ nome: "Comercial", percentual: 100, areaMedia: 5000 }]);
    expect(result[0].numeroLotes).toBe(0);
    expect(result[0].areaMediaResultante).toBe(0); // antes quebrava com NaN/Infinity (bug areMedia)
  });
});
