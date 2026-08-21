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
  tir: decimal("tir", { precision: 8, scale: 4 }), // Taxa Interna de Retorno (%)
  roi: decimal("roi", { precision: 8, scale: 4 }), // Retorno sobre Investimento (%)
  payback: decimal("payback", { precision: 8, scale: 2 }), // Payback (meses)
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
