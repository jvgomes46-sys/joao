import { describe, expect, it } from "vitest";
import { calcularCostEngine, calcularDimensionamentoAgua, CostEngineInput, MULTIPLICADOR_TERRAPLENAGEM, UnitCostTable } from "./costEngine";

// Tabela de custos unitários "de mentira" mas não-zero para todo item usado
// nos testes — cada item vale R$1 por unidade, assim total == quantidade,
// o que deixa as asserções de "ativo/zerado" e "quantidade" bem diretas.
const custos: UnitCostTable = new Proxy({} as UnitCostTable, { get: () => 1 });

const baseInput: CostEngineInput = {
  areaBruta: 100_000,
  numeroLotes: 200,
  sistemaViarioM2: 20_000,
  areaCalcadasM2: 5_000,
  areaVerdeM2: 10_000,
  perimetroGlebaM: 1_500,
  densidadeHabHa: 30, // > 20 hab/ha por padrão nos testes que não mexem nisso
  dispensaRedeColetora: false,
  topografia: "plana",
  padraoPavimentacao: "asfalto",
  solucaoEsgoto: "rede_publica",
  necessitaElevatoria: false,
  solucaoAgua: "rede_publica",
  tipologia: "loteamento_aberto",
  participacaoEletrica: "concessionaria_cobre",
};

const paramsBase = { bdiPercentual: 25 };

function findItem(itens: ReturnType<typeof calcularCostEngine>["itens"], codigo: string) {
  const found = itens.find((i) => i.itemCodigo === codigo);
  if (!found) throw new Error(`item ${codigo} não encontrado`);
  return found;
}

