import { describe, expect, it } from "vitest";
import { calcularFinanceEngine } from "./financeEngine";

/**
 * Valida o FinanceEngine contra os valores REAIS calculados pela Planilha
 * Mestre de Viabilidade (aba "Fluxo de Caixa" + "Dashboard"), usando o
 * cenário-exemplo que já vem preenchido nela (Premissas!B5 em diante).
 *
 * Isto não é um teste com números inventados — os valores esperados abaixo
 * foram lidos diretamente das células já calculadas do arquivo .xlsx
 * (LibreOffice/Excel, não recalculados por nós), então qualquer divergência
 * grande aqui indica um erro real na tradução da lógica da planilha.
 */
describe("FinanceEngine — validado contra a Planilha Mestre de Viabilidade real", () => {
  const output = calcularFinanceEngine({
    horizonteMeses: 120,
    inicioAprovacoesMes: 1,
    duracaoAprovacoesMeses: 18, // Premissas!B71
    duracaoObraMeses: 18, // Premissas!B72
    inicioVendasMes: 6, // Premissas!B73

    numeroLotes: 130, // Premissas!B95 — lotes comercializados pelo incorporador
    precoBrutoPorLote: 360.16752688172045 * 450, // Premissas!B32 * B42
    prazoVendasMeses: 44, // Premissas!B61
    curvaVendas: "curva_s", // Premissas!B99 = "Curva S (lançamento lento)"

    percentualDeducoesVenda: 0.24, // Premissas!B67
    percentualEntrada: 0.2, // Premissas!B101
    numeroParcelas: 120, // Premissas!B102

    tmaAnualFracao: 0.14, // Premissas!B69
    reinvestirCaixaPositivo: false, // Premissas!B106 = "Não"

    custosIndexados: true, // Premissas!B78 = "Sim"
    indiceCustosAnualFracao: 0.065, // Premissas!B80 (INCC)
    recebiveisIndexados: true, // Premissas!B82 = "Sim"
    indiceRecebiveisAnualFracao: 0.045, // Premissas!B84 (IPCA), B85 juros=0

    capexAprovacoesTotal: 615708.7999999999, // Aprovações!$E$27 via Orçamento!$F$60
    curvaObra: "curva_s", // Premissas!B105 = "Curva S (padrão de obra civil)"
    gruposCustoObra: {
      // Orçamento!F6, F11, F17, F24, F32, F41, F48, F53 — grupos já COM BDI aplicado por item
      terraplenagem: 1171172.3499999999,
      drenagem: 740423.1499999999,
      agua: 952281.9400000001,
      energia: 1125888.065,
      pavimentacao: 3008957.625,
      servicos_complementares: 301102.4,
      esgoto: 2683967.4,
      obras_civis_condominio: 0,
    },
    capexTotal: 11697718.9523, // Orçamento!$F$63
  });

  it("totais do fluxo batem com a planilha (receita bruta, deduções, receita líquida, aprovações, obra, resultado nominal)", () => {
    expect(output.receitaBrutaTotal).toBeCloseTo(21697426.83, -2);
    expect(output.deducoesTotal).toBeCloseTo(-5207382.44, -2);
    expect(output.receitaLiquidaTotal).toBeCloseTo(16490044.39, -2);
    expect(output.aprovacoesTotal).toBeCloseTo(-644034.24, -1);
    expect(output.obraTotal).toBeCloseTo(-11379513.48, -1);
    expect(output.resultadoNominal).toBeCloseTo(4466496.67, -1);
  });

  it("indicadores batem com o Dashboard real (margem, ROI, exposição, VPL, TIR, payback)", () => {
    expect(output.margemSobreReceitaRealizada).toBeCloseTo(0.2058537496216442, 3);
    expect(output.roiSobreCapex).toBeCloseTo(0.3818262934791903, 3);
    expect(output.exposicaoMaximaCaixa).toBeCloseTo(8372867.39, -2);
    expect(output.vpl).toBeCloseTo(-518743.28, -2);
    expect(output.tirMensal).not.toBeNull();
    expect(output.tirMensal!).toBeCloseTo(0.008995546601864302, 3);
    expect(output.tirAnual!).toBeCloseTo(0.11345070034972382, 2);
    expect(output.paybackMes).toBe(92);
  });

  it("total de lotes vendidos ao longo do horizonte bate com o total comercializado", () => {
    const totalVendido = output.fluxoMensal.reduce((s, r) => s + r.lotesVendidos, 0);
    expect(totalVendido).toBe(130);
  });
});
