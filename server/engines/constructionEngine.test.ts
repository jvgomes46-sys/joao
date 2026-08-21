import { describe, expect, it } from "vitest";
import { calcularEtapa, calcularProgressoConsolidado, STAGE_TEMPLATES, type StageInput } from "./constructionEngine";

describe("constructionEngine", () => {
  it("calcula os campos derivados de uma etapa", () => {
    const etapa: StageInput = {
      id: 1,
      nome: "Fundação",
      pesoPercentual: 10,
      valorPrevisto: 100_000,
      percentualPrevisto: 100,
      percentualExecutado: 40,
      status: "em_execucao",
    };
    const computed = calcularEtapa(etapa);
    expect(computed.valorExecutado).toBeCloseTo(40_000, 2);
    expect(computed.saldoAExecutar).toBeCloseTo(60_000, 2);
    expect(computed.percentualAcumulado).toBeCloseTo(4, 4); // 10% × 40%
  });

  it("etapa 0% executado não gera valor executado", () => {
    const computed = calcularEtapa({
      id: 2,
      nome: "Estrutura",
      pesoPercentual: 20,
      valorPrevisto: 50_000,
      percentualPrevisto: 100,
      percentualExecutado: 0,
      status: "nao_iniciado",
    });
    expect(computed.valorExecutado).toBe(0);
    expect(computed.saldoAExecutar).toBe(50_000);
  });

  it("progresso consolidado é ponderado pelo valor previsto, não pelo peso%", () => {
    const stages: StageInput[] = [
      { id: 1, nome: "A", pesoPercentual: 50, valorPrevisto: 10_000, percentualPrevisto: 100, percentualExecutado: 100, status: "concluido" },
      { id: 2, nome: "B", pesoPercentual: 50, valorPrevisto: 90_000, percentualPrevisto: 100, percentualExecutado: 0, status: "nao_iniciado" },
    ];
    const progresso = calcularProgressoConsolidado(stages);
    // mesmo com pesos 50/50, o valor previsto pesa 10k vs 90k — progresso real é 10%, não 50%
    expect(progresso.valorPrevistoTotal).toBe(100_000);
    expect(progresso.valorExecutadoTotal).toBe(10_000);
    expect(progresso.progressoPercentual).toBeCloseTo(10, 4);
  });

  it("progresso consolidado com valorPrevistoTotal zero não divide por zero", () => {
    const progresso = calcularProgressoConsolidado([]);
    expect(progresso.progressoPercentual).toBe(0);
  });

  it("templates padrão cobrem edificação (13 etapas) e complexo esportivo", () => {
    expect(STAGE_TEMPLATES.edificacao).toHaveLength(13);
    expect(STAGE_TEMPLATES.edificacao[0]).toBe("Serviços Preliminares");
    expect(STAGE_TEMPLATES.edificacao[12]).toBe("Testes e Entrega");
    expect(STAGE_TEMPLATES.complexo_esportivo).toEqual(["Terraplanagem", "Drenagem", "Irrigação", "Base", "Plantio"]);
  });
});
