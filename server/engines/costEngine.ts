/**
 * CostEngine - Motor de Engenharia de Custos
 * Orçamento parametrizado em 8 grupos, com lógica condicional 1:1 com a
 * planilha mestre (Especificação EVTE PRO, seção 2.4 e seção 6).
 *
 * Nenhum custo unitário é hardcoded aqui — todos vêm do Módulo de
 * Configuração (config_unit_costs / config_cost_parameters), resolvidos
 * pela camada de serviço e passados como `UnitCostTable`.
 */

export type Topografia = "plana" | "ondulada" | "acidentada";
export type PadraoPavimentacao = "asfalto" | "paver";
export type SolucaoEsgoto = "fossa" | "rede_publica" | "ete_propria";
export type SolucaoAgua = "poco" | "rede_publica";
export type ParticipacaoEletrica = "cliente_paga" | "concessionaria_cobre";
export type TipologiaCost = "loteamento_popular" | "loteamento_aberto" | "condominio_fechado" | "condominio_chacaras";

/** Multiplicador de volume de corte/aterro por topografia (m³/m²) — regra 11, seção 6. */
export const MULTIPLICADOR_TERRAPLENAGEM: Record<Topografia, number> = {
  plana: 0.08,
  ondulada: 0.15,
  acidentada: 0.28,
};

export interface CostEngineInput {
  // Saídas do GeoEngine (não recalculadas aqui — o CostEngine consome o resultado)
  areaBruta: number; // m²
  numeroLotes: number;
  sistemaViarioM2: number;
  areaCalcadasM2: number;
  areaVerdeM2: number;
  perimetroGlebaM: number;
  densidadeHabHa: number;
  dispensaRedeColetora: boolean; // regra 1, seção 6 — já calculada pelo GeoEngine

  // Premissas técnicas (módulo 2.1)
  topografia: Topografia;
  padraoPavimentacao: PadraoPavimentacao;
  solucaoEsgoto: SolucaoEsgoto;
  necessitaElevatoria?: boolean; // só relevante se solucaoEsgoto = rede_publica
  solucaoAgua: SolucaoAgua;
  isChacara?: boolean; // condomínio de chácaras + poço → também zera ligação domiciliar
  areaSupressaoVegetalM2?: number;
  arvoresIsoladasUn?: number;
  tipologia: TipologiaCost;
  participacaoEletrica: ParticipacaoEletrica;

  // Parâmetros técnicos de rede (módulo 2.1)
  larguraMediaViaM?: number; // padrão: 12m

  // Dimensionamento de água (módulo 2.3, simplificado)
  taxaOcupacaoHabPorLote?: number; // padrão: 3.5 hab/lote (mesmo do GeoEngine)
  consumoPerCapitaLDia?: number; // padrão: 150 L/hab.dia
  k1?: number; // coeficiente dia de maior consumo, padrão: 1.2
  diasReservacao?: number; // padrão: 1 dia
}

export interface UnitCostTable {
  [itemCodigo: string]: number; // valorUnitario já resolvido (região/data) pelo Módulo de Configuração
}

export interface CostEngineParams {
  bdiPercentual: number; // vem de config_cost_parameters (chave: bdi_infraestrutura)
  contingenciaPercentual?: number; // input do projeto — padrão 0
  custoFinanceiroPercentual?: number; // input do projeto — padrão 0
  custoAprovacoesTotal?: number; // viria do módulo 2.5 (não implementado ainda) — padrão 0
  vgvTotal?: number; // para o indicador CAPEX/VGV — opcional
}

export interface CostItem {
  itemCodigo: string;
  grupo: string;
  descricao: string;
  quantidade: number;
  unidade: string;
  custoUnitario: number;
  total: number;
  ativo: boolean;
  motivo: string; // por que está ativo/zerado — auditabilidade da lógica condicional
}

export interface CostEngineOutput {
  itens: CostItem[];
  totaisPorGrupo: Record<string, number>;
  subtotalInfraestrutura: number;
  bdiValor: number;
  subtotalComBDI: number;
  contingenciaValor: number;
  aprovacoesValor: number;
  custoFinanceiroValor: number;
  capexTotal: number;
  custoPorLote: number;
  custoPorM2Gleba: number;
  capexSobreVGV: number | null;
  // Dimensionamento de água (módulo 2.3) — exposto para auditoria/exibição
  populacaoEstimada: number;
  volumeReservacaoM3: number;
}

function extensaoViariaEixoM(sistemaViarioM2: number, larguraMediaViaM: number): number {
  return sistemaViarioM2 / larguraMediaViaM;
}

