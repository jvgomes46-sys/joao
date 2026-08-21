import { getMergedUnitCosts, getCostParameter, getCostParameters, createConfigSnapshot, extrairUfDaLocalizacao } from "../config";
import { getGeoEngineDataByProjectId, getProjectById, upsertCostEngineData } from "../db";
import { calcularCostEngine, CostEngineInput, CostEngineOutput, UnitCostTable } from "../engines/costEngine";
import { calcularCustoAprovacoes, type ApprovalCostIndices, type ApprovalCostOutput } from "../engines/approvalCostEngine";

/** Chaves de Configuração que alimentam o módulo 2.5 (Aprovações e Projetos). */
const CHAVES_APROVACOES = [
  "aprovacao_topografia_m2",
  "aprovacao_projetos_engenharia_m2",
  "aprovacao_sondagem_m2",
  "aprovacao_estudo_ambiental_m2",
  "aprovacao_compensacao_florestal_m2",
  "aprovacao_outorga_hidrica_vb",
  "aprovacao_taxas_licenciamento_m2",
  "aprovacao_registro_parcelamento_m2",
  "aprovacao_assessoria_protocolos_m2",
  "aprovacao_analise_projeto_agua_vb",
  "aprovacao_analise_projeto_esgoto_vb",
  "aprovacao_hidrossanitario_fossa_vb",
  "aprovacao_hidrossanitario_ete_vb",
  "aprovacao_hidrossanitario_rede_vb",
  "aprovacao_participacao_eletrica_m2",
] as const;

function montarIndicesAprovacao(p: Record<string, number>): ApprovalCostIndices {
  return {
    topografiaM2: p["aprovacao_topografia_m2"],
    projetosEngenhariaM2: p["aprovacao_projetos_engenharia_m2"],
    sondagemM2: p["aprovacao_sondagem_m2"],
    estudoAmbientalM2: p["aprovacao_estudo_ambiental_m2"],
    compensacaoFlorestalM2: p["aprovacao_compensacao_florestal_m2"],
    outorgaHidricaVb: p["aprovacao_outorga_hidrica_vb"],
    taxasLicenciamentoM2: p["aprovacao_taxas_licenciamento_m2"],
    registroParcelamentoM2: p["aprovacao_registro_parcelamento_m2"],
    assessoriaProtocolosM2: p["aprovacao_assessoria_protocolos_m2"],
    analiseProjetoAguaVb: p["aprovacao_analise_projeto_agua_vb"],
    analiseProjetoEsgotoVb: p["aprovacao_analise_projeto_esgoto_vb"],
    hidrossanitarioFossaVb: p["aprovacao_hidrossanitario_fossa_vb"],
    hidrossanitarioEteVb: p["aprovacao_hidrossanitario_ete_vb"],
    hidrossanitarioRedeVb: p["aprovacao_hidrossanitario_rede_vb"],
    participacaoEletricaM2: p["aprovacao_participacao_eletrica_m2"],
  };
}

export type CostEngineTechnicalInput = Omit<
  CostEngineInput,
  "areaBruta" | "numeroLotes" | "sistemaViarioM2" | "areaCalcadasM2" | "areaVerdeM2" | "densidadeHabHa" | "dispensaRedeColetora" | "perimetroGlebaM"
> & {
  perimetroGlebaM?: number; // opcional aqui — se omitido, estimado a partir da área bruta (fallback grosseiro)
  contingenciaPercentual?: number;
  custoFinanceiroPercentual?: number;
  /**
   * Override manual do custo de aprovações. Se omitido (caso normal), o
   * módulo 2.5 calcula automaticamente a partir da área da gleba × índices
   * R$/m² da Configuração — ver `calcularCustoAprovacoes`.
   */
  custoAprovacoesTotal?: number;
  vgvTotal?: number;
  regiao?: string; // padrão: UF detectada da localização do projeto, senão "Nacional"
};

