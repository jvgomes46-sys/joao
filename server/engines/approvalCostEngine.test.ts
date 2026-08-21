import { describe, expect, it } from "vitest";
import { calcularCustoAprovacoes, type ApprovalCostIndices, type ApprovalCostInput } from "./approvalCostEngine";

/**
 * Índices reais da Planilha Mestre de Viabilidade, aba "Tabelas" seção M
 * (linhas 94-102) e taxas fixas da aba "Aprovações" (D.1-D.3, B.3).
 */
const INDICES: ApprovalCostIndices = {
  topografiaM2: 0.3,
  projetosEngenhariaM2: 2.0,
  sondagemM2: 0.12,
  estudoAmbientalM2: 0.25,
  compensacaoFlorestalM2: 0.35,
  outorgaHidricaVb: 2500,
  taxasLicenciamentoM2: 0.8,
  registroParcelamentoM2: 0.18,
  assessoriaProtocolosM2: 0.1,
  analiseProjetoAguaVb: 5000,
  analiseProjetoEsgotoVb: 5000,
  hidrossanitarioFossaVb: 22000,
  hidrossanitarioEteVb: 145000,
  hidrossanitarioRedeVb: 95000,
  participacaoEletricaM2: 0.3,
};

/** Cenário exato da planilha: Premissas!B11=115502, B38=Poço, B39=17911, B91=Rede Pública. */
const CENARIO_PLANILHA: ApprovalCostInput = {
  areaGlebaM2: 115502,
  solucaoAgua: "poco",
  solucaoEsgoto: "rede_publica",
  areaSupressaoVegetalM2: 17911,
  // A planilha não modela essa escolha; "cliente_paga" reproduz o
  // comportamento dela (D.4 cobrada) para a comparação de paridade.
  participacaoEletrica: "cliente_paga",
};

function total(itens: ReturnType<typeof calcularCustoAprovacoes>["itens"], codigo: string) {
  const item = itens.find((i) => i.itemCodigo === codigo);
  if (!item) throw new Error(`Item ${codigo} não encontrado`);
  return item.total;
}

describe("approvalCostEngine — paridade com a Planilha Mestre (aba Aprovações)", () => {
  const out = calcularCustoAprovacoes(CENARIO_PLANILHA, INDICES);

  it("reproduz o total de cada grupo (E6, E11, E16, E21 da planilha)", () => {
    expect(out.totaisPorGrupo["levantamentos"]).toBeCloseTo(279514.84, 2); // E6
    expect(out.totaisPorGrupo["ambiental"]).toBeCloseTo(71801.2, 2); // E11
    expect(out.totaisPorGrupo["taxas_oficiais"]).toBeCloseTo(124742.16, 2); // E16
    expect(out.totaisPorGrupo["concessionarias"]).toBeCloseTo(139650.6, 2); // E21
  });

  it("reproduz o TOTAL DE APROVAÇÕES E PROJETOS (E27) e o custo por m² (E28)", () => {
    expect(out.custoAprovacoesTotal).toBeCloseTo(615708.8, 2); // E27
    expect(out.custoPorM2Gleba).toBeCloseTo(5.330719814375508, 6); // E28
  });

  it("reproduz cada item individual da planilha", () => {
    expect(total(out.itens, "aprovacao_topografia")).toBeCloseTo(34650.6, 2); // E7
    expect(total(out.itens, "aprovacao_projetos_engenharia")).toBeCloseTo(231004, 2); // E8
    expect(total(out.itens, "aprovacao_sondagem")).toBeCloseTo(13860.24, 2); // E9
    expect(total(out.itens, "aprovacao_estudo_ambiental")).toBeCloseTo(28875.5, 2); // E12
    expect(total(out.itens, "aprovacao_compensacao_florestal")).toBeCloseTo(40425.7, 2); // E13
    expect(total(out.itens, "aprovacao_outorga_hidrica")).toBeCloseTo(2500, 2); // E14
    expect(total(out.itens, "aprovacao_taxas_licenciamento")).toBeCloseTo(92401.6, 2); // E17
    expect(total(out.itens, "aprovacao_registro_parcelamento")).toBeCloseTo(20790.36, 2); // E18
    expect(total(out.itens, "aprovacao_assessoria_protocolos")).toBeCloseTo(11550.2, 2); // E19
    expect(total(out.itens, "aprovacao_analise_projeto_agua")).toBeCloseTo(5000, 2); // E22
    expect(total(out.itens, "aprovacao_analise_projeto_esgoto")).toBeCloseTo(5000, 2); // E23
    expect(total(out.itens, "aprovacao_projeto_hidrossanitario")).toBeCloseTo(95000, 2); // E24
    expect(total(out.itens, "aprovacao_participacao_eletrica")).toBeCloseTo(34650.6, 2); // E25
  });
});

describe("approvalCostEngine — lógica condicional (spec 2.5)", () => {
  it("sem supressão vegetal, a compensação florestal é zerada", () => {
    const out = calcularCustoAprovacoes({ ...CENARIO_PLANILHA, areaSupressaoVegetalM2: 0 }, INDICES);
    expect(total(out.itens, "aprovacao_compensacao_florestal")).toBe(0);
    expect(out.custoAprovacoesTotal).toBeCloseTo(615708.8 - 40425.7, 2);
  });

  it("água por rede pública dispensa a outorga de recursos hídricos", () => {
    const out = calcularCustoAprovacoes({ ...CENARIO_PLANILHA, solucaoAgua: "rede_publica" }, INDICES);
    expect(total(out.itens, "aprovacao_outorga_hidrica")).toBe(0);
  });

  it("fossa dispensa a análise de esgoto e reduz o escopo do hidrossanitário", () => {
    const out = calcularCustoAprovacoes({ ...CENARIO_PLANILHA, solucaoEsgoto: "fossa" }, INDICES);
    expect(total(out.itens, "aprovacao_analise_projeto_esgoto")).toBe(0);
    expect(total(out.itens, "aprovacao_projeto_hidrossanitario")).toBe(22000);
  });

  it("ETE própria amplia o escopo do projeto hidrossanitário", () => {
    const out = calcularCustoAprovacoes({ ...CENARIO_PLANILHA, solucaoEsgoto: "ete_propria" }, INDICES);
    expect(total(out.itens, "aprovacao_projeto_hidrossanitario")).toBe(145000);
    expect(total(out.itens, "aprovacao_analise_projeto_esgoto")).toBe(5000);
  });

  it("DESVIO DELIBERADO da planilha: concessionária cobre zera a participação elétrica", () => {
    // A planilha cobra D.4 sempre (não condiciona). A spec (2.3 / seção 6) e o
    // CostEngine tratam essa escolha como zerando um item inteiro — aplicamos
    // a regra de negócio, não a réplica literal da planilha.
    const out = calcularCustoAprovacoes({ ...CENARIO_PLANILHA, participacaoEletrica: "concessionaria_cobre" }, INDICES);
    expect(total(out.itens, "aprovacao_participacao_eletrica")).toBe(0);
    expect(out.custoAprovacoesTotal).toBeCloseTo(615708.8 - 34650.6, 2);
  });

  it("área zero não divide por zero no custo por m²", () => {
    const out = calcularCustoAprovacoes({ ...CENARIO_PLANILHA, areaGlebaM2: 0 }, INDICES);
    expect(out.custoPorM2Gleba).toBe(0);
  });

  it("todo item carrega o motivo da sua ativação/zeragem (auditabilidade)", () => {
    const out = calcularCustoAprovacoes(CENARIO_PLANILHA, INDICES);
    expect(out.itens.every((i) => i.motivo.length > 0)).toBe(true);
  });
});