describe("CostEngine — lógica condicional (spec seção 6)", () => {
  it("regra 1: baixa densidade dispensa rede coletora — galeria vira valeta, calçadas zeram, bocas de lobo reduzem à metade", () => {
    const result = calcularCostEngine({ ...baseInput, dispensaRedeColetora: true }, custos, paramsBase);

    expect(findItem(result.itens, "drenagem_galeria").ativo).toBe(false);
    expect(findItem(result.itens, "drenagem_valeta").ativo).toBe(true);
    expect(findItem(result.itens, "calcadas").ativo).toBe(false);

    const extensaoViariaM = baseInput.sistemaViarioM2 / 12;
    const bocasNormal = Math.ceil(extensaoViariaM / 50);
    expect(findItem(result.itens, "bocas_de_lobo").quantidade).toBeCloseTo(bocasNormal * 0.5, 5);
  });

  it("regra 1: baixa densidade força fossa mesmo com Rede Pública selecionada", () => {
    const result = calcularCostEngine(
      { ...baseInput, dispensaRedeColetora: true, solucaoEsgoto: "rede_publica" },
      custos,
      paramsBase
    );

    expect(findItem(result.itens, "fossa_sumidouro").ativo).toBe(true);
    expect(findItem(result.itens, "rede_coletora_esgoto").ativo).toBe(false);
    expect(findItem(result.itens, "emissario").ativo).toBe(false);
  });

  it("regra 2: água por poço zera rede de distribuição e interligação; ativa poço tubular e casa de bombas", () => {
    const result = calcularCostEngine({ ...baseInput, solucaoAgua: "poco" }, custos, paramsBase);

    expect(findItem(result.itens, "rede_distribuicao_agua").ativo).toBe(false);
    expect(findItem(result.itens, "interligacao_rede_agua").ativo).toBe(false);
    expect(findItem(result.itens, "poco_tubular").ativo).toBe(true);
    expect(findItem(result.itens, "casa_de_bombas").ativo).toBe(true);
  });

  it("regra 3: água por poço + chácara também zera a ligação domiciliar", () => {
    const semChacara = calcularCostEngine({ ...baseInput, solucaoAgua: "poco", isChacara: false }, custos, paramsBase);
    expect(findItem(semChacara.itens, "ligacao_domiciliar_agua").ativo).toBe(true);

    const comChacara = calcularCostEngine({ ...baseInput, solucaoAgua: "poco", isChacara: true }, custos, paramsBase);
    expect(findItem(comChacara.itens, "ligacao_domiciliar_agua").ativo).toBe(false);
  });

  it("regra 4: esgoto por fossa zera rede coletora, PVs e ligações; ativa fossa+sumidouro", () => {
    const result = calcularCostEngine({ ...baseInput, solucaoEsgoto: "fossa" }, custos, paramsBase);

    expect(findItem(result.itens, "rede_coletora_esgoto").ativo).toBe(false);
    expect(findItem(result.itens, "pvs_esgoto").ativo).toBe(false);
    expect(findItem(result.itens, "ligacoes_esgoto").ativo).toBe(false);
    expect(findItem(result.itens, "fossa_sumidouro").ativo).toBe(true);
  });

  it("regra 5: elevatória só ativa com Rede Pública E elevatória=Sim — condicional aninhada", () => {
    const semNadaAtivo = calcularCostEngine({ ...baseInput, solucaoEsgoto: "rede_publica", necessitaElevatoria: false }, custos, paramsBase);
    expect(findItem(semNadaAtivo.itens, "elevatoria_esgoto").ativo).toBe(false);

    const soElevatoriaSemRedePublica = calcularCostEngine({ ...baseInput, solucaoEsgoto: "fossa", necessitaElevatoria: true }, custos, paramsBase);
    expect(findItem(soElevatoriaSemRedePublica.itens, "elevatoria_esgoto").ativo).toBe(false);

    const ambosCriterios = calcularCostEngine({ ...baseInput, solucaoEsgoto: "rede_publica", necessitaElevatoria: true }, custos, paramsBase);
    expect(findItem(ambosCriterios.itens, "elevatoria_esgoto").ativo).toBe(true);
  });

  it("regra 6: ETE própria ativa ETE compacta e zera itens de rede pública", () => {
    const result = calcularCostEngine({ ...baseInput, solucaoEsgoto: "ete_propria" }, custos, paramsBase);

    expect(findItem(result.itens, "ete_compacta").ativo).toBe(true);
    expect(findItem(result.itens, "rede_coletora_esgoto").ativo).toBe(false);
    expect(findItem(result.itens, "fossa_sumidouro").ativo).toBe(false);
  });

  it("regra 7: tipologia ≠ Condomínio Fechado zera muro, portaria e clube", () => {
    const aberto = calcularCostEngine({ ...baseInput, tipologia: "loteamento_aberto" }, custos, paramsBase);
    expect(findItem(aberto.itens, "muro_condominio").ativo).toBe(false);
    expect(findItem(aberto.itens, "portaria").ativo).toBe(false);
    expect(findItem(aberto.itens, "area_lazer").ativo).toBe(false);

    const fechado = calcularCostEngine({ ...baseInput, tipologia: "condominio_fechado" }, custos, paramsBase);
    expect(findItem(fechado.itens, "muro_condominio").ativo).toBe(true);
    expect(findItem(fechado.itens, "portaria").ativo).toBe(true);
    expect(findItem(fechado.itens, "area_lazer").ativo).toBe(true);

    const chacaras = calcularCostEngine({ ...baseInput, tipologia: "condominio_chacaras" }, custos, paramsBase);
    expect(findItem(chacaras.itens, "muro_condominio").ativo).toBe(false);
  });

  it("regra 8: supressão vegetal > 0 ativa custo de supressão no orçamento", () => {
    const semSupressao = calcularCostEngine({ ...baseInput, areaSupressaoVegetalM2: 0 }, custos, paramsBase);
    expect(findItem(semSupressao.itens, "supressao_vegetal").ativo).toBe(false);

    const comSupressao = calcularCostEngine({ ...baseInput, areaSupressaoVegetalM2: 2_000 }, custos, paramsBase);
    expect(findItem(comSupressao.itens, "supressao_vegetal").ativo).toBe(true);
    expect(findItem(comSupressao.itens, "supressao_vegetal").quantidade).toBe(2_000);
  });

  it("regra 9: árvores isoladas > 0 ativa corte + compensação (distinta da supressão em área)", () => {
    const semArvores = calcularCostEngine({ ...baseInput, arvoresIsoladasUn: 0 }, custos, paramsBase);
    expect(findItem(semArvores.itens, "corte_arvores_isoladas").ativo).toBe(false);
    expect(findItem(semArvores.itens, "compensacao_arvores_isoladas").ativo).toBe(false);

    const comArvores = calcularCostEngine({ ...baseInput, arvoresIsoladasUn: 12 }, custos, paramsBase);
    expect(findItem(comArvores.itens, "corte_arvores_isoladas").ativo).toBe(true);
    expect(findItem(comArvores.itens, "corte_arvores_isoladas").quantidade).toBe(12);
    expect(findItem(comArvores.itens, "compensacao_arvores_isoladas").quantidade).toBe(12);
  });

  it("regra 10: participação financeira 'Cliente paga' ativa o custo; 'Concessionária cobre' zera", () => {
    const clientePaga = calcularCostEngine({ ...baseInput, participacaoEletrica: "cliente_paga" }, custos, paramsBase);
    expect(findItem(clientePaga.itens, "obra_conexao_externa_energia").ativo).toBe(true);

    const concessionaria = calcularCostEngine({ ...baseInput, participacaoEletrica: "concessionaria_cobre" }, custos, paramsBase);
    expect(findItem(concessionaria.itens, "obra_conexao_externa_energia").ativo).toBe(false);
  });

  it("regra 11: topografia define o multiplicador de corte/aterro (Plana 0,08 / Ondulada 0,15 / Acidentada 0,28)", () => {
    for (const [topografia, multiplicador] of Object.entries(MULTIPLICADOR_TERRAPLENAGEM)) {
      const result = calcularCostEngine({ ...baseInput, topografia: topografia as CostEngineInput["topografia"] }, custos, paramsBase);
      expect(findItem(result.itens, "corte_aterro").quantidade).toBeCloseTo(baseInput.areaBruta * multiplicador, 5);
    }
  });

  it("padrão de pavimentação escolhe o item de capa correto (asfalto vs. paver)", () => {
    const asfalto = calcularCostEngine({ ...baseInput, padraoPavimentacao: "asfalto" }, custos, paramsBase);
    expect(findItem(asfalto.itens, "pavimentacao_capa_asfalto").ativo).toBe(true);

    const paver = calcularCostEngine({ ...baseInput, padraoPavimentacao: "paver" }, custos, paramsBase);
    expect(findItem(paver.itens, "pavimentacao_capa_paver").ativo).toBe(true);
  });
});