/**
 * Orquestra o cálculo do CostEngine para um projeto:
 * 1. Exige que o GeoEngine já tenha rodado (não recalcula geometria aqui —
 *    consome a área/lotes/densidade já persistidos).
 * 2. Resolve a tabela de custos unitários vigente e o BDI a partir do
 *    Módulo de Configuração — nunca hardcoded.
 * 3. Roda o cálculo puro (`calcularCostEngine`) com toda a lógica
 *    condicional da seção 6.
 * 4. Persiste o resultado (totais por grupo + detalhamento item a item) em
 *    `cost_engine_data`.
 * 5. Grava snapshot imutável da configuração usada (seção 5.3) — obrigatório.
 */
export async function runCostEngine(
  projectId: number,
  userId: number,
  input: CostEngineTechnicalInput
): Promise<CostEngineOutput & { aprovacoes: ApprovalCostOutput }> {
  const project = await getProjectById(projectId, userId);
  if (!project) {
    throw new Error("Projeto não encontrado ou não pertence ao usuário");
  }

  const geo = await getGeoEngineDataByProjectId(projectId);
  if (!geo) {
    throw new Error(
      "CostEngine depende do GeoEngine — calcule o GeoEngine deste projeto antes (área, número de lotes e densidade vêm de lá)"
    );
  }
  if (geo.numeroLotes === null || geo.areaBruta === null || geo.sistemaViario === null || geo.densidade === null) {
    throw new Error("Resultado do GeoEngine incompleto para este projeto — recalcule o GeoEngine");
  }

  const regiao = input.regiao ?? extrairUfDaLocalizacao(project.location) ?? "Nacional";
  const { regiao: _regiao, contingenciaPercentual, custoFinanceiroPercentual, custoAprovacoesTotal, vgvTotal, ...technicalInput } = input;

  const unitCostRows = await getMergedUnitCosts(regiao);
  if (unitCostRows.length === 0) {
    throw new Error(`Nenhum custo unitário cadastrado na Configuração para a região "${regiao}" — rode o seed ou cadastre os custos`);
  }
  const custos: UnitCostTable = {};
  for (const row of unitCostRows) {
    custos[row.itemCodigo] = Number(row.valorUnitario);
  }

  // BDI é hoje um parâmetro nacional único na Configuração (seed); regiões
  // específicas podem futuramente ter sua própria linha em config_cost_parameters.
  const bdiParam = await getCostParameter("bdi_infraestrutura", "Nacional");

  const indicesUrbanisticos = geo.indicesUrbanisticos as { percentualCalcadas?: number } | null;
  const areaParcelavel = Number(geo.areaLiquida ?? geo.areaBruta);
  const areaCalcadasM2 = ((indicesUrbanisticos?.percentualCalcadas ?? 0) / 100) * areaParcelavel;

  const costInput: CostEngineInput = {
    ...technicalInput,
    areaBruta: Number(geo.areaBruta),
    numeroLotes: geo.numeroLotes,
    sistemaViarioM2: Number(geo.sistemaViario),
    areaCalcadasM2,
    areaVerdeM2: Number(geo.areaVerde ?? 0),
    perimetroGlebaM: technicalInput.perimetroGlebaM ?? estimarPerimetroQuadrado(Number(geo.areaBruta)),
    densidadeHabHa: Number(geo.densidade),
    dispensaRedeColetora: Number(geo.densidade) < 20,
  };

  // Módulo 2.5 — custo de aprovações calculado automaticamente a partir da
  // área da gleba × índices da Configuração. O override manual só é usado se
  // explicitamente informado; caso contrário nada é digitado à mão.
  const indicesAprovacao = montarIndicesAprovacao(await getCostParameters([...CHAVES_APROVACOES], "Nacional"));
  const aprovacoes = calcularCustoAprovacoes(
    {
      areaGlebaM2: Number(geo.areaBruta),
      solucaoAgua: costInput.solucaoAgua,
      solucaoEsgoto: costInput.solucaoEsgoto,
      areaSupressaoVegetalM2: costInput.areaSupressaoVegetalM2,
      participacaoEletrica: costInput.participacaoEletrica,
    },
    indicesAprovacao
  );
  const aprovacoesEfetivo = custoAprovacoesTotal ?? aprovacoes.custoAprovacoesTotal;

  const output = calcularCostEngine(costInput, custos, {
    bdiPercentual: Number(bdiParam.valor),
    contingenciaPercentual,
    custoFinanceiroPercentual,
    custoAprovacoesTotal: aprovacoesEfetivo,
    vgvTotal,
  });

  await upsertCostEngineData(projectId, {
    terraplanagem: String(output.totaisPorGrupo["terraplenagem"] ?? 0),
    drenagem: String(output.totaisPorGrupo["drenagem"] ?? 0),
    pavimentacao: String(output.totaisPorGrupo["pavimentacao"] ?? 0),
    agua: String(output.totaisPorGrupo["agua"] ?? 0),
    esgoto: String(output.totaisPorGrupo["esgoto"] ?? 0),
    energia: String(output.totaisPorGrupo["energia"] ?? 0),
    paisagismo: String(output.totaisPorGrupo["servicos_complementares"] ?? 0),
    portaria: String(output.totaisPorGrupo["obras_civis_condominio"] ?? 0),
    areaLazer: null,
    // Módulo 2.5 — o detalhamento auditável item a item vai em
    // `detalhamentoAprovacoes`. Estas colunas legadas guardam só recortes que
    // mapeiam 1:1 e NÃO se sobrepõem entre si (registro é um item dentro de
    // taxas_oficiais, por isso taxas_oficiais não é gravado inteiro aqui).
    licenciamento: String(aprovacoes.totaisPorGrupo["ambiental"] ?? 0),
    registro: String(aprovacoes.itens.find((i) => i.itemCodigo === "aprovacao_registro_parcelamento")?.total ?? 0),
    cartorio: null,
    custosIndiretos: String(output.bdiValor),
    contingencias: String(output.contingenciaValor),
    investimentoTotal: String(output.capexTotal),
    valorPorHectare: String(costInput.areaBruta > 0 ? (output.capexTotal / costInput.areaBruta) * 10_000 : 0),
    valorPorM2: String(output.custoPorM2Gleba),
    valorPorLote: String(output.custoPorLote),
    detalhamentoItens: output.itens,
    dimensionamentoAguaEnergia: output.dimensionamentoAguaEnergia,
    detalhamentoAprovacoes: aprovacoes,
    // Premissas que geraram este orçamento — auditabilidade, e são a fonte
    // dos gatilhos de prazo de aprovação usados depois pelo FinanceEngine.
    premissasTecnicas: {
      tipologia: costInput.tipologia,
      topografia: costInput.topografia,
      padraoPavimentacao: costInput.padraoPavimentacao,
      solucaoAgua: costInput.solucaoAgua,
      solucaoEsgoto: costInput.solucaoEsgoto,
      necessitaElevatoria: costInput.necessitaElevatoria ?? false,
      participacaoEletrica: costInput.participacaoEletrica,
      areaSupressaoVegetalM2: costInput.areaSupressaoVegetalM2 ?? 0,
      arvoresIsoladasUn: costInput.arvoresIsoladasUn ?? 0,
      isChacara: costInput.isChacara ?? false,
    },
  });

  await createConfigSnapshot({
    projectId,
    engine: "cost_engine",
    snapshotData: {
      regiao,
      bdiPercentual: Number(bdiParam.valor),
      custosUnitarios: custos,
      indicesAprovacao,
    },
    overrides: {
      contingenciaPercentual,
      custoFinanceiroPercentual,
      custoAprovacoesTotal,
    },
  });

  return { ...output, aprovacoes };
}

/** Estimativa de perímetro para um lote quadrado — usado só como fallback quando o perímetro real não é informado. */
function estimarPerimetroQuadrado(areaM2: number): number {
  return 4 * Math.sqrt(areaM2);
}
