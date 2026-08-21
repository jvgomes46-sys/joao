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
 *
 * EXCEÇÃO DELIBERADA: os valores de obra/resultado nominal/indicadores
 * derivados NÃO batem 1:1 com a planilha original — ela tem um bug (um
 * portão externo que zera o último mês de disciplinas cuja janela termina
 * exatamente no fim do prazo de obra, "perdendo" ~R$91 mil de orçamento no
 * fluxo de caixa) que decidimos corrigir em vez de replicar. Ver o segundo
 * `it` abaixo.
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

    // Fixa as janelas ORIGINAIS da Planilha Mestre de Viabilidade
    // explicitamente — o default de JANELAS_OBRA_PADRAO foi recalibrado com
    // dados de outro projeto real (Residencial Mirante) e não deve
    // silenciosamente mudar o resultado deste teste de paridade.
    janelasObraPorDisciplina: {
      terraplenagem: { inicio: 0, fim: 0.25 },
      drenagem: { inicio: 0.1, fim: 0.4 },
      agua: { inicio: 0.25, fim: 0.55 },
      energia: { inicio: 0.35, fim: 0.7 },
      pavimentacao: { inicio: 0.5, fim: 0.85 },
      servicos_complementares: { inicio: 0.85, fim: 1 },
      esgoto: { inicio: 0.2, fim: 0.55 },
      obras_civis_condominio: { inicio: 0.3, fim: 0.95 },
    },
  });

  it("totais do fluxo batem com a planilha (receita bruta, deduções, receita líquida, aprovações)", () => {
    // Estes quatro NÃO dependem da curva física de obra por disciplina —
    // batem exatamente com a planilha original.
    expect(output.receitaBrutaTotal).toBeCloseTo(21697426.83, -2);
    expect(output.deducoesTotal).toBeCloseTo(-5207382.44, -2);
    expect(output.receitaLiquidaTotal).toBeCloseTo(16490044.39, -2);
    expect(output.aprovacoesTotal).toBeCloseTo(-644034.24, -1);
  });

  it("obra e resultado nominal DIVERGEM da planilha de propósito — bug corrigido, não replicado", () => {
    // A planilha original zera o último mês de qualquer disciplina cuja
    // janela termine exatamente no fim do prazo de obra (ex.: Sinalização,
    // que vai até 100%) por causa de um portão externo estrito
    // (A<$B$7+$B$8). Isso faz ~R$91 mil do orçamento de obra nunca serem
    // desembolsados no fluxo de caixa da planilha original — dinheiro
    // "sumido". Aqui cada disciplina é paga integralmente dentro da sua
    // própria janela, sem esse corte. Os valores abaixo são os CORRETOS
    // (maiores que os -11.379.513,48 / 4.466.496,67 da planilha original).
    expect(output.obraTotal).toBeCloseTo(-11470442.61, -1);
    expect(output.resultadoNominal).toBeCloseTo(4375567.54, -1);
  });

  it("indicadores derivados refletem a obra corrigida — próximos, mas não idênticos, ao Dashboard original", () => {
    expect(output.margemSobreReceitaRealizada).toBeCloseTo(0.2017, 3);
    expect(output.roiSobreCapex).toBeCloseTo(0.3741, 3);
    expect(output.exposicaoMaximaCaixa).toBeCloseTo(8372867.39, -2); // não afetado pela correção
    expect(output.vpl).toBeCloseTo(-579451.35, -2);
    expect(output.tirMensal).not.toBeNull();
    expect(output.tirMensal!).toBeCloseTo(0.008773, 3);
    expect(output.tirAnual!).toBeCloseTo(0.110509, 2);
    expect(output.paybackMes).toBe(93); // 1 mês a mais que a planilha original (92) — obra corrigida custa mais
  });

  it("total de lotes vendidos ao longo do horizonte bate com o total comercializado", () => {
    const totalVendido = output.fluxoMensal.reduce((s, r) => s + r.lotesVendidos, 0);
    expect(totalVendido).toBe(130);
  });
});
