import { int, mysqlEnum, mysqlTable, text, timestamp, varchar, decimal, json, boolean } from "drizzle-orm/mysql-core";

/**
 * Core user table backing auth flow.
 * Extend this file with additional tables as your product grows.
 * Columns use camelCase to match both database fields and generated types.
 */
export const users = mysqlTable("users", {
  /**
   * Surrogate primary key. Auto-incremented numeric value managed by the database.
   * Use this for relations between tables.
   */
  id: int("id").autoincrement().primaryKey(),
  /** Manus OAuth identifier (openId) returned from the OAuth callback. Unique per user. */
  openId: varchar("openId", { length: 64 }).notNull().unique(),
  name: text("name"),
  email: varchar("email", { length: 320 }),
  loginMethod: varchar("loginMethod", { length: 64 }),
  role: mysqlEnum("role", ["user", "admin"]).default("user").notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
  lastSignedIn: timestamp("lastSignedIn").defaultNow().notNull(),
});

export type User = typeof users.$inferSelect;
export type InsertUser = typeof users.$inferInsert;

/**
 * Projects (Empreendimentos) - Cadastro de loteamentos, condomínios e incorporações
 */
export const projects = mysqlTable("projects", {
  id: int("id").autoincrement().primaryKey(),
  userId: int("userId").notNull(), // Foreign key to users
  name: varchar("name", { length: 255 }).notNull(), // Nome do empreendimento
  description: text("description"), // Descrição
  type: mysqlEnum("type", ["loteamento", "condominio", "incorporacao"]).notNull(), // Tipo de empreendimento
  location: varchar("location", { length: 255 }), // Localização
  status: mysqlEnum("status", ["rascunho", "em_analise", "finalizado", "arquivado"]).default("rascunho").notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

export type Project = typeof projects.$inferSelect;
export type InsertProject = typeof projects.$inferInsert;

/**
 * GeoEngine Data - Dados Urbanísticos (Lei 6.766/79)
 */
export const geoEngineData = mysqlTable("geo_engine_data", {
  id: int("id").autoincrement().primaryKey(),
  projectId: int("projectId").notNull(), // Foreign key to projects
  areaBruta: decimal("areaBruta", { precision: 12, scale: 2 }), // Área bruta total (m²)
  areaLiquida: decimal("areaLiquida", { precision: 12, scale: 2 }), // Área líquida (m²)
  areaVendavel: decimal("areaVendavel", { precision: 12, scale: 2 }), // Área vendável (m²)
  areaInstitucional: decimal("areaInstitucional", { precision: 12, scale: 2 }), // Área institucional (m²)
  areaVerde: decimal("areaVerde", { precision: 12, scale: 2 }), // Área verde (m²)
  areaAPP: decimal("areaAPP", { precision: 12, scale: 2 }), // Área de Preservação Permanente (m²)
  sistemaViario: decimal("sistemaViario", { precision: 12, scale: 2 }), // Sistema viário (m²)
  eficienciaUrbanistica: decimal("eficienciaUrbanistica", { precision: 5, scale: 2 }), // Eficiência urbanística (%)
  numeroLotes: int("numeroLotes"), // Número estimado de lotes
  potencialConstrutivo: decimal("potencialConstrutivo", { precision: 12, scale: 2 }), // Potencial construtivo (m²)
  densidade: decimal("densidade", { precision: 8, scale: 2 }), // Densidade (hab/ha)
  indicesUrbanisticos: json("indicesUrbanisticos"), // JSON com índices urbanísticos
  checklistGRAProhab: json("checklistGRAProhab"), // JSON com checklist GRAPROHAB
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

export type GeoEngineData = typeof geoEngineData.$inferSelect;
export type InsertGeoEngineData = typeof geoEngineData.$inferInsert;

/**
 * CostEngine Data - Dados de Engenharia de Custos
 */
export const costEngineData = mysqlTable("cost_engine_data", {
  id: int("id").autoincrement().primaryKey(),
  projectId: int("projectId").notNull(), // Foreign key to projects
  terraplanagem: decimal("terraplanagem", { precision: 12, scale: 2 }), // Custo de terraplanagem (R$)
  drenagem: decimal("drenagem", { precision: 12, scale: 2 }), // Custo de drenagem (R$)
  pavimentacao: decimal("pavimentacao", { precision: 12, scale: 2 }), // Custo de pavimentação (R$)
  agua: decimal("agua", { precision: 12, scale: 2 }), // Custo de rede de água (R$)
  esgoto: decimal("esgoto", { precision: 12, scale: 2 }), // Custo de rede de esgoto (R$)
  energia: decimal("energia", { precision: 12, scale: 2 }), // Custo de energia (R$)
  paisagismo: decimal("paisagismo", { precision: 12, scale: 2 }), // Custo de paisagismo (R$)
  portaria: decimal("portaria", { precision: 12, scale: 2 }), // Custo de portaria (R$)
  areaLazer: decimal("areaLazer", { precision: 12, scale: 2 }), // Custo de área de lazer (R$)
  licenciamento: decimal("licenciamento", { precision: 12, scale: 2 }), // Custo de licenciamento (R$)
  registro: decimal("registro", { precision: 12, scale: 2 }), // Custo de registro (R$)
  cartorio: decimal("cartorio", { precision: 12, scale: 2 }), // Custo de cartório (R$)
  custosIndiretos: decimal("custosIndiretos", { precision: 12, scale: 2 }), // Custos indiretos (BDI) (R$)
  contingencias: decimal("contingencias", { precision: 12, scale: 2 }), // Contingências (R$)
  investimentoTotal: decimal("investimentoTotal", { precision: 12, scale: 2 }), // Investimento total (R$)
  valorPorHectare: decimal("valorPorHectare", { precision: 12, scale: 2 }), // Valor por hectare (R$/ha)
  valorPorM2: decimal("valorPorM2", { precision: 12, scale: 2 }), // Valor por m² (R$/m²)
  valorPorLote: decimal("valorPorLote", { precision: 12, scale: 2 }), // Valor por lote (R$)
  cronogramaFisico: json("cronogramaFisico"), // JSON com cronograma físico
  detalhamentoItens: json("detalhamentoItens"), // JSON com o detalhamento item a item do CostEngine (CostItem[])
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

export type CostEngineData = typeof costEngineData.$inferSelect;
export type InsertCostEngineData = typeof costEngineData.$inferInsert;

/**
 * SalesEngine Data - Dados Comerciais (VGV, Curva de Vendas, Financiamento)
 */
export const salesEngineData = mysqlTable("sales_engine_data", {
  id: int("id").autoincrement().primaryKey(),
  projectId: int("projectId").notNull(), // Foreign key to projects
  vgv: decimal("vgv", { precision: 15, scale: 2 }), // Valor Geral de Vendas (R$)
  precoMedioM2: decimal("precoMedioM2", { precision: 12, scale: 2 }), // Preço médio por m² (R$/m²)
  curvaVendas: json("curvaVendas"), // JSON com curva de vendas (velocidade mensal)
  tabelasFinanciamento: json("tabelasFinanciamento"), // JSON com tabelas de financiamento (entrada, parcelas, balões, indexadores)
  inadimplencia: decimal("inadimplencia", { precision: 5, scale: 2 }), // Taxa de inadimplência (%)
  custoVendas: decimal("custoVendas", { precision: 12, scale: 2 }), // Custos de vendas (comissão, marketing) (R$)
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

export type SalesEngineData = typeof salesEngineData.$inferSelect;
export type InsertSalesEngineData = typeof salesEngineData.$inferInsert;

/**
 * FinanceEngine Data - Dados Financeiros (FCD, VPL, TIR, ROI, Payback)
 */
export const financeEngineData = mysqlTable("finance_engine_data", {
  id: int("id").autoincrement().primaryKey(),
  projectId: int("projectId").notNull(), // Foreign key to projects
  vpl: decimal("vpl", { precision: 15, scale: 2 }), // Valor Presente Líquido (R$)
  tir: decimal("tir", { precision: 8, scale: 4 }), // Taxa Interna de Retorno a.a. (%)
  tirMensal: decimal("tirMensal", { precision: 8, scale: 4 }), // Taxa Interna de Retorno a.m. (%)
  tirIndisponivelMotivo: varchar("tirIndisponivelMotivo", { length: 500 }), // por que a TIR não pôde ser calculada (projeto não se paga / obra autofinanciada / sem raiz real)
  roi: decimal("roi", { precision: 8, scale: 4 }), // Retorno sobre Investimento (%)
  payback: decimal("payback", { precision: 8, scale: 2 }), // Payback (meses) — null = não paga dentro do horizonte
  alertasConsistencia: json("alertasConsistencia"), // JSON com alertas de consistência (spec seção 2.8)
  exposicaoMaximaCaixa: decimal("exposicaoMaximaCaixa", { precision: 15, scale: 2 }), // Exposição máxima de caixa (R$)
  lucroTotal: decimal("lucroTotal", { precision: 15, scale: 2 }), // Lucro total (R$)
  margemLucro: decimal("margemLucro", { precision: 8, scale: 4 }), // Margem de lucro (%)
  capitalProprio: decimal("capitalProprio", { precision: 15, scale: 2 }), // Capital próprio necessário (R$)
  capitalNecessario: decimal("capitalNecessario", { precision: 15, scale: 2 }), // Capital total necessário (R$)
  lucroLote: decimal("lucroLote", { precision: 12, scale: 2 }), // Lucro por lote (R$)
  precoMinimoLote: decimal("precoMinimoLote", { precision: 12, scale: 2 }), // Preço mínimo do lote (R$)
  precoRecomendado: decimal("precoRecomendado", { precision: 12, scale: 2 }), // Preço recomendado (R$)
  tmaUtilizada: decimal("tmaUtilizada", { precision: 8, scale: 4 }), // Taxa Mínima de Atratividade utilizada (%)
  fluxoCaixaMensal: json("fluxoCaixaMensal"), // JSON com fluxo de caixa mensal detalhado
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

export type FinanceEngineData = typeof financeEngineData.$inferSelect;
export type InsertFinanceEngineData = typeof financeEngineData.$inferInsert;

/**
 * TaxEngine Data - Dados Tributários (RET, Lucro Presumido, IBS/CBS)
 */
export const taxEngineData = mysqlTable("tax_engine_data", {
  id: int("id").autoincrement().primaryKey(),
  projectId: int("projectId").notNull(), // Foreign key to projects
  regimeTributario: mysqlEnum("regimeTributario", ["ret", "lucro_presumido", "lucro_real"]).notNull(), // Regime tributário
  aliquotaIBS: decimal("aliquotaIBS", { precision: 8, scale: 4 }), // Alíquota IBS (%)
  aliquotaCBS: decimal("aliquotaCBS", { precision: 8, scale: 4 }), // Alíquota CBS (%)
  aliquotaIRPJ: decimal("aliquotaIRPJ", { precision: 8, scale: 4 }), // Alíquota IRPJ (%)
  aliquotaCSLL: decimal("aliquotaCSLL", { precision: 8, scale: 4 }), // Alíquota CSLL (%)
  aliquotaPIS: decimal("aliquotaPIS", { precision: 8, scale: 4 }), // Alíquota PIS (%)
  aliquotaCOFINS: decimal("aliquotaCOFINS", { precision: 8, scale: 4 }), // Alíquota COFINS (%)
  redutorSocial: decimal("redutorSocial", { precision: 15, scale: 2 }), // Redutor social (R$)
  patrimonioAfetacao: boolean("patrimonioAfetacao").default(false), // Utiliza patrimônio de afetação?
  impostosTotais: decimal("impostosTotais", { precision: 15, scale: 2 }), // Impostos totais (R$)
  impactoReforma: json("impactoReforma"), // JSON com impacto da reforma tributária (comparativo)
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

export type TaxEngineData = typeof taxEngineData.$inferSelect;
export type InsertTaxEngineData = typeof taxEngineData.$inferInsert;

/**
 * Scenarios - Cenários de Simulação (Otimista, Realista, Pessimista)
 */
export const scenarios = mysqlTable("scenarios", {
  id: int("id").autoincrement().primaryKey(),
  projectId: int("projectId").notNull(), // Foreign key to projects
  nome: varchar("nome", { length: 255 }).notNull(), // Nome do cenário (ex: Otimista, Realista, Pessimista)
  tipo: mysqlEnum("tipo", ["otimista", "realista", "pessimista", "customizado"]).notNull(),
  descricao: text("descricao"), // Descrição do cenário
  variacaoVGV: decimal("variacaoVGV", { precision: 8, scale: 4 }), // Variação de VGV (%)
  variacaoCustos: decimal("variacaoCustos", { precision: 8, scale: 4 }), // Variação de custos (%)
  variacaoTaxa: decimal("variacaoTaxa", { precision: 8, scale: 4 }), // Variação de taxa de juros (%)
  resultados: json("resultados"), // JSON com resultados (VPL, TIR, ROI, etc.)
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

export type Scenario = typeof scenarios.$inferSelect;
export type InsertScenario = typeof scenarios.$inferInsert;

// ============================================================================
// MÓDULO DE CONFIGURAÇÃO (camada administrativa global — spec seção 5)
//
// Nenhuma variável de referência vive dentro de um Estudo. Todo Estudo LÊ
// destas tabelas; a gravação/edição é restrita a administradores. Cada
// cálculo de Estudo grava um snapshot (ver `configSnapshots`) dos valores
// efetivamente usados, para auditabilidade (seção 5.3).
// ============================================================================

/**
 * A. Biblioteca de Legislação Municipal/Regional (seção 5.1-A)
 * Uma entrada por município (ou país, no caso do Paraguai). Se o projeto
 * estiver em local não cadastrado, o sistema cai no piso federal
 * (Lei 6.766/79) com alerta explícito de "não verificado localmente".
 */
export const configLegislation = mysqlTable("config_legislation", {
  id: int("id").autoincrement().primaryKey(),
  municipio: varchar("municipio", { length: 255 }).notNull(), // ou nome do país, ex: "Paraguai"
  uf: varchar("uf", { length: 8 }), // null para jurisdições fora do Brasil
  pais: varchar("pais", { length: 100 }).default("Brasil").notNull(),
  percentualAreaVerdeMin: decimal("percentualAreaVerdeMin", { precision: 5, scale: 2 }), // piso local (pode ser > 15% federal)
  percentualAreaInstitucionalMin: decimal("percentualAreaInstitucionalMin", { precision: 5, scale: 2 }),
  percentualSistemaViarioMin: decimal("percentualSistemaViarioMin", { precision: 5, scale: 2 }),
  areaMinimaLote: decimal("areaMinimaLote", { precision: 10, scale: 2 }), // m², piso federal = 125
  frenteMinimaLote: decimal("frenteMinimaLote", { precision: 8, scale: 2 }), // m, piso federal = 5
  faixaNonAedificandi: decimal("faixaNonAedificandi", { precision: 8, scale: 2 }), // m, piso federal = 15
  prazoExecucaoObrasMeses: int("prazoExecucaoObrasMeses"), // piso federal = 48 (prorrogável +48)
  regrasArborizacao: json("regrasArborizacao"), // JSON: autorização por árvore, proporção de compensação
  fonte: text("fonte"), // link do plano diretor / lei
  dataUltimaVerificacao: timestamp("dataUltimaVerificacao"),
  isFederalFallback: boolean("isFederalFallback").default(false).notNull(), // true = linha "piso federal" usada quando município não cadastrado
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

export type ConfigLegislation = typeof configLegislation.$inferSelect;
export type InsertConfigLegislation = typeof configLegislation.$inferInsert;

/**
 * B. Biblioteca de Custos Unitários (base SINAPI/regional) — seção 5.1-B
 * Versionado: nunca faz UPDATE de valor, sempre INSERT de nova versão.
 * O valor "vigente" é o de maior `dataBase` para o mesmo (grupo, itemCodigo, regiao).
 */
export const configUnitCosts = mysqlTable("config_unit_costs", {
  id: int("id").autoincrement().primaryKey(),
  grupo: mysqlEnum("grupo", [
    "terraplenagem",
    "drenagem",
    "pavimentacao",
    "agua",
    "esgoto",
    "energia",
    "obras_civis_condominio",
    "servicos_complementares",
  ]).notNull(),
  itemCodigo: varchar("itemCodigo", { length: 64 }).notNull(), // chave estável do item (ex: "rede_distribuicao_agua")
  itemDescricao: varchar("itemDescricao", { length: 255 }).notNull(),
  unidade: varchar("unidade", { length: 16 }).notNull(), // m2, m, un, m3, vb
  valorUnitario: decimal("valorUnitario", { precision: 14, scale: 4 }).notNull(),
  regiao: varchar("regiao", { length: 100 }).notNull(), // estado/região de referência do preço
  dataBase: timestamp("dataBase").notNull(), // data-base do preço (ex: referência SINAPI do mês)
  fonte: varchar("fonte", { length: 255 }), // ex: "SINAPI 08/2026 - GO não desonerado"
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});

export type ConfigUnitCost = typeof configUnitCosts.$inferSelect;
export type InsertConfigUnitCost = typeof configUnitCosts.$inferInsert;

/**
 * BDI e outros parâmetros globais do CostEngine — parametrizável, não fixo em 25%.
 * Mesma lógica de versionamento por dataBase que configUnitCosts.
 */
export const configCostParameters = mysqlTable("config_cost_parameters", {
  id: int("id").autoincrement().primaryKey(),
  chave: varchar("chave", { length: 64 }).notNull(), // ex: "bdi_infraestrutura"
  valor: decimal("valor", { precision: 8, scale: 4 }).notNull(), // percentual ou fator
  regiao: varchar("regiao", { length: 100 }).default("Nacional").notNull(),
  dataBase: timestamp("dataBase").notNull(),
  fonte: varchar("fonte", { length: 255 }),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});

export type ConfigCostParameter = typeof configCostParameters.$inferSelect;
export type InsertConfigCostParameter = typeof configCostParameters.$inferInsert;

/**
 * C. Índices Financeiros (seção 5.1-C): INCC, IPCA, taxa de câmbio.
 * `origem` distingue atualização automática (API do Bacen/IBGE) de override manual.
 */
export const configFinancialIndices = mysqlTable("config_financial_indices", {
  id: int("id").autoincrement().primaryKey(),
  indice: mysqlEnum("indice", ["incc", "ipca", "cambio_usd", "cambio_gs"]).notNull(),
  valor: decimal("valor", { precision: 12, scale: 6 }).notNull(), // % a.a. para índices; cotação para câmbio
  dataReferencia: timestamp("dataReferencia").notNull(),
  origem: mysqlEnum("origem", ["automatico", "manual"]).default("manual").notNull(),
  fonte: varchar("fonte", { length: 255 }),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});

export type ConfigFinancialIndex = typeof configFinancialIndices.$inferSelect;
export type InsertConfigFinancialIndex = typeof configFinancialIndices.$inferInsert;

/**
 * D. Matriz de Tipologia (seção 5.1-D): preço base R$/m² por tipologia,
 * velocidade de absorção padrão, flags de muro/portaria/lazer.
 */
export const configTypologyMatrix = mysqlTable("config_typology_matrix", {
  id: int("id").autoincrement().primaryKey(),
  tipologia: mysqlEnum("tipologia", [
    "loteamento_popular",
    "loteamento_aberto",
    "condominio_fechado",
    "condominio_chacaras",
  ]).notNull(),
  precoBaseM2: decimal("precoBaseM2", { precision: 12, scale: 2 }).notNull(),
  velocidadeAbsorcaoPadrao: decimal("velocidadeAbsorcaoPadrao", { precision: 8, scale: 2 }), // lotes/mês
  temMuro: boolean("temMuro").default(false).notNull(),
  temPortaria: boolean("temPortaria").default(false).notNull(),
  temAreaLazer: boolean("temAreaLazer").default(false).notNull(),
  regiao: varchar("regiao", { length: 100 }).default("Nacional").notNull(),
  dataBase: timestamp("dataBase").notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});

export type ConfigTypologyMatrix = typeof configTypologyMatrix.$inferSelect;
export type InsertConfigTypologyMatrix = typeof configTypologyMatrix.$inferInsert;

/**
 * E. Prazos Padrão (seção 5.1-E): prazo de obra por faixa de porte da gleba,
 * e prazo de aprovação (base + adicionais condicionais).
 */
export const configStandardTimelines = mysqlTable("config_standard_timelines", {
  id: int("id").autoincrement().primaryKey(),
  tipo: mysqlEnum("tipo", ["prazo_obra_por_porte", "prazo_aprovacao_base", "prazo_aprovacao_adicional"]).notNull(),
  // Para prazo_obra_por_porte: faixa de área da gleba (m²) que este prazo cobre
  faixaPorteMin: decimal("faixaPorteMin", { precision: 12, scale: 2 }),
  faixaPorteMax: decimal("faixaPorteMax", { precision: 12, scale: 2 }),
  // Para prazo_aprovacao_adicional: gatilho que soma meses ao prazo base
  // (ex: "ete_propria" +6, "supressao_vegetal" +6, "condominio_fechado" +3)
  gatilho: varchar("gatilho", { length: 64 }),
  prazoMeses: int("prazoMeses").notNull(),
  regiao: varchar("regiao", { length: 100 }).default("Nacional").notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});

export type ConfigStandardTimeline = typeof configStandardTimelines.$inferSelect;
export type InsertConfigStandardTimeline = typeof configStandardTimelines.$inferInsert;

/**
 * F. Regimes Tributários por Jurisdição (seção 5.1-F).
 * `pais` permite suportar Brasil e Paraguai (Cambyretá) sem hardcode.
 */
export const configTaxRegimes = mysqlTable("config_tax_regimes", {
  id: int("id").autoincrement().primaryKey(),
  pais: varchar("pais", { length: 100 }).notNull(),
  regime: varchar("regime", { length: 64 }).notNull(), // ex: "ret", "lucro_presumido", "lucro_real", "iva_py"
  descricao: varchar("descricao", { length: 255 }),
  aliquotas: json("aliquotas").notNull(), // JSON flexível: { irpj, csll, pis, cofins, ibs, cbs, iva, ... }
  ativo: boolean("ativo").default(true).notNull(),
  dataBase: timestamp("dataBase").notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});

export type ConfigTaxRegime = typeof configTaxRegimes.$inferSelect;
export type InsertConfigTaxRegime = typeof configTaxRegimes.$inferInsert;

/**
 * Snapshot de Configuração por Estudo (seção 5.3) — CRÍTICO PARA AUDITABILIDADE.
 * Cada vez que um motor de cálculo roda para um projeto, grava-se uma cópia
 * imutável dos valores de configuração efetivamente usados. Estudos antigos
 * NUNCA mudam de resultado por causa de uma atualização posterior na
 * Configuração global — só um recálculo explícito ("recalcular com valores
 * atuais") gera um novo snapshot.
 */
export const configSnapshots = mysqlTable("config_snapshots", {
  id: int("id").autoincrement().primaryKey(),
  projectId: int("projectId").notNull(), // Foreign key to projects
  engine: mysqlEnum("engine", ["geo_engine", "cost_engine", "sales_engine", "finance_engine", "tax_engine", "full"]).notNull(),
  snapshotData: json("snapshotData").notNull(), // cópia completa dos valores de configuração usados neste cálculo
  overrides: json("overrides"), // overrides pontuais feitos neste estudo específico (ex: "BDI 22% em vez de 25%")
  calculatedAt: timestamp("calculatedAt").defaultNow().notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});

export type ConfigSnapshot = typeof configSnapshots.$inferSelect;
export type InsertConfigSnapshot = typeof configSnapshots.$inferInsert;