function item(
  itemCodigo: string,
  grupo: string,
  descricao: string,
  quantidade: number,
  unidade: string,
  custos: UnitCostTable,
  ativo: boolean,
  motivo: string
): CostItem {
  const custoUnitario = custos[itemCodigo] ?? 0;
  const quantidadeEfetiva = ativo ? Math.max(quantidade, 0) : 0;
  return {
    itemCodigo,
    grupo,
    descricao,
    quantidade: quantidadeEfetiva,
    unidade,
    custoUnitario,
    total: quantidadeEfetiva * custoUnitario,
    ativo,
    motivo,
  };
}

/**
 * Dimensionamento simplificado de água (módulo 2.3): população, consumo
 * médio diário e volume de reservação necessário. Alimenta o item
 * "reservatório" do grupo Água, que deixa de ser valor fixo.
 */
export function calcularDimensionamentoAgua(input: {
  numeroLotes: number;
  taxaOcupacaoHabPorLote: number;
  consumoPerCapitaLDia: number;
  k1: number;
  diasReservacao: number;
}) {
  const populacaoEstimada = input.numeroLotes * input.taxaOcupacaoHabPorLote;
  const consumoMedioDiarioM3 = (populacaoEstimada * input.consumoPerCapitaLDia) / 1000;
  const consumoMaximoDiarioM3 = consumoMedioDiarioM3 * input.k1;
  const volumeReservacaoM3 = consumoMaximoDiarioM3 * input.diasReservacao;
  return { populacaoEstimada, consumoMedioDiarioM3, consumoMaximoDiarioM3, volumeReservacaoM3 };
}

