/**
 * Módulo 2.5 — Aprovações e Projetos (custo parametrizado por m² de gleba).
 *
 * Antes deste motor, o "Custo de Aprovações" era um campo digitado à mão no
 * wizard (ou zero, subestimando o CAPEX silenciosamente). Agora é calculado
 * a partir da área da gleba × índices R$/m² do Módulo de Configuração, com
 * a mesma lógica condicional da planilha mestre (aba "Aprovações").
 *
 * Motor puro: nenhum índice é hardcoded aqui — todos chegam resolvidos pela
 * camada de serviço via `ApprovalCostIndices`.
 */

import type { ParticipacaoEletrica, SolucaoAgua, SolucaoEsgoto } from "./costEngine";

export interface ApprovalCostInput {
  areaGlebaM2: number;
  solucaoAgua: SolucaoAgua;
  solucaoEsgoto: SolucaoEsgoto;
  areaSupressaoVegetalM2?: number;
  participacaoEletrica: ParticipacaoEletrica;
}

/** Índices R$/m² de gleba e taxas fixas (R$), resolvidos do Módulo de Configuração. */
export interface ApprovalCostIndices {
  // Grupo A — Levantamentos e Projetos (R$/m²)
  topografiaM2: number;
  projetosEngenhariaM2: number;
  sondagemM2: number;
  // Grupo B — Licenciamento Ambiental
  estudoAmbientalM2: number;
  compensacaoFlorestalM2: number;
  outorgaHidricaVb: number; // taxa fixa, só se água por poço
  // Grupo C — Taxas Oficiais (R$/m²)
  taxasLicenciamentoM2: number;
  registroParcelamentoM2: number;
  assessoriaProtocolosM2: number;
  // Grupo D — Concessionárias
  analiseProjetoAguaVb: number; // taxa fixa
  analiseProjetoEsgotoVb: number; // taxa fixa, dispensada na fossa
  hidrossanitarioFossaVb: number; // escala com a solução de esgoto
  hidrossanitarioEteVb: number;
  hidrossanitarioRedeVb: number;
  participacaoEletricaM2: number;
}

export interface ApprovalCostItem {
  itemCodigo: string;
  grupo: "levantamentos" | "ambiental" | "taxas_oficiais" | "concessionarias";
  descricao: string;
  indice: number; // R$/m² quando base = área; R$ quando base = verba
  base: "area_gleba" | "verba";
  total: number;
  ativo: boolean;
  motivo: string; // auditabilidade da lógica condicional
}

export interface ApprovalCostOutput {
  itens: ApprovalCostItem[];
  totaisPorGrupo: Record<string, number>;
  custoAprovacoesTotal: number;
  custoPorM2Gleba: number;
}

function itemArea(
  itemCodigo: string,
  grupo: ApprovalCostItem["grupo"],
  descricao: string,
  indiceM2: number,
  areaGlebaM2: number,
  ativo: boolean,
  motivo: string
): ApprovalCostItem {
  return {
    itemCodigo,
    grupo,
    descricao,
    indice: indiceM2,
    base: "area_gleba",
    total: ativo ? indiceM2 * areaGlebaM2 : 0,
    ativo,
    motivo,
  };
}

function itemVerba(
  itemCodigo: string,
  grupo: ApprovalCostItem["grupo"],
  descricao: string,
  valor: number,
  ativo: boolean,
  motivo: string
): ApprovalCostItem {
  return {
    itemCodigo,
    grupo,
    descricao,
    indice: valor,
    base: "verba",
    total: ativo ? valor : 0,
    ativo,
    motivo,
  };
}