describe("CostEngine — totalizadores", () => {
  it("aplica BDI sobre o subtotal de infraestrutura e soma contingência/aprovações/custo financeiro no CAPEX", () => {
    const result = calcularCostEngine(baseInput, custos, {
      bdiPercentual: 25,
      contingenciaPercentual: 5,
      custoAprovacoesTotal: 100_000,
      custoFinanceiroPercentual: 2,
      vgvTotal: 20_000_000,
    });

    expect(result.bdiValor).toBeCloseTo(result.subtotalInfraestrutura * 0.25, 5);
    expect(result.subtotalComBDI).toBeCloseTo(result.subtotalInfraestrutura * 1.25, 5);
    expect(result.contingenciaValor).toBeCloseTo(result.subtotalComBDI * 0.05, 5);
    expect(result.custoFinanceiroValor).toBeCloseTo(result.subtotalComBDI * 0.02, 5);
    expect(result.capexTotal).toBeCloseTo(
      result.subtotalComBDI + result.contingenciaValor + 100_000 + result.custoFinanceiroValor,
      5
    );
    expect(result.custoPorLote).toBeCloseTo(result.capexTotal / baseInput.numeroLotes, 5);
    expect(result.capexSobreVGV).toBeCloseTo(result.capexTotal / 20_000_000, 5);
  });

  it("capexSobreVGV é null quando VGV não é informado", () => {
    const result = calcularCostEngine(baseInput, custos, paramsBase);
    expect(result.capexSobreVGV).toBeNull();
  });
});

describe("Dimensionamento de água (módulo 2.3, simplificado)", () => {
  it("calcula população, consumo e volume de reservação a partir dos parâmetros técnicos", () => {
    const dim = calcularDimensionamentoAgua({
      numeroLotes: 200,
      taxaOcupacaoHabPorLote: 3.5,
      consumoPerCapitaLDia: 150,
      k1: 1.2,
      diasReservacao: 1,
    });

    expect(dim.populacaoEstimada).toBe(700);
    expect(dim.consumoMedioDiarioM3).toBeCloseTo(105, 5); // 700 * 150 / 1000
    expect(dim.consumoMaximoDiarioM3).toBeCloseTo(126, 5); // 105 * 1.2
    expect(dim.volumeReservacaoM3).toBeCloseTo(126, 5); // * 1 dia
  });

  it("o reservatório do CostEngine usa o volume dimensionado, não um valor fixo", () => {
    const poucos = calcularCostEngine({ ...baseInput, numeroLotes: 50 }, custos, paramsBase);
    const muitos = calcularCostEngine({ ...baseInput, numeroLotes: 500 }, custos, paramsBase);

    expect(findItem(muitos.itens, "reservatorio").quantidade).toBeGreaterThan(findItem(poucos.itens, "reservatorio").quantidade);
  });
});
