// A biblioteca xlsx é CJS; a interop com ESM não expõe métodos estáticos
// de forma confiável via `import * as`, então importamos o pacote inteiro
// e desestruturamos.
import xlsxPkg from "xlsx";
import { getDb } from "../db";
import { configUnitCosts } from "../../drizzle/schema";

const { readFile, utils: xlsxUtils } = xlsxPkg;

/**
 * Importa custos unitários da base oficial SINAPI (Caixa Econômica Federal,
 * https://www.caixa.gov.br/site/Paginas/downloads.aspx#categoria_888) para
 * o Módulo de Configuração, mantendo os preços do CostEngine sempre
 * atualizados sem digitação manual.
 *
 * Fonte esperada: a planilha "SINAPI_Referência_AAAA_MM.xlsx" (uma das 4
 * dentro do .zip mensal da Caixa), aba "CSD" (Composições Sintéticas —
 * Sem Desoneração).
 *
 * Detalhe importante do arquivo oficial: a coluna "Código da Composição"
 * é uma fórmula HYPERLINK cujo valor cacheado costuma vir zerado (a
 * planilha usa fórmulas de array do Excel 365 que este ambiente não
 * recalcula). O código real está embutido como o ÚLTIMO ARGUMENTO
 * LITERAL da própria fórmula — ex.:
 *   =HYPERLINK("#"&CELL(...),104658)
 * então extraímos o código com regex sobre o texto da fórmula, não sobre
 * o valor calculado.
 */

const UF_COLUNA_CUSTO: Record<string, number> = {
  AC: 4, AL: 6, AM: 8, AP: 10, BA: 12, CE: 14, DF: 16, ES: 18, GO: 20,
  MA: 22, MG: 24, MS: 26, MT: 28, PA: 30, PB: 32, PE: 34, PI: 36, PR: 38,
  RJ: 40, RN: 42, RO: 44, RR: 46, RS: 48, SC: 50, SE: 52, SP: 54, TO: 56,
};

/**
 * Mapa de código SINAPI (ou soma de códigos, quando um item do CostEngine
 * combina mais de uma composição SINAPI) para itemCodigo do CostEngine.
 * `multiplicador` converte unidade quando necessário (ex.: custo SINAPI é
 * R$/m³ mas o item do CostEngine é R$/m² — multiplicador = espessura em m).
 */
interface SinapiMapEntry {
  itemCodigo: string;
  grupo: (typeof configUnitCosts.$inferInsert)["grupo"];
  unidade: string;
  componentes: { codigo: number; multiplicador?: number }[];
}

export const SINAPI_ITEM_MAP: SinapiMapEntry[] = [
  { itemCodigo: "regularizacao", grupo: "terraplenagem", unidade: "m2", componentes: [{ codigo: 100577 }] },
  { itemCodigo: "corte_aterro", grupo: "terraplenagem", unidade: "m3", componentes: [{ codigo: 101116 }] },
  { itemCodigo: "drenagem_galeria", grupo: "drenagem", unidade: "m", componentes: [{ codigo: 95568 }] },
  { itemCodigo: "bocas_de_lobo", grupo: "drenagem", unidade: "un", componentes: [{ codigo: 97956 }] },
  { itemCodigo: "pvs_drenagem", grupo: "drenagem", unidade: "un", componentes: [{ codigo: 99259 }, { codigo: 98114 }] },
  { itemCodigo: "sarjeta_meio_fio", grupo: "drenagem", unidade: "m", componentes: [{ codigo: 94273 }, { codigo: 94281 }] },
  // Base de pavimento: SINAPI 96396 é R$/m³ de brita graduada — convertido
  // para R$/m² assumindo espessura padrão de 0,15 m (mesma referência usada
  // no orçamento Residencial Mirante).
  { itemCodigo: "pavimentacao_base_padrao", grupo: "pavimentacao", unidade: "m2", componentes: [{ codigo: 96396, multiplicador: 0.15 }] },
  // Capa asfáltica: SINAPI 95995 (CBUQ) é R$/m³, convertido para R$/m² com
  // espessura padrão 0,04 m; SINAPI 104375 (imprimação) já é R$/m².
  {
    itemCodigo: "pavimentacao_capa_asfalto",
    grupo: "pavimentacao",
    unidade: "m2",
    componentes: [
      { codigo: 95995, multiplicador: 0.04 },
      { codigo: 104375 },
    ],
  },
  { itemCodigo: "rede_distribuicao_agua", grupo: "agua", unidade: "m", componentes: [{ codigo: 89451 }] },
  { itemCodigo: "rede_aerea_energia", grupo: "energia", unidade: "m", componentes: [{ codigo: 101565 }] },
  { itemCodigo: "postes_energia", grupo: "energia", unidade: "un", componentes: [{ codigo: 100599 }, { codigo: 41196 }] },
  { itemCodigo: "transformadores", grupo: "energia", unidade: "un", componentes: [{ codigo: 102104 }, { codigo: 102109 }] },
];