export function calcularCustoAprovacoes(
  input: ApprovalCostInput,
  indices: ApprovalCostIndices
): ApprovalCostOutput {
  const area = input.areaGlebaM2;
  const houveSupressao = (input.areaSupressaoVegetalM2 ?? 0) > 0;
  const aguaPorPoco = input.solucaoAgua === "poco";
  const esgotoFossa = input.solucaoEsgoto === "fossa";
  const esgotoEtePropria = input.solucaoEsgoto === "ete_propria";
  const clientePagaRede = input.participacaoEletrica === "cliente_paga";

  const itens: ApprovalCostItem[] = [
    // ---- A. Levantamentos e Projetos ----
    itemArea("aprovacao_topografia", "levantamentos", "Topografia e georreferenciamento", indices.topografiaM2, area, true, "Sempre ativo — área × índice"),
    itemArea("aprovacao_projetos_engenharia", "levantamentos", "Projetos de engenharia (urbanístico, redes, terraplenagem)", indices.projetosEngenhariaM2, area, true, "Sempre ativo — área × índice"),
    itemArea("aprovacao_sondagem", "levantamentos", "Sondagem e ensaios geotécnicos", indices.sondagemM2, area, true, "Sempre ativo — área × índice"),

    // ---- B. Licenciamento Ambiental ----
    itemArea("aprovacao_estudo_ambiental", "ambiental", "Estudo ambiental (RAS/PCA/EIA) + ART", indices.estudoAmbientalM2, area, true, "Sempre ativo — área × índice"),
    itemArea(
      "aprovacao_compensacao_florestal",
      "ambiental",
      "Compensação / reposição florestal",
      indices.compensacaoFlorestalM2,
      area,
      houveSupressao,
      houveSupressao
        ? "Há área de supressão vegetal (> 0) — compensação exigida"
        : "Sem supressão vegetal — compensação zerada"
    ),
    itemVerba(
      "aprovacao_outorga_hidrica",
      "ambiental",
      "Outorga de recursos hídricos (poço)",
      indices.outorgaHidricaVb,
      aguaPorPoco,
      aguaPorPoco ? "Solução de água por poço — outorga exigida" : "Solução por rede pública — outorga dispensada"
    ),

    // ---- C. Taxas Oficiais ----
    itemArea("aprovacao_taxas_licenciamento", "taxas_oficiais", "Taxas de licenciamento (SEMAD + Prefeitura)", indices.taxasLicenciamentoM2, area, true, "Sempre ativo — área × índice"),
    itemArea("aprovacao_registro_parcelamento", "taxas_oficiais", "Registro do parcelamento (CRI)", indices.registroParcelamentoM2, area, true, "Sempre ativo — área × índice"),
    itemArea("aprovacao_assessoria_protocolos", "taxas_oficiais", "Assessoria e protocolos", indices.assessoriaProtocolosM2, area, true, "Sempre ativo — área × índice"),

    // ---- D. Concessionárias ----
    itemVerba("aprovacao_analise_projeto_agua", "concessionarias", "Análise de projeto de água (SAA)", indices.analiseProjetoAguaVb, true, "Taxa fixa da concessionária"),
    itemVerba(
      "aprovacao_analise_projeto_esgoto",
      "concessionarias",
      "Análise de projeto de esgoto (SES)",
      indices.analiseProjetoEsgotoVb,
      !esgotoFossa,
      esgotoFossa ? "Solução por fossa — análise da concessionária dispensada" : "Solução coletiva — análise exigida"
    ),
    itemVerba(
      "aprovacao_projeto_hidrossanitario",
      "concessionarias",
      "Projeto hidrossanitário + ART",
      esgotoFossa ? indices.hidrossanitarioFossaVb : esgotoEtePropria ? indices.hidrossanitarioEteVb : indices.hidrossanitarioRedeVb,
      true,
      esgotoFossa
        ? "Escopo reduzido — solução por fossa"
        : esgotoEtePropria
          ? "Escopo ampliado — ETE própria exige projeto de tratamento"
          : "Escopo padrão — rede pública"
    ),
    // DESVIO DELIBERADO da planilha mestre: lá a participação elétrica é
    // cobrada sempre (aba Aprovações, D.4 não é condicional), porque a
    // planilha não modela a escolha de participação financeira. A spec
    // (módulo 2.3 e seção 6) diz que essa escolha "zera ou ativa um item
    // inteiro no orçamento" (REN 1000/2021 art. 108), e o CostEngine já zera
    // o item físico correspondente quando a concessionária cobre. Cobrar a
    // participação aqui mesmo assim contradiria a própria regra de negócio.
    itemArea(
      "aprovacao_participacao_eletrica",
      "concessionarias",
      "Participação financeira — rede elétrica",
      indices.participacaoEletricaM2,
      area,
      clientePagaRede,
      clientePagaRede
        ? "Participação financeira: Cliente paga — entra no custo de aprovações"
        : "Participação financeira: Concessionária cobre — zerado (REN 1000/2021 art. 108)"
    ),
  ];

  const totaisPorGrupo: Record<string, number> = {};
  for (const item of itens) {
    totaisPorGrupo[item.grupo] = (totaisPorGrupo[item.grupo] ?? 0) + item.total;
  }

  const custoAprovacoesTotal = itens.reduce((soma, i) => soma + i.total, 0);

  return {
    itens,
    totaisPorGrupo,
    custoAprovacoesTotal,
    custoPorM2Gleba: area > 0 ? custoAprovacoesTotal / area : 0,
  };
}
