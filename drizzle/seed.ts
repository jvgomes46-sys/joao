import "dotenv/config";
import { getDb } from "../server/db";
import {
  configCostParameters,
  configFinancialIndices,
  configLegislation,
  configStandardTimelines,
  configTaxRegimes,
  configTypologyMatrix,
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
  await db.insert(configCostParameters).values({
    chave: "bdi_infraestrutura",
    valor: "25.0000",
    regiao: "Nacional",
    dataBase: now,
    fonte: "Padrão de mercado para infraestrutura de loteamento (spec seção 2.4)",
  });

  // --- D. Matriz de Tipologia ---
  // TODO(confirmar): precoBaseM2 e velocidadeAbsorcaoPadrao são placeholders —
  // substituir pelos valores reais da aba "Tabelas" da planilha mestre.
  const typologyRows: (typeof configTypologyMatrix.$inferInsert)[] = [
    { tipologia: "loteamento_popular", precoBaseM2: "180.00", velocidadeAbsorcaoPadrao: "8.00", temMuro: false, temPortaria: false, temAreaLazer: false, regiao: "Nacional", dataBase: now },
    { tipologia: "loteamento_aberto", precoBaseM2: "280.00", velocidadeAbsorcaoPadrao: "5.00", temMuro: false, temPortaria: false, temAreaLazer: false, regiao: "Nacional", dataBase: now },
    { tipologia: "condominio_fechado", precoBaseM2: "420.00", velocidadeAbsorcaoPadrao: "4.00", temMuro: true, temPortaria: true, temAreaLazer: true, regiao: "Nacional", dataBase: now },
    { tipologia: "condominio_chacaras", precoBaseM2: "150.00", velocidadeAbsorcaoPadrao: "2.50", temMuro: true, temPortaria: true, temAreaLazer: false, regiao: "Nacional", dataBase: now },
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

  console.log("[Seed] Módulo de Configuração populado com sucesso.");
  process.exit(0);
}

main().catch((err) => {
  console.error("[Seed] Falhou:", err);
  process.exit(1);
});
