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

  // --- B. Custos Unitários (base SINAPI) — CostEngine (seção 2.4) ---
  // TODO(confirmar): valores placeholder de referência de mercado — substituir
  // pela base SINAPI real (região/data-base) antes de usar em produção.
  const regiao = "Nacional";
  const unitCostRows: (typeof configUnitCosts.$inferInsert)[] = [
    // Terraplenagem
    { grupo: "terraplenagem", itemCodigo: "limpeza_destocamento", itemDescricao: "Limpeza e destocamento", unidade: "m2", valorUnitario: "3.20", regiao, dataBase: now },
    { grupo: "terraplenagem", itemCodigo: "regularizacao", itemDescricao: "Regularização do terreno", unidade: "m2", valorUnitario: "2.10", regiao, dataBase: now },
    { grupo: "terraplenagem", itemCodigo: "corte_aterro", itemDescricao: "Corte/aterro", unidade: "m3", valorUnitario: "18.50", regiao, dataBase: now },
    { grupo: "terraplenagem", itemCodigo: "supressao_vegetal", itemDescricao: "Supressão vegetal", unidade: "m2", valorUnitario: "4.80", regiao, dataBase: now },
    // Drenagem
    { grupo: "drenagem", itemCodigo: "drenagem_galeria", itemDescricao: "Galeria de águas pluviais", unidade: "m", valorUnitario: "320.00", regiao, dataBase: now },
    { grupo: "drenagem", itemCodigo: "drenagem_valeta", itemDescricao: "Valeta de drenagem", unidade: "m", valorUnitario: "85.00", regiao, dataBase: now },
    { grupo: "drenagem", itemCodigo: "bocas_de_lobo", itemDescricao: "Bocas de lobo", unidade: "un", valorUnitario: "1450.00", regiao, dataBase: now },
    { grupo: "drenagem", itemCodigo: "pvs_drenagem", itemDescricao: "Poços de visita de drenagem", unidade: "un", valorUnitario: "1800.00", regiao, dataBase: now },
    { grupo: "drenagem", itemCodigo: "sarjeta_meio_fio", itemDescricao: "Sarjeta e meio-fio", unidade: "m", valorUnitario: "65.00", regiao, dataBase: now },
    // Pavimentação e Calçadas
    { grupo: "pavimentacao", itemCodigo: "pavimentacao_base_padrao", itemDescricao: "Base do pavimento (padrão)", unidade: "m2", valorUnitario: "42.00", regiao, dataBase: now },
    { grupo: "pavimentacao", itemCodigo: "pavimentacao_base_simplificada", itemDescricao: "Base do pavimento (simplificada)", unidade: "m2", valorUnitario: "28.00", regiao, dataBase: now },
    { grupo: "pavimentacao", itemCodigo: "pavimentacao_capa_asfalto", itemDescricao: "Capa asfáltica (TSD/CBUQ)", unidade: "m2", valorUnitario: "55.00", regiao, dataBase: now },
    { grupo: "pavimentacao", itemCodigo: "pavimentacao_capa_paver", itemDescricao: "Capa em paver intertravado", unidade: "m2", valorUnitario: "68.00", regiao, dataBase: now },
    { grupo: "pavimentacao", itemCodigo: "calcadas", itemDescricao: "Calçadas", unidade: "m2", valorUnitario: "38.00", regiao, dataBase: now },
    // Água
    { grupo: "agua", itemCodigo: "rede_distribuicao_agua", itemDescricao: "Rede de distribuição de água", unidade: "m", valorUnitario: "95.00", regiao, dataBase: now },
    { grupo: "agua", itemCodigo: "ligacao_domiciliar_agua", itemDescricao: "Ligação domiciliar de água", unidade: "un", valorUnitario: "650.00", regiao, dataBase: now },
    { grupo: "agua", itemCodigo: "poco_tubular", itemDescricao: "Poço tubular profundo", unidade: "vb", valorUnitario: "45000.00", regiao, dataBase: now },
    { grupo: "agua", itemCodigo: "reservatorio", itemDescricao: "Reservatório", unidade: "m3", valorUnitario: "2200.00", regiao, dataBase: now },
    { grupo: "agua", itemCodigo: "casa_de_bombas", itemDescricao: "Casa de bombas", unidade: "un", valorUnitario: "18000.00", regiao, dataBase: now },
    { grupo: "agua", itemCodigo: "interligacao_rede_agua", itemDescricao: "Interligação à rede pública de água", unidade: "vb", valorUnitario: "35000.00", regiao, dataBase: now },
    // Esgoto
    { grupo: "esgoto", itemCodigo: "rede_coletora_esgoto", itemDescricao: "Rede coletora de esgoto", unidade: "m", valorUnitario: "110.00", regiao, dataBase: now },
    { grupo: "esgoto", itemCodigo: "pvs_esgoto", itemDescricao: "Poços de visita de esgoto", unidade: "un", valorUnitario: "1900.00", regiao, dataBase: now },
    { grupo: "esgoto", itemCodigo: "ligacoes_esgoto", itemDescricao: "Ligações domiciliares de esgoto", unidade: "un", valorUnitario: "580.00", regiao, dataBase: now },
    { grupo: "esgoto", itemCodigo: "fossa_sumidouro", itemDescricao: "Fossa séptica + sumidouro", unidade: "un", valorUnitario: "4200.00", regiao, dataBase: now },
    { grupo: "esgoto", itemCodigo: "emissario", itemDescricao: "Emissário", unidade: "m", valorUnitario: "130.00", regiao, dataBase: now },
    { grupo: "esgoto", itemCodigo: "elevatoria_esgoto", itemDescricao: "Estação elevatória de esgoto", unidade: "vb", valorUnitario: "180000.00", regiao, dataBase: now },
    { grupo: "esgoto", itemCodigo: "ete_compacta", itemDescricao: "ETE compacta (por lote)", unidade: "un", valorUnitario: "3800.00", regiao, dataBase: now },
    // Energia
    { grupo: "energia", itemCodigo: "rede_aerea_energia", itemDescricao: "Rede aérea de energia", unidade: "m", valorUnitario: "78.00", regiao, dataBase: now },
    { grupo: "energia", itemCodigo: "postes_energia", itemDescricao: "Postes de energia", unidade: "un", valorUnitario: "2100.00", regiao, dataBase: now },
    { grupo: "energia", itemCodigo: "transformadores", itemDescricao: "Transformadores", unidade: "un", valorUnitario: "22000.00", regiao, dataBase: now },
    { grupo: "energia", itemCodigo: "iluminacao_publica", itemDescricao: "Iluminação pública", unidade: "un", valorUnitario: "1600.00", regiao, dataBase: now },
    { grupo: "energia", itemCodigo: "entrada_por_lote", itemDescricao: "Entrada de energia por lote", unidade: "un", valorUnitario: "480.00", regiao, dataBase: now },
    { grupo: "energia", itemCodigo: "obra_conexao_externa_energia", itemDescricao: "Obra de conexão externa à rede", unidade: "vb", valorUnitario: "120000.00", regiao, dataBase: now },
    // Obras Civis — Condomínio Fechado
    { grupo: "obras_civis_condominio", itemCodigo: "muro_condominio", itemDescricao: "Muro de fechamento", unidade: "m", valorUnitario: "310.00", regiao, dataBase: now },
    { grupo: "obras_civis_condominio", itemCodigo: "portaria", itemDescricao: "Portaria", unidade: "un", valorUnitario: "95000.00", regiao, dataBase: now },
    { grupo: "obras_civis_condominio", itemCodigo: "area_lazer", itemDescricao: "Área de lazer/clube", unidade: "vb", valorUnitario: "350000.00", regiao, dataBase: now },
    // Serviços Complementares
    { grupo: "servicos_complementares", itemCodigo: "sinalizacao_viaria", itemDescricao: "Sinalização viária", unidade: "m", valorUnitario: "12.00", regiao, dataBase: now },
    { grupo: "servicos_complementares", itemCodigo: "paisagismo", itemDescricao: "Paisagismo (área verde)", unidade: "m2", valorUnitario: "25.00", regiao, dataBase: now },
    { grupo: "servicos_complementares", itemCodigo: "projetos_executivos", itemDescricao: "Projetos executivos", unidade: "vb", valorUnitario: "85000.00", regiao, dataBase: now },
    { grupo: "servicos_complementares", itemCodigo: "corte_arvores_isoladas", itemDescricao: "Corte de árvores isoladas", unidade: "un", valorUnitario: "350.00", regiao, dataBase: now },
    { grupo: "servicos_complementares", itemCodigo: "compensacao_arvores_isoladas", itemDescricao: "Compensação por árvore isolada", unidade: "un", valorUnitario: "600.00", regiao, dataBase: now },
  ];
  await db.insert(configUnitCosts).values(unitCostRows);

  console.log("[Seed] Módulo de Configuração populado com sucesso.");
  process.exit(0);
}

main().catch((err) => {
  console.error("[Seed] Falhou:", err);
  process.exit(1);
});