export interface SinapiComposicao {
  codigo: number;
  descricao: string;
  unidade: string;
  custo: number; // sem BDI, sem desoneração
}

/** Extrai o código real de dentro da fórmula HYPERLINK (não confiar no valor cacheado). */
function extrairCodigoDaFormula(formula: string | undefined): number | null {
  if (!formula) return null;
  const match = formula.match(/,\s*(\d+)\s*\)\s*$/);
  return match ? Number(match[1]) : null;
}

/**
 * Faz o parse da aba CSD do arquivo SINAPI_Referência_AAAA_MM.xlsx oficial,
 * retornando um mapa código -> composição para a UF pedida.
 */
export function parseSinapiReferencia(filePath: string, uf: string): { mesReferencia: string; composicoes: Map<number, SinapiComposicao> } {
  const colunaCusto = UF_COLUNA_CUSTO[uf.toUpperCase()];
  if (colunaCusto === undefined) {
    throw new Error(`UF "${uf}" não reconhecida — use a sigla de duas letras (ex.: GO, SP)`);
  }

  const workbook = readFile(filePath, { cellFormula: true });
  const sheet = workbook.Sheets["CSD"];
  if (!sheet) {
    throw new Error('Aba "CSD" (Composições Sintéticas — Sem Desoneração) não encontrada no arquivo. Confirme que é o arquivo SINAPI_Referência_AAAA_MM.xlsx');
  }

  const range = xlsxUtils.decode_range(sheet["!ref"]!);
  const mesReferenciaCell = sheet["B3"];
  const mesReferencia = mesReferenciaCell ? String(mesReferenciaCell.v) : "desconhecido";

  const composicoes = new Map<number, SinapiComposicao>();

  // Dados começam na linha 11 (índice 10, 0-based) — linha 10 é o cabeçalho.
  for (let row = 10; row <= range.e.r; row++) {
    const codigoCell = sheet[xlsxUtils.encode_cell({ r: row, c: 1 })];
    const descricaoCell = sheet[xlsxUtils.encode_cell({ r: row, c: 2 })];
    const unidadeCell = sheet[xlsxUtils.encode_cell({ r: row, c: 3 })];
    const custoCell = sheet[xlsxUtils.encode_cell({ r: row, c: colunaCusto })];

    if (!codigoCell || !descricaoCell) continue;

    const codigo = extrairCodigoDaFormula(codigoCell.f);
    if (codigo === null) continue;

    const custo = typeof custoCell?.v === "number" ? custoCell.v : null;
    if (custo === null) continue; // custo zerado/indisponível para esta UF

    composicoes.set(codigo, {
      codigo,
      descricao: String(descricaoCell.v ?? ""),
      unidade: String(unidadeCell?.v ?? ""),
      custo,
    });
  }

  return { mesReferencia, composicoes };
}

/**
 * Importa os custos unitários mapeados (SINAPI_ITEM_MAP) para
 * config_unit_costs, versionados pela dataBase do mês de referência do
 * arquivo — nunca sobrescreve uma versão anterior, sempre insere uma nova
 * linha (histórico preservado, seção 5.1-B da spec).
 */
export async function importSinapiUnitCosts(filePath: string, uf: string): Promise<{ importados: number; naoEncontrados: string[] }> {
  const db = await getDb();
  if (!db) throw new Error("Banco de dados não disponível — importação requer DATABASE_URL configurado");

  const { mesReferencia, composicoes } = parseSinapiReferencia(filePath, uf);
  const [mes, ano] = mesReferencia.split("/");
  const dataBase = new Date(Number(ano), Number(mes) - 1, 1);

  const naoEncontrados: string[] = [];
  const rows: (typeof configUnitCosts.$inferInsert)[] = [];

  for (const entry of SINAPI_ITEM_MAP) {
    let total = 0;
    let algumFaltando = false;
    const fontesCitadas: string[] = [];

    for (const componente of entry.componentes) {
      const composicao = composicoes.get(componente.codigo);
      if (!composicao) {
        algumFaltando = true;
        naoEncontrados.push(`${entry.itemCodigo} (código SINAPI ${componente.codigo} não encontrado para UF ${uf.toUpperCase()})`);
        continue;
      }
      total += composicao.custo * (componente.multiplicador ?? 1);
      fontesCitadas.push(`SINAPI ${componente.codigo}${componente.multiplicador ? ` ×${componente.multiplicador}` : ""}`);
    }

    if (algumFaltando) continue;

    rows.push({
      grupo: entry.grupo,
      itemCodigo: entry.itemCodigo,
      itemDescricao: entry.itemCodigo,
      unidade: entry.unidade,
      valorUnitario: total.toFixed(4),
      regiao: uf.toUpperCase(),
      dataBase,
      fonte: `SINAPI ${mesReferencia} (${uf.toUpperCase()}, sem desoneração) — ${fontesCitadas.join(" + ")}`,
    });
  }

  if (rows.length > 0) {
    await db.insert(configUnitCosts).values(rows);
  }

  return { importados: rows.length, naoEncontrados };
}