export function calcularCostEngine(input: CostEngineInput, custos: UnitCostTable, params: CostEngineParams): CostEngineOutput {
  const larguraMediaViaM = input.larguraMediaViaM ?? 12;
  const extensaoViariaM = extensaoViariaEixoM(input.sistemaViarioM2, larguraMediaViaM);

  const areaSupressaoVegetalM2 = input.areaSupressaoVegetalM2 ?? 0;
  const arvoresIsoladasUn = input.arvoresIsoladasUn ?? 0;

  // ---- Regra 1 (seção 6): baixa densidade dispensa rede coletora, e força
  // fossa mesmo se "Rede Pública" foi selecionado como solução de esgoto ----
  const esgotoEfetivo: SolucaoEsgoto = input.dispensaRedeColetora ? "fossa" : input.solucaoEsgoto;

  const itens: CostItem[] = [];

  // =========================================================================
  // GRUPO 1 — Terraplenagem
  // =========================================================================
  const multiplicadorTerraplenagem = MULTIPLICADOR_TERRAPLENAGEM[input.topografia];
  itens.push(
    item("limpeza_destocamento", "terraplenagem", "Limpeza e destocamento", input.areaBruta, "m²", custos, true, "Sempre ativo"),
    item("regularizacao", "terraplenagem", "Regularização do terreno", input.areaBruta, "m²", custos, true, "Sempre ativo"),
    item(
      "corte_aterro",
      "terraplenagem",
      `Corte/aterro (multiplicador ${multiplicadorTerraplenagem} — topografia ${input.topografia})`,
      input.areaBruta * multiplicadorTerraplenagem,
      "m³",
      custos,
      true,
      `Multiplicador definido pela topografia: ${input.topografia}`
    ),
    item(
      "supressao_vegetal",
      "terraplenagem",
      "Supressão vegetal",
      areaSupressaoVegetalM2,
      "m²",
      custos,
      areaSupressaoVegetalM2 > 0,
      areaSupressaoVegetalM2 > 0 ? "Área de supressão vegetal informada > 0" : "Sem área de supressão vegetal"
    )
  );

  // =========================================================================
  // GRUPO 2 — Drenagem Pluvial
  // =========================================================================
  const baixaDensidade = input.dispensaRedeColetora;
  itens.push(
    item(
      "drenagem_galeria",
      "drenagem",
      "Galeria de águas pluviais",
      extensaoViariaM,
      "m",
      custos,
      !baixaDensidade,
      baixaDensidade ? "Baixa densidade (<20 hab/ha) — substituída por valeta" : "Densidade suficiente para rede fechada"
    ),
    item(
      "drenagem_valeta",
      "drenagem",
      "Valeta de drenagem",
      extensaoViariaM,
      "m",
      custos,
      baixaDensidade,
      baixaDensidade ? "Baixa densidade (<20 hab/ha) — dispensa rede coletora/galeria" : "Densidade suficiente para galeria fechada"
    ),
    item(
      "bocas_de_lobo",
      "drenagem",
      "Bocas de lobo",
      Math.ceil(extensaoViariaM / 50) * (baixaDensidade ? 0.5 : 1),
      "un",
      custos,
      true,
      baixaDensidade ? "Quantidade reduzida à metade — baixa densidade" : "Quantidade padrão"
    ),
    item("pvs_drenagem", "drenagem", "Poços de visita de drenagem", Math.ceil(extensaoViariaM / 100), "un", custos, true, "Sempre ativo"),
    item("sarjeta_meio_fio", "drenagem", "Sarjeta e meio-fio", extensaoViariaM * 2, "m", custos, true, "Ambos os lados da via")
  );

  // =========================================================================
  // GRUPO 3 — Pavimentação e Calçadas
  // =========================================================================
  const baseItemCodigo = baixaDensidade ? "pavimentacao_base_simplificada" : "pavimentacao_base_padrao";
  const capaItemCodigo = input.padraoPavimentacao === "asfalto" ? "pavimentacao_capa_asfalto" : "pavimentacao_capa_paver";
  itens.push(
    item(
      baseItemCodigo,
      "pavimentacao",
      `Base do pavimento (${baixaDensidade ? "simplificada — baixa densidade" : "padrão"})`,
      input.sistemaViarioM2,
      "m²",
      custos,
      true,
      baixaDensidade ? "Baixa densidade — base simplificada" : "Base padrão"
    ),
    item(
      capaItemCodigo,
      "pavimentacao",
      `Capa de pavimento (${input.padraoPavimentacao})`,
      input.sistemaViarioM2,
      "m²",
      custos,
      true,
      `Padrão de pavimentação escolhido: ${input.padraoPavimentacao}`
    ),
    item(
      "calcadas",
      "pavimentacao",
      "Calçadas",
      input.areaCalcadasM2,
      "m²",
      custos,
      !baixaDensidade,
      baixaDensidade ? "Baixa densidade (<20 hab/ha) — calçadas zeradas" : "Densidade padrão"
    )
  );

  // =========================================================================
  // GRUPO 4 — Abastecimento de Água
  // =========================================================================
  const aguaPorPoco = input.solucaoAgua === "poco";
  const dimensionamentoAgua = calcularDimensionamentoAgua({
    numeroLotes: input.numeroLotes,
    taxaOcupacaoHabPorLote: input.taxaOcupacaoHabPorLote ?? 3.5,
    consumoPerCapitaLDia: input.consumoPerCapitaLDia ?? 150,
    k1: input.k1 ?? 1.2,
    diasReservacao: input.diasReservacao ?? 1,
  });
  const ligacaoDomiciliarAguaAtiva = !aguaPorPoco && !(aguaPorPoco && input.isChacara);
  // Regra 2 e 3 (seção 6): poço zera rede+interligação e ativa poço/casa de bombas;
  // poço + chácara também zera a ligação domiciliar (proprietário executa por conta própria)
  itens.push(
    item(
      "rede_distribuicao_agua",
      "agua",
      "Rede de distribuição de água",
      extensaoViariaM,
      "m",
      custos,
      !aguaPorPoco,
      aguaPorPoco ? "Solução por poço individual — rede de distribuição zerada" : "Solução por rede pública"
    ),
    item(
      "ligacao_domiciliar_agua",
      "agua",
      "Ligação domiciliar de água",
      input.numeroLotes,
      "un",
      custos,
      !aguaPorPoco || !input.isChacara,
      aguaPorPoco && input.isChacara
        ? "Poço + condomínio de chácaras — proprietário executa a ligação por conta própria"
        : aguaPorPoco
          ? "Poço individual, mas não é chácara — ligação ainda necessária"
          : "Solução por rede pública"
    ),
    item("poco_tubular", "agua", "Poço tubular profundo", 1, "vb", custos, aguaPorPoco, aguaPorPoco ? "Solução por poço" : "Solução por rede pública"),
    item(
      "reservatorio",
      "agua",
      "Reservatório (dimensionado pelo módulo Água/Energia)",
      dimensionamentoAgua.volumeReservacaoM3,
      "m³",
      custos,
      true,
      `Volume calculado: população ${dimensionamentoAgua.populacaoEstimada.toFixed(0)} hab × consumo`
    ),
    item("casa_de_bombas", "agua", "Casa de bombas", 1, "un", custos, aguaPorPoco, aguaPorPoco ? "Solução por poço" : "Solução por rede pública"),
    item(
      "interligacao_rede_agua",
      "agua",
      "Interligação à rede pública de água",
      1,
      "vb",
      custos,
      !aguaPorPoco,
      !aguaPorPoco ? "Solução por rede pública" : "Solução por poço — não se aplica"
    )
  );

  // =========================================================================
  // GRUPO 5 — Esgotamento Sanitário
  // =========================================================================
  const esgotoFossa = esgotoEfetivo === "fossa";
  const esgotoRedePublica = esgotoEfetivo === "rede_publica";
  const esgotoETE = esgotoEfetivo === "ete_propria";
  const elevatoriaAtiva = esgotoRedePublica && input.necessitaElevatoria === true;
  itens.push(
    item(
      "rede_coletora_esgoto",
      "esgoto",
      "Rede coletora de esgoto",
      extensaoViariaM,
      "m",
      custos,
      esgotoRedePublica,
      esgotoRedePublica ? "Solução por rede pública" : `Solução: ${esgotoEfetivo} — rede coletora zerada`
    ),
    item(
      "pvs_esgoto",
      "esgoto",
      "Poços de visita de esgoto",
      Math.ceil(extensaoViariaM / 100),
      "un",
      custos,
      esgotoRedePublica,
      esgotoRedePublica ? "Solução por rede pública" : `Solução: ${esgotoEfetivo} — PVs zerados`
    ),
    item(
      "ligacoes_esgoto",
      "esgoto",
      "Ligações domiciliares de esgoto",
      input.numeroLotes,
      "un",
      custos,
      esgotoRedePublica,
      esgotoRedePublica ? "Solução por rede pública" : `Solução: ${esgotoEfetivo} — ligações zeradas`
    ),
    item(
      "fossa_sumidouro",
      "esgoto",
      "Fossa séptica + sumidouro",
      input.numeroLotes,
      "un",
      custos,
      esgotoFossa,
      esgotoFossa
        ? input.dispensaRedeColetora && input.solucaoEsgoto !== "fossa"
          ? "Baixa densidade forçou fossa mesmo com Rede Pública selecionada"
          : "Solução por fossa selecionada"
        : `Solução: ${esgotoEfetivo}`
    ),
    item(
      "emissario",
      "esgoto",
      "Emissário",
      extensaoViariaM * 0.3,
      "m",
      custos,
      esgotoRedePublica,
      esgotoRedePublica ? "Solução por rede pública" : `Solução: ${esgotoEfetivo}`
    ),
    item(
      "elevatoria_esgoto",
      "esgoto",
      "Estação elevatória de esgoto",
      1,
      "vb",
      custos,
      elevatoriaAtiva,
      elevatoriaAtiva
        ? "Rede Pública E elevatória=Sim (condicional aninhada — os dois critérios)"
        : "Só ativa quando Rede Pública E elevatória=Sim simultaneamente"
    ),
    item(
      "ete_compacta",
      "esgoto",
      "ETE compacta",
      input.numeroLotes,
      "un",
      custos,
      esgotoETE,
      esgotoETE ? "Solução por ETE própria" : `Solução: ${esgotoEfetivo}`
    )
  );

  // =========================================================================
  // GRUPO 6 — Energia e Iluminação
  // =========================================================================
  const espacamentoIluminacao = baixaDensidade ? 60 : 40; // m entre postes de iluminação — maior espaçamento em baixa densidade
  const clientePagaRede = input.participacaoEletrica === "cliente_paga";
  itens.push(
    item("rede_aerea_energia", "energia", "Rede aérea de energia", extensaoViariaM, "m", custos, true, "Sempre ativo"),
    item("postes_energia", "energia", "Postes de energia", Math.ceil(extensaoViariaM / 35), "un", custos, true, "Sempre ativo"),
    item(
      "transformadores",
      "energia",
      "Transformadores (1 a cada 50 lotes)",
      Math.ceil(input.numeroLotes / 50),
      "un",
      custos,
      true,
      "1 transformador a cada 50 lotes"
    ),
    item(
      "iluminacao_publica",
      "energia",
      "Iluminação pública",
      Math.ceil(extensaoViariaM / espacamentoIluminacao),
      "un",
      custos,
      true,
      `Espaçamento de ${espacamentoIluminacao}m (${baixaDensidade ? "baixa densidade" : "padrão"})`
    ),
    item("entrada_por_lote", "energia", "Entrada de energia por lote", input.numeroLotes, "un", custos, true, "Sempre ativo"),
    item(
      "obra_conexao_externa_energia",
      "energia",
      "Obra de conexão externa à rede",
      1,
      "vb",
      custos,
      clientePagaRede,
      clientePagaRede
        ? "Participação financeira: Cliente paga — item entra no CAPEX"
        : "Participação financeira: Concessionária cobre — item zerado (REN 1000/2021 art. 108)"
    )
  );

  // =========================================================================
  // GRUPO 7 — Obras Civis (Condomínio Fechado)
  // =========================================================================
  const isCondominioFechado = input.tipologia === "condominio_fechado";
  itens.push(
    item(
      "muro_condominio",
      "obras_civis_condominio",
      "Muro de fechamento",
      input.perimetroGlebaM,
      "m",
      custos,
      isCondominioFechado,
      isCondominioFechado ? "Tipologia = Condomínio Fechado" : "Tipologia ≠ Condomínio Fechado — zerado"
    ),
    item(
      "portaria",
      "obras_civis_condominio",
      "Portaria",
      1,
      "un",
      custos,
      isCondominioFechado,
      isCondominioFechado ? "Tipologia = Condomínio Fechado" : "Tipologia ≠ Condomínio Fechado — zerado"
    ),
    item(
      "area_lazer",
      "obras_civis_condominio",
      "Área de lazer/clube",
      1,
      "vb",
      custos,
      isCondominioFechado,
      isCondominioFechado ? "Tipologia = Condomínio Fechado" : "Tipologia ≠ Condomínio Fechado — zerado"
    )
  );

  // =========================================================================
  // GRUPO 8 — Serviços Complementares
  // =========================================================================
  itens.push(
    item("sinalizacao_viaria", "servicos_complementares", "Sinalização viária", extensaoViariaM, "m", custos, true, "Sempre ativo"),
    item("paisagismo", "servicos_complementares", "Paisagismo (área verde)", input.areaVerdeM2, "m²", custos, true, "Sempre ativo"),
    item("projetos_executivos", "servicos_complementares", "Projetos executivos", 1, "vb", custos, true, "Sempre ativo"),
    item(
      "corte_arvores_isoladas",
      "servicos_complementares",
      "Corte de árvores isoladas",
      arvoresIsoladasUn,
      "un",
      custos,
      arvoresIsoladasUn > 0,
      arvoresIsoladasUn > 0 ? "Árvores isoladas informadas > 0" : "Sem árvores isoladas a suprimir"
    ),
    item(
      "compensacao_arvores_isoladas",
      "servicos_complementares",
      "Compensação por árvore isolada",
      arvoresIsoladasUn,
      "un",
      custos,
      arvoresIsoladasUn > 0,
      arvoresIsoladasUn > 0
        ? "Autorização por unidade — distinta da compensação por supressão em área (módulo Aprovações)"
        : "Sem árvores isoladas a suprimir"
    )
  );

  // ---- Totalizadores ----
  const totaisPorGrupo: Record<string, number> = {};
  for (const it of itens) {
    totaisPorGrupo[it.grupo] = (totaisPorGrupo[it.grupo] ?? 0) + it.total;
  }

  const subtotalInfraestrutura = itens.reduce((sum, it) => sum + it.total, 0);
  const bdiValor = subtotalInfraestrutura * (params.bdiPercentual / 100);
  const subtotalComBDI = subtotalInfraestrutura + bdiValor;

  const contingenciaValor = subtotalComBDI * ((params.contingenciaPercentual ?? 0) / 100);
  const aprovacoesValor = params.custoAprovacoesTotal ?? 0;
  const custoFinanceiroValor = subtotalComBDI * ((params.custoFinanceiroPercentual ?? 0) / 100);

  const capexTotal = subtotalComBDI + contingenciaValor + aprovacoesValor + custoFinanceiroValor;

  return {
    itens,
    totaisPorGrupo,
    subtotalInfraestrutura,
    bdiValor,
    subtotalComBDI,
    contingenciaValor,
    aprovacoesValor,
    custoFinanceiroValor,
    capexTotal,
    custoPorLote: input.numeroLotes > 0 ? capexTotal / input.numeroLotes : 0,
    custoPorM2Gleba: input.areaBruta > 0 ? capexTotal / input.areaBruta : 0,
    capexSobreVGV: params.vgvTotal && params.vgvTotal > 0 ? capexTotal / params.vgvTotal : null,
    populacaoEstimada: dimensionamentoAgua.populacaoEstimada,
    volumeReservacaoM3: dimensionamentoAgua.volumeReservacaoM3,
  };
}
