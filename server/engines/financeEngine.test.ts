import { describe, expect, it } from "vitest";
import { calcularFinanceEngine, FinanceEngineInput } from "./financeEngine";

const baseInput: FinanceEngineInput = {
  horizonteMeses: 120,
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

describe("FinanceEngine — indicadores e guardas", () => {
  it("distribui exatamente o total de lotes vendidos ao longo da curva de vendas", () => {
    const output = calcularFinanceEngine(baseInput);
    const total = output.fluxoMensal.reduce((s, r) => s + r.lotesVendidos, 0);
    expect(total).toBe(baseInput.numeroLotes);
  });

  it("payback = 1 quando o fluxo acumulado nunca fica negativo", () => {
    const output = calcularFinanceEngine({
      ...baseInput,
      capexAprovacoesTotal: 0,
      gruposCustoObra: {},
      curvaObra: "linear",
    });
    expect(output.paybackMes).toBe(1);
  });

  it("payback null quando o projeto não paga dentro do horizonte", () => {
    const output = calcularFinanceEngine({
      ...baseInput,
      horizonteMeses: 24, // horizonte curto demais para pagar um projeto de 12mi
      gruposCustoObra: { terraplenagem: 12_000_000 },
    });
    expect(output.paybackMes).toBeNull();
    expect(output.alertas.some((a) => a.includes("Fluxo acumulado negativo"))).toBe(true);
  });

  it("TIR indisponível quando o resultado nominal é negativo ou zero ('projeto não se paga')", () => {
    const output = calcularFinanceEngine({
      ...baseInput,
      horizonteMeses: 24,
      gruposCustoObra: { terraplenagem: 12_000_000 },
    });
    expect(output.tirMensal).toBeNull();
    expect(output.tirIndisponivelMotivo).toMatch(/não se paga/);
  });

  it("TIR indisponível quando a obra é autofinanciada pelas vendas (exposição < 20% do CAPEX)", () => {
    // CAPEX artificialmente inflado torna a exposição de caixa real sempre < 20% dele
    const output = calcularFinanceEngine({ ...baseInput, capexTotal: 1_000_000_000 });
    expect(output.tirMensal).toBeNull();
    expect(output.tirIndisponivelMotivo).toMatch(/autofinanciada/);
  });

  it("alerta: prazo de vendas maior que o horizonte", () => {
    const output = calcularFinanceEngine({ ...baseInput, horizonteMeses: 20, prazoVendasMeses: 30 });
    expect(output.alertas.some((a) => a.includes("excede o horizonte"))).toBe(true);
  });

  it("alerta: vendas iniciando antes do fim das aprovações+obra (cronograma inconsistente)", () => {
    const output = calcularFinanceEngine({ ...baseInput, inicioVendasMes: 1 }); // vendas no mês 1, obra só começa no mês 13
    expect(output.alertas.some((a) => a.includes("antes da obra"))).toBe(true);
  });

  it("sem alerta de cronograma quando vendas começam depois do início da obra", () => {
    const output = calcularFinanceEngine({ ...baseInput, inicioVendasMes: 15 });
    expect(output.alertas.some((a) => a.includes("antes da obra"))).toBe(false);
  });

  it("alerta: descolamento de índices (custo indexa mais que recebível) acima de 2pp a.a.", () => {
    const semDescolamento = calcularFinanceEngine({
      ...baseInput,
      custosIndexados: true,
      indiceCustosAnualFracao: 0.05,
      recebiveisIndexados: true,
      indiceRecebiveisAnualFracao: 0.04,
    });
    expect(semDescolamento.alertas.some((a) => a.includes("corrigem"))).toBe(false);

    const comDescolamento = calcularFinanceEngine({
      ...baseInput,
      custosIndexados: true,
      indiceCustosAnualFracao: 0.1,
      recebiveisIndexados: true,
      indiceRecebiveisAnualFracao: 0.04,
    });
    expect(comDescolamento.alertas.some((a) => a.includes("corrigem"))).toBe(true);
  });

  it("alerta: parcelas finais vencem além do horizonte de 120 meses", () => {
    const output = calcularFinanceEngine({
      ...baseInput,
      inicioVendasMes: 100,
      prazoVendasMeses: 20,
      numeroParcelas: 60, // 100+20+60 = 180 > 120
    });
    expect(output.alertas.some((a) => a.includes("além do horizonte"))).toBe(true);
  });

  it("reinvestimento de caixa positivo à TMA soma juros quando habilitado", () => {
    const cenarioLucrativo: FinanceEngineInput = {
      ...baseInput,
      numeroLotes: 200,
      precoBrutoPorLote: 500_000,
      gruposCustoObra: { terraplenagem: 2_000_000 },
      capexAprovacoesTotal: 200_000,
    };
    const semReinvest = calcularFinanceEngine({ ...cenarioLucrativo, reinvestirCaixaPositivo: false });
    const comReinvest = calcularFinanceEngine({ ...cenarioLucrativo, reinvestirCaixaPositivo: true });

    const jurosTotal = comReinvest.fluxoMensal.reduce((s, r) => s + r.jurosReinvestimento, 0);
    expect(jurosTotal).toBeGreaterThan(0);
    expect(comReinvest.resultadoNominal).toBeGreaterThan(semReinvest.resultadoNominal);
  });
});
