import "dotenv/config";
import { getDb } from "../server/db";
import {
  configCostParameters,
  configFinancialIndices,
  configLegislation,
  configStandardTimelines,
  configTaxRegimes,
  configTypologyMatrix,
  configUnitCosts,
} from "./schema";

/**
 * Seed do Módulo de Configuração com os valores-padrão descritos na
 * Especificação EVTE PRO (seção 5). Alguns valores são PLACEHOLDERS
 * marcados com "// TODO(confirmar)" porque o documento de spec não define
 * o número exato (ex: faixas de prazo de obra por porte, alíquotas
 * tributárias) — ajustar via admin ou reseed antes de usar em produção.
 *
 * Idempotente: roda um DELETE + INSERT das linhas seed (identificadas por
 * chave estável), seguro para rodar mais de uma vez em dev.
 */
async function main() {
  const db = await getDb();
  if (!db) throw new Error("DATABASE_URL não configurado — seed requer banco real");

  const now = new Date();

  // Idempotência simples para dev: limpa as tabelas de config antes de resemear.
  await db.delete(configTaxRegimes);
  await db.delete(configFinancialIndices);
  await db.delete(configStandardTimelines);
  await db.delete(configTypologyMatrix);
  await db.delete(configCostParameters);
  await db.delete(configLegislation);
  await db.delete(configUnitCosts);

  // --- A. Legislação: piso federal (Lei 6.766/79) como fallback ---
  await db.insert(configLegislation).values({
    municipio: "Piso Federal (Lei 6.766/79)",
    uf: null,
    pais: "Brasil",
    percentualAreaVerdeMin: "15.00", // default do módulo Premissas, editável por projeto
    percentualAreaInstitucionalMin: "5.00",
    percentualSistemaViarioMin: null, // lei federal não fixa piso de sistema viário desde a Lei 9.785/99
    areaMinimaLote: "125.00",
    frenteMinimaLote: "5.00",
    faixaNonAedificandi: "15.00",
    prazoExecucaoObrasMeses: 48,
    regrasArborizacao: { observacao: "Autorização de corte por árvore isolada e proporção de compensação variam por município — cadastre o município específico para regra real." },
    fonte: "Lei 6.766/79, atualizada pelas Leis 9.785/99, 13.465/17 e 14.285/21",
    dataUltimaVerificacao: now,
    isFederalFallback: true,
  });

  // --- BDI padrão ---
  // Valor real calibrado a partir do orçamento "Residencial Mirante"
  // (Formosa/GO): todo item usa BDI 1 = 20% (ex.: 307,26 × 1,20 = 368,712).
  await db.insert(configCostParameters).values({
    chave: "bdi_infraestrutura",
    valor: "20.0000",
    regiao: "Nacional",
    dataBase: now,
    fonte: "Orçamento de Implantação — Residencial Mirante (Formosa/GO), coluna 'BDI 1' aplicada uniformemente em todos os itens",
  });

  // --- Contingência e custo financeiro ---
  // Valores REAIS da Planilha Mestre (Premissas!B74 = 5%, B75 = 6%).
  await db.insert(configCostParameters).values([
    {
      chave: "contingencia_obra_percentual",
      valor: "5.0000",
      regiao: "Nacional",
      dataBase: now,
      fonte: "Planilha Mestre de Viabilidade — Premissas!B74 (Contingência sobre a obra)",
    },
    {
      chave: "custo_financeiro_infra_percentual",
      valor: "6.0000",
      regiao: "Nacional",
      dataBase: now,
      fonte: "Planilha Mestre de Viabilidade — Premissas!B75 (Custo financeiro % s/ infra)",
    },
  ]);

  // --- Deduções sobre a venda e política de parcelamento ---
  // Valores REAIS da Planilha Mestre (Premissas!B62-B66 = 6/3/6/5/4, somando
  // 24% do VGV; B101 = entrada 20%; B102 = 120 parcelas). Guardados como
  // percentual 0-100; os motores usam fração e a camada de serviço converte.
  const FONTE_VENDA = "Planilha Mestre de Viabilidade — Premissas, seção de deduções sobre venda";
  const FONTE_PARCELAMENTO = "Planilha Mestre de Viabilidade — Premissas, seção 9 (Parcelamento de vendas)";
  await db.insert(configCostParameters).values([
    { chave: "venda_comissao_percentual", valor: "6.0000", regiao: "Nacional", dataBase: now, fonte: `${FONTE_VENDA} — B62 (comissão de vendas)` },
    { chave: "venda_marketing_percentual", valor: "3.0000", regiao: "Nacional", dataBase: now, fonte: `${FONTE_VENDA} — B63 (verba de marketing)` },
    { chave: "venda_impostos_percentual", valor: "6.0000", regiao: "Nacional", dataBase: now, fonte: `${FONTE_VENDA} — B64 (impostos sobre venda)` },
    { chave: "venda_inadimplencia_percentual", valor: "5.0000", regiao: "Nacional", dataBase: now, fonte: `${FONTE_VENDA} — B65 (inadimplência/distrato)` },
    { chave: "venda_despesas_administrativas_percentual", valor: "4.0000", regiao: "Nacional", dataBase: now, fonte: `${FONTE_VENDA} — B66 (despesas administrativas)` },
    { chave: "parcelamento_entrada_percentual", valor: "20.0000", regiao: "Nacional", dataBase: now, fonte: `${FONTE_PARCELAMENTO} — B101 (entrada no ato da venda)` },
    { chave: "parcelamento_numero_parcelas", valor: "120.0000", regiao: "Nacional", dataBase: now, fonte: `${FONTE_PARCELAMENTO} — B102 (número de parcelas)` },
  ]);

  // --- Módulo 2.5: índices de Aprovações e Projetos ---
  // Valores REAIS da Planilha Mestre de Viabilidade: índices R$/m² da aba
  // "Tabelas" seção M (linhas 94-102) e taxas fixas da aba "Aprovações"
  // (B.3, D.1-D.3). Com estes, o custo de aprovações deixa de ser digitado
  // à mão no wizard e passa a ser calculado a partir da área da gleba.
  const FONTE_APROVACOES = "Planilha Mestre de Viabilidade — aba Tabelas, seção M (Índices de aprovação por m² de gleba)";
  const FONTE_APROVACOES_FIXA = "Planilha Mestre de Viabilidade — aba Aprovações (taxas fixas de concessionária/órgão)";
  await db.insert(configCostParameters).values([
    // Grupo A — Levantamentos e Projetos (R$/m² de gleba)
    { chave: "aprovacao_topografia_m2", valor: "0.3000", regiao: "Nacional", dataBase: now, fonte: `${FONTE_APROVACOES} — B94 (levantamento planialtimétrico)` },
    { chave: "aprovacao_projetos_engenharia_m2", valor: "2.0000", regiao: "Nacional", dataBase: now, fonte: `${FONTE_APROVACOES} — B95 (urbanístico, terraplenagem, redes)` },
    { chave: "aprovacao_sondagem_m2", valor: "0.1200", regiao: "Nacional", dataBase: now, fonte: `${FONTE_APROVACOES} — B97 (furos e ensaios)` },
    // Grupo B — Licenciamento Ambiental
    { chave: "aprovacao_estudo_ambiental_m2", valor: "0.2500", regiao: "Nacional", dataBase: now, fonte: `${FONTE_APROVACOES} — B98 (consultoria ambiental)` },
    { chave: "aprovacao_compensacao_florestal_m2", valor: "0.3500", regiao: "Nacional", dataBase: now, fonte: `${FONTE_APROVACOES} — B101 (condicional: só com supressão)` },
    { chave: "aprovacao_outorga_hidrica_vb", valor: "2500.0000", regiao: "Nacional", dataBase: now, fonte: `${FONTE_APROVACOES_FIXA} — B.3 (condicional: só se água por poço)` },
    // Grupo C — Taxas Oficiais (R$/m² de gleba)
    { chave: "aprovacao_taxas_licenciamento_m2", valor: "0.8000", regiao: "Nacional", dataBase: now, fonte: `${FONTE_APROVACOES} — B96 (SEMAD/Prefeitura)` },
    { chave: "aprovacao_registro_parcelamento_m2", valor: "0.1800", regiao: "Nacional", dataBase: now, fonte: `${FONTE_APROVACOES} — B100 (emolumentos cartorários do CRI)` },
    { chave: "aprovacao_assessoria_protocolos_m2", valor: "0.1000", regiao: "Nacional", dataBase: now, fonte: `${FONTE_APROVACOES} — B99 (acompanhamento de processo)` },
    // Grupo D — Concessionárias
    { chave: "aprovacao_analise_projeto_agua_vb", valor: "5000.0000", regiao: "Nacional", dataBase: now, fonte: `${FONTE_APROVACOES_FIXA} — D.1 (análise SAA)` },
    { chave: "aprovacao_analise_projeto_esgoto_vb", valor: "5000.0000", regiao: "Nacional", dataBase: now, fonte: `${FONTE_APROVACOES_FIXA} — D.2 (análise SES, dispensada na fossa)` },
    { chave: "aprovacao_hidrossanitario_fossa_vb", valor: "22000.0000", regiao: "Nacional", dataBase: now, fonte: `${FONTE_APROVACOES_FIXA} — D.3 (escopo reduzido: fossa)` },
    { chave: "aprovacao_hidrossanitario_ete_vb", valor: "145000.0000", regiao: "Nacional", dataBase: now, fonte: `${FONTE_APROVACOES_FIXA} — D.3 (escopo ampliado: ETE própria)` },
    { chave: "aprovacao_hidrossanitario_rede_vb", valor: "95000.0000", regiao: "Nacional", dataBase: now, fonte: `${FONTE_APROVACOES_FIXA} — D.3 (escopo padrão: rede pública)` },
    { chave: "aprovacao_participacao_eletrica_m2", valor: "0.3000", regiao: "Nacional", dataBase: now, fonte: `${FONTE_APROVACOES} — B102 (extensão até o ponto de entrega)` },
  ]);

  // --- D. Matriz de Tipologia ---
  // Valores reais extraídos de Tabelas!A72:E76 da Planilha Mestre de
  // Viabilidade (aba "J. MATRIZ DE TIPOLOGIA — base do PROCV"), não mais
  // placeholder. velocidadeAbsorcaoPadrao é fração de lotes/mês (ex.: 0.015
  // = 1,5% do total de lotes vendidos por mês), igual à planilha original.
  const typologyRows: (typeof configTypologyMatrix.$inferInsert)[] = [
    { tipologia: "loteamento_popular", precoBaseM2: "380.00", velocidadeAbsorcaoPadrao: "0.0200", temMuro: false, temPortaria: false, temAreaLazer: false, regiao: "Nacional", dataBase: now },
    { tipologia: "loteamento_aberto", precoBaseM2: "450.00", velocidadeAbsorcaoPadrao: "0.0150", temMuro: false, temPortaria: false, temAreaLazer: false, regiao: "Nacional", dataBase: now },
    { tipologia: "condominio_fechado", precoBaseM2: "780.00", velocidadeAbsorcaoPadrao: "0.0080", temMuro: true, temPortaria: true, temAreaLazer: true, regiao: "Nacional", dataBase: now },
    { tipologia: "condominio_chacaras", precoBaseM2: "650.00", velocidadeAbsorcaoPadrao: "0.0060", temMuro: true, temPortaria: true, temAreaLazer: true, regiao: "Nacional", dataBase: now },
  ];
  await db.insert(configTypologyMatrix).values(typologyRows);

  // --- E. Prazos padrão ---
  // TODO(confirmar): faixas de porte da gleba são placeholders.
  await db.insert(configStandardTimelines).values([
    { tipo: "prazo_obra_por_porte", faixaPorteMin: "0", faixaPorteMax: "50000", prazoMeses: 12, regiao: "Nacional" },
    { tipo: "prazo_obra_por_porte", faixaPorteMin: "50000", faixaPorteMax: "150000", prazoMeses: 18, regiao: "Nacional" },
    { tipo: "prazo_obra_por_porte", faixaPorteMin: "150000", faixaPorteMax: null, prazoMeses: 24, regiao: "Nacional" },
    { tipo: "prazo_aprovacao_base", prazoMeses: 12, regiao: "Nacional" },
    { tipo: "prazo_aprovacao_adicional", gatilho: "ete_propria", prazoMeses: 6, regiao: "Nacional" },
    { tipo: "prazo_aprovacao_adicional", gatilho: "supressao_vegetal", prazoMeses: 6, regiao: "Nacional" },
    { tipo: "prazo_aprovacao_adicional", gatilho: "condominio_fechado", prazoMeses: 3, regiao: "Nacional" },
    // Valor REAL da Planilha Mestre (Premissas!B73 = mês 6). Note que na
    // planilha as vendas começam ANTES do fim das aprovações (18 meses) —
    // pré-lançamento é prática normal, então este valor não é derivado do
    // prazo de aprovações.
    { tipo: "inicio_vendas_mes_padrao", prazoMeses: 6, regiao: "Nacional" },
  ]);

  // --- C. Índices financeiros ---
  // TODO(confirmar): valores de exemplo — substituir por valor real vigente
  // ou ligar à API do Bacen/IBGE (origem: "automatico") quando disponível.
  await db.insert(configFinancialIndices).values([
    { indice: "incc", valor: "6.500000", dataReferencia: now, origem: "manual", fonte: "Valor placeholder — atualizar" },
    { indice: "ipca", valor: "4.200000", dataReferencia: now, origem: "manual", fonte: "Valor placeholder — atualizar" },
    { indice: "cambio_usd", valor: "5.400000", dataReferencia: now, origem: "manual", fonte: "Valor placeholder — atualizar" },
  ]);

  // --- F. Regimes tributários ---
  // TODO(confirmar): alíquotas de Lucro Presumido/Real são valores de
  // referência de mercado, não conferidas com o contador do projeto.
  await db.insert(configTaxRegimes).values([
    {
      pais: "Brasil",
      regime: "ret",
      descricao: "Regime Especial de Tributação — patrimônio de afetação",
      aliquotas: { unificada: 4.0 },
      dataBase: now,
    },
    {
      pais: "Brasil",
      regime: "lucro_presumido",
      descricao: "Lucro Presumido",
      aliquotas: { irpj: 15.0, adicionalIrpj: 10.0, csll: 9.0, pis: 0.65, cofins: 3.0 },
      dataBase: now,
    },
    {
      pais: "Brasil",
      regime: "lucro_real",
      descricao: "Lucro Real (com IBS/CBS pós-reforma)",
      aliquotas: { irpj: 15.0, adicionalIrpj: 10.0, csll: 9.0, ibs: 17.7, cbs: 8.8 },
      dataBase: now,
    },
    {
      pais: "Paraguai",
      regime: "iva_py",
      descricao: "IVA Paraguai — placeholder, requer confirmação de contador local (Cambyretá)",
      aliquotas: { iva: 10.0 },
      dataBase: now,
    },
  ]);

  // --- B. Custos Unitários (base SINAPI) — CostEngine (seção 2.4) ---
  // Valores marcados "SINAPI [código] — Residencial Mirante" vêm do
  // orçamento real de implantação de um condomínio fechado (PM, Formosa/GO,
  // base SINAPI GO, sem BDI — BDI é aplicado separadamente via
  // config_cost_parameters). Valores marcados "MV (loteamento)" vêm do
  // orçamento real de implantação de um loteamento aberto na mesma região,
  // que cobre itens que o condomínio fechado não tinha (poço com bombas e
  // reservatório, obra de conexão externa de energia). Valores sem
  // nenhuma dessas fontes continuam TODO(confirmar).
  const regiao = "Nacional";
  const unitCostRows: (typeof configUnitCosts.$inferInsert)[] = [
    // Terraplenagem
    { grupo: "terraplenagem", itemCodigo: "limpeza_destocamento", itemDescricao: "Limpeza e destocamento", unidade: "m2", valorUnitario: "0.30", regiao, dataBase: now, fonte: "SINAPI cotação — Residencial Mirante (Formosa/GO): raspagem e limpeza de vegetação" },
    { grupo: "terraplenagem", itemCodigo: "regularizacao", itemDescricao: "Regularização do terreno", unidade: "m2", valorUnitario: "1.16", regiao, dataBase: now, fonte: "SINAPI 100577 — Residencial Mirante: regularização/compactação de subleito" },
    { grupo: "terraplenagem", itemCodigo: "corte_aterro", itemDescricao: "Corte/aterro", unidade: "m3", valorUnitario: "2.03", regiao, dataBase: now, fonte: "SINAPI 101116 — Residencial Mirante: escavação horizontal em solo 1ª categoria (não inclui transporte a distância)" },
    { grupo: "terraplenagem", itemCodigo: "supressao_vegetal", itemDescricao: "Supressão vegetal", unidade: "m2", valorUnitario: "4.80", regiao, dataBase: now, fonte: "TODO(confirmar) — não presente no orçamento de referência" },
    // Drenagem
    { grupo: "drenagem", itemCodigo: "drenagem_galeria", itemDescricao: "Galeria de águas pluviais", unidade: "m", valorUnitario: "123.14", regiao, dataBase: now, fonte: "SINAPI 95568 — Residencial Mirante: tubo de concreto DN 400mm" },
    { grupo: "drenagem", itemCodigo: "drenagem_valeta", itemDescricao: "Valeta de drenagem", unidade: "m", valorUnitario: "85.00", regiao, dataBase: now, fonte: "TODO(confirmar) — não presente no orçamento de referência (usa apenas galeria)" },
    { grupo: "drenagem", itemCodigo: "bocas_de_lobo", itemDescricao: "Bocas de lobo", unidade: "un", valorUnitario: "1425.29", regiao, dataBase: now, fonte: "SINAPI 97956 — Residencial Mirante: caixa para boca de lobo" },
    { grupo: "drenagem", itemCodigo: "pvs_drenagem", itemDescricao: "Poços de visita de drenagem", unidade: "un", valorUnitario: "3838.20", regiao, dataBase: now, fonte: "SINAPI 99259+98114 — Residencial Mirante: base do PV (3133,61) + tampão de ferro fundido (704,59)" },
    { grupo: "drenagem", itemCodigo: "sarjeta_meio_fio", itemDescricao: "Sarjeta e meio-fio", unidade: "m", valorUnitario: "94.23", regiao, dataBase: now, fonte: "SINAPI 94273+94281 — Residencial Mirante: guia/meio-fio trecho reto (46,80) + sarjeta trecho reto (47,43)" },
    // Pavimentação e Calçadas
    { grupo: "pavimentacao", itemCodigo: "pavimentacao_base_padrao", itemDescricao: "Base do pavimento (padrão)", unidade: "m2", valorUnitario: "26.71", regiao, dataBase: now, fonte: "SINAPI 96396 — Residencial Mirante: base brita graduada R$178,04/m³ × 0,15m de espessura" },
    { grupo: "pavimentacao", itemCodigo: "pavimentacao_base_simplificada", itemDescricao: "Base do pavimento (simplificada)", unidade: "m2", valorUnitario: "28.00", regiao, dataBase: now, fonte: "TODO(confirmar) — orçamento de referência não distingue base simplificada" },
    { grupo: "pavimentacao", itemCodigo: "pavimentacao_capa_asfalto", itemDescricao: "Capa asfáltica (TSD/CBUQ)", unidade: "m2", valorUnitario: "59.60", regiao, dataBase: now, fonte: "SINAPI 95995+104375 — Residencial Mirante: CBUQ R$1436,29/m³ × 0,04m (57,45) + imprimação (2,15)" },
    { grupo: "pavimentacao", itemCodigo: "pavimentacao_capa_paver", itemDescricao: "Capa em paver intertravado", unidade: "m2", valorUnitario: "68.00", regiao, dataBase: now, fonte: "TODO(confirmar) — orçamento de referência usa apenas asfalto" },
    { grupo: "pavimentacao", itemCodigo: "calcadas", itemDescricao: "Calçadas", unidade: "m2", valorUnitario: "38.00", regiao, dataBase: now, fonte: "TODO(confirmar) — não presente no orçamento de referência" },
    // Água
    { grupo: "agua", itemCodigo: "rede_distribuicao_agua", itemDescricao: "Rede de distribuição de água", unidade: "m", valorUnitario: "52.16", regiao, dataBase: now, fonte: "SINAPI 89451 — Residencial Mirante: tubo PVC soldável DN 75mm" },
    { grupo: "agua", itemCodigo: "ligacao_domiciliar_agua", itemDescricao: "Ligação domiciliar de água", unidade: "un", valorUnitario: "650.00", regiao, dataBase: now, fonte: "TODO(confirmar) — não detalhado por lote no orçamento de referência" },
    { grupo: "agua", itemCodigo: "poco_tubular", itemDescricao: "Poço tubular profundo", unidade: "vb", valorUnitario: "351799.46", regiao, dataBase: now, fonte: "Cotação — MV (loteamento), Formosa/GO: execução de poço tubular profundo, com bombas e reservatório (item único)" },
    { grupo: "agua", itemCodigo: "reservatorio", itemDescricao: "Reservatório", unidade: "m3", valorUnitario: "2200.00", regiao, dataBase: now, fonte: "TODO(confirmar) — não presente no orçamento de referência" },
    { grupo: "agua", itemCodigo: "casa_de_bombas", itemDescricao: "Casa de bombas", unidade: "un", valorUnitario: "0.00", regiao, dataBase: now, fonte: "Incluído no item poço_tubular — MV (loteamento) cobra poço + bombas + reservatório como item único, para não contar o custo em dobro" },
    { grupo: "agua", itemCodigo: "interligacao_rede_agua", itemDescricao: "Interligação à rede pública de água", unidade: "vb", valorUnitario: "24876.36", regiao, dataBase: now, fonte: "SINAPI cotação — Residencial Mirante: válvula redutora de pressão + caixa em alvenaria" },
    // Esgoto — projeto de referência trata como verba única (R$1.057.658,00
    // por cotação, sem detalhamento por rede/PV/ligação); mantidos os
    // valores anteriores para os itens individuais.
    { grupo: "esgoto", itemCodigo: "rede_coletora_esgoto", itemDescricao: "Rede coletora de esgoto", unidade: "m", valorUnitario: "110.00", regiao, dataBase: now, fonte: "TODO(confirmar) — orçamento de referência trata esgoto como verba única" },
    { grupo: "esgoto", itemCodigo: "pvs_esgoto", itemDescricao: "Poços de visita de esgoto", unidade: "un", valorUnitario: "1900.00", regiao, dataBase: now, fonte: "TODO(confirmar) — orçamento de referência trata esgoto como verba única" },
    { grupo: "esgoto", itemCodigo: "ligacoes_esgoto", itemDescricao: "Ligações domiciliares de esgoto", unidade: "un", valorUnitario: "580.00", regiao, dataBase: now, fonte: "TODO(confirmar) — orçamento de referência trata esgoto como verba única" },
    { grupo: "esgoto", itemCodigo: "fossa_sumidouro", itemDescricao: "Fossa séptica + sumidouro", unidade: "un", valorUnitario: "4200.00", regiao, dataBase: now, fonte: "TODO(confirmar) — projeto de referência usa rede pública, não fossa" },
    { grupo: "esgoto", itemCodigo: "emissario", itemDescricao: "Emissário", unidade: "m", valorUnitario: "130.00", regiao, dataBase: now, fonte: "TODO(confirmar) — orçamento de referência trata esgoto como verba única" },
    { grupo: "esgoto", itemCodigo: "elevatoria_esgoto", itemDescricao: "Estação elevatória de esgoto", unidade: "vb", valorUnitario: "180000.00", regiao, dataBase: now, fonte: "TODO(confirmar) — orçamento de referência trata esgoto como verba única" },
    { grupo: "esgoto", itemCodigo: "ete_compacta", itemDescricao: "ETE compacta (por lote)", unidade: "un", valorUnitario: "3800.00", regiao, dataBase: now, fonte: "TODO(confirmar) — projeto de referência usa rede pública, não ETE própria" },
    // Energia
    { grupo: "energia", itemCodigo: "rede_aerea_energia", itemDescricao: "Rede aérea de energia", unidade: "m", valorUnitario: "64.97", regiao, dataBase: now, fonte: "SINAPI 101565 — Residencial Mirante: cabo de cobre flexível 70mm² para rede aérea BT" },
    { grupo: "energia", itemCodigo: "postes_energia", itemDescricao: "Postes de energia", unidade: "un", valorUnitario: "1078.23", regiao, dataBase: now, fonte: "SINAPI 100599+41196 — Residencial Mirante: assentamento (473,49) + poste concreto duplo T 9m (604,74)" },
    { grupo: "energia", itemCodigo: "transformadores", itemDescricao: "Transformadores", unidade: "un", valorUnitario: "15570.55", regiao, dataBase: now, fonte: "SINAPI 102104+102109 — Residencial Mirante: transformador 75kVA (15503,19) + suporte em poste (67,36)" },
    { grupo: "energia", itemCodigo: "iluminacao_publica", itemDescricao: "Iluminação pública", unidade: "un", valorUnitario: "1600.00", regiao, dataBase: now, fonte: "TODO(confirmar) — não detalhado separadamente no orçamento de referência" },
    { grupo: "energia", itemCodigo: "entrada_por_lote", itemDescricao: "Entrada de energia por lote", unidade: "un", valorUnitario: "480.00", regiao, dataBase: now, fonte: "TODO(confirmar) — não detalhado por lote no orçamento de referência" },
    { grupo: "energia", itemCodigo: "obra_conexao_externa_energia", itemDescricao: "Obra de conexão externa à rede", unidade: "vb", valorUnitario: "479748.75", regiao, dataBase: now, fonte: "Cotação — MV (loteamento), Formosa/GO: execução de obra de extensão da rede de conexão conforme exigência ENEL" },
    // Obras Civis — Condomínio Fechado
    { grupo: "obras_civis_condominio", itemCodigo: "muro_condominio", itemDescricao: "Muro de fechamento", unidade: "m", valorUnitario: "626.10", regiao, dataBase: now, fonte: "Cotação — Residencial Mirante: muro em bloco cerâmico rebocado e pintado" },
    { grupo: "obras_civis_condominio", itemCodigo: "portaria", itemDescricao: "Portaria", unidade: "un", valorUnitario: "788897.26", regiao, dataBase: now, fonte: "Cotação — Residencial Mirante: guarita/administração do condomínio, 451m² × R$1749,26/m²" },
    { grupo: "obras_civis_condominio", itemCodigo: "area_lazer", itemDescricao: "Área de lazer/clube", unidade: "vb", valorUnitario: "1827040.64", regiao, dataBase: now, fonte: "Cotação — Residencial Mirante: soma de quadra poliesportiva, quadra de areia, salão de festas, paisagismo, quadra de tênis, squash, mirante/wine bar, playground, quiosques, espaço pet, academia, área gourmet, fire place, praças e heliponto" },
    // Serviços Complementares
    { grupo: "servicos_complementares", itemCodigo: "sinalizacao_viaria", itemDescricao: "Sinalização viária", unidade: "m", valorUnitario: "12.00", regiao, dataBase: now, fonte: "TODO(confirmar) — orçamento de referência dá total do grupo (R$24.481,47), não unitário por m de via" },
    { grupo: "servicos_complementares", itemCodigo: "paisagismo", itemDescricao: "Paisagismo (área verde)", unidade: "m2", valorUnitario: "25.00", regiao, dataBase: now, fonte: "TODO(confirmar) — orçamento de referência dá verba única (R$215.478,00), não unitário por m²" },
    { grupo: "servicos_complementares", itemCodigo: "projetos_executivos", itemDescricao: "Projetos executivos", unidade: "vb", valorUnitario: "85000.00", regiao, dataBase: now, fonte: "TODO(confirmar) — orçamento de referência é de obra, não cobre projetos" },
    { grupo: "servicos_complementares", itemCodigo: "corte_arvores_isoladas", itemDescricao: "Corte de árvores isoladas", unidade: "un", valorUnitario: "350.00", regiao, dataBase: now, fonte: "TODO(confirmar) — não presente no orçamento de referência" },
    { grupo: "servicos_complementares", itemCodigo: "compensacao_arvores_isoladas", itemDescricao: "Compensação por árvore isolada", unidade: "un", valorUnitario: "600.00", regiao, dataBase: now, fonte: "TODO(confirmar) — não presente no orçamento de referência" },
  ];
  await db.insert(configUnitCosts).values(unitCostRows);

  console.log("[Seed] Módulo de Configuração populado com sucesso.");
  process.exit(0);
}

main().catch((err) => {
  console.error("[Seed] Falhou:", err);
  process.exit(1);
});
