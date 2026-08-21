import { describe, expect, it } from "vitest";
import { calcularAguaEnergia } from "./aguaEnergiaEngine";

describe("aguaEnergiaEngine (spec seção 2.3)", () => {
  it("calcula população, consumo e reservação a partir dos parâmetros da concessionária", () => {
    const output = calcularAguaEnergia({
      numeroLotes: 100,
      taxaOcupacaoHabPorLote: 3.5,
      consumoPerCapitaLDia: 150,
      k1: 1.2,
      k2: 1.5,
      diasReservacao: 1,
      coeficienteRetornoEsgoto: 0.8,
      k3: 0.5,
      demandaReferenciaKvaPorLote: 5,
    });

    expect(output.populacaoEstimada).toBe(350);
    expect(output.consumoMedioDiarioM3).toBeCloseTo(52.5, 4); // 350 × 150 / 1000
    expect(output.consumoMaximoDiarioM3).toBeCloseTo(63, 4); // × k1
    expect(output.volumeReservacaoM3).toBeCloseTo(63, 4); // × 1 dia
  });

  it("propaga K1/K2 em cascata da vazão média para a vazão máxima horária", () => {
    const output = calcularAguaEnergia({
      numeroLotes: 100,
      taxaOcupacaoHabPorLote: 3.5,
      consumoPerCapitaLDia: 150,
      k1: 1.2,
      k2: 1.5,
      diasReservacao: 1,
      coeficienteRetornoEsgoto: 0.8,
      k3: 0.5,
      demandaReferenciaKvaPorLote: 5,
    });

    // vazaoMediaLs = 52.5 m³/dia × 1000 / 86400 s
    expect(output.vazaoMediaLs).toBeCloseTo(0.607639, 5);
    expect(output.vazaoMaximaDiariaLs).toBeCloseTo(output.vazaoMediaLs * 1.2, 6);
    expect(output.vazaoMaximaHorariaLs).toBeCloseTo(output.vazaoMaximaDiariaLs * 1.5, 6);
  });

  it("aplica o coeficiente de retorno (C) e K3 para as vazões de esgoto", () => {
    const output = calcularAguaEnergia({
      numeroLotes: 100,
      taxaOcupacaoHabPorLote: 3.5,
      consumoPerCapitaLDia: 150,
      k1: 1.2,
      k2: 1.5,
      diasReservacao: 1,
      coeficienteRetornoEsgoto: 0.8,
      k3: 0.5,
      demandaReferenciaKvaPorLote: 5,
    });

    expect(output.vazaoMediaEsgotoLs).toBeCloseTo(output.vazaoMediaLs * 0.8, 6);
    expect(output.vazaoMaximaEsgotoLs).toBeCloseTo(output.vazaoMaximaDiariaLs * 0.8, 6);
    expect(output.vazaoMinimaEsgotoLs).toBeCloseTo(output.vazaoMediaEsgotoLs * 0.5, 6);
  });

  it("calcula demanda total de energia e custo de extensão de rede", () => {
    const output = calcularAguaEnergia({
      numeroLotes: 200,
      taxaOcupacaoHabPorLote: 3.5,
      consumoPerCapitaLDia: 150,
      k1: 1.2,
      k2: 1.5,
      diasReservacao: 1,
      coeficienteRetornoEsgoto: 0.8,
      k3: 0.5,
      demandaReferenciaKvaPorLote: 4,
      distanciaConexaoEnergiaM: 800,
      custoExtensaoRedeRsPorM: 150,
    });

    expect(output.demandaTotalKva).toBe(800); // 200 × 4
    expect(output.custoExtensaoRedeEnergiaTotal).toBe(120_000); // 800m × R$150/m
  });

  it("custo de extensão de rede é zero quando distância/custo não são informados", () => {
    const output = calcularAguaEnergia({
      numeroLotes: 100,
      taxaOcupacaoHabPorLote: 3.5,
      consumoPerCapitaLDia: 150,
      k1: 1.2,
      k2: 1.5,
      diasReservacao: 1,
      coeficienteRetornoEsgoto: 0.8,
      k3: 0.5,
      demandaReferenciaKvaPorLote: 5,
    });
    expect(output.custoExtensaoRedeEnergiaTotal).toBe(0);
  });
});
