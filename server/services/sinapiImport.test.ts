import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import xlsxPkg from "xlsx";
import { getDb } from "../db";
import { configUnitCosts } from "../../drizzle/schema";
import { parseSinapiReferencia, importSinapiUnitCosts, SINAPI_ITEM_MAP } from "./sinapiImport";

const { utils: xlsxUtils, writeFile: writeXlsxFile } = xlsxPkg;

/**
 * O arquivo SINAPI_Referência oficial tem ~13MB e não faz sentido commitar
 * no repositório — este teste monta um workbook sintético MENOR mas com a
 * mesma estrutura exata da aba "CSD" (cabeçalho na linha 10, códigos como
 * fórmula HYPERLINK com o número real embutido como último argumento
 * literal, colunas de custo por UF nas mesmas posições), para provar que o
 * parser lê corretamente o arquivo real sem precisar do arquivo gigante.
 */
function criarFixtureSinapi(dir: string): string {
  const filePath = join(dir, "SINAPI_Referência_2026_07.xlsx");

  // SheetJS descarta silenciosamente uma célula que só tem `.f` sem `.t`/`.v`
  // — toda célula precisa do tipo e de um valor (cacheado), igual ao arquivo
  // real. Para as fórmulas HYPERLINK, o valor cacheado no arquivo oficial
  // também costuma vir zerado (por isso o parser lê o código pela fórmula,
  // não pelo valor) — replicamos isso aqui com v:0.
  function texto(v: string) {
    return { t: "s" as const, v };
  }
  function numero(v: number) {
    return { t: "n" as const, v };
  }
  function formulaComCodigo(offset: number, codigo: number) {
    return { t: "n" as const, v: 0, f: `=HYPERLINK("#"&CELL("address",OFFSET(Analítico!$B$1,${offset},3)),${codigo})` };
  }

  const sheetData: Record<string, { t: "s" | "n"; v: unknown; f?: string }> = {
    B3: texto("07/2026"),
    // Linha 4 (índice 3): labels de UF nas mesmas colunas do arquivo real
    E4: texto("AC"),
    U4: texto("GO"), // coluna 20 (0-based) = U
    // Cabeçalho linha 10 (índice 9)
    A10: texto("Grupo"),
    B10: texto("Código da\nComposição"),
    C10: texto("Descrição"),
    D10: texto("Unidade"),
    E10: texto("Custo (R$)"),
    U10: texto("Custo (R$)"),
    // Linha 11 (índice 10): código 101116, custo GO = 2.33
    A11: texto("Terraplenagem"),
    B11: formulaComCodigo(1, 101116),
    C11: texto("ESCAVAÇÃO HORIZONTAL EM SOLO DE 1A CATEGORIA"),
    D11: texto("M3"),
    E11: numero(2.5),
    U11: numero(2.33),
    // Linha 12: código 95568, custo GO = 122.76
    A12: texto("Drenagem"),
    B12: formulaComCodigo(2, 95568),
    C12: texto("TUBO DE CONCRETO DN 400MM"),
    D12: texto("M"),
    E12: numero(130),
    U12: numero(122.76),
    // Linha 13: código com custo indisponível em GO — deve ser ignorado
    A13: texto("Drenagem"),
    B13: formulaComCodigo(3, 999999),
    C13: texto("ITEM SEM PREÇO EM GO"),
    D13: texto("UN"),
    E13: numero(10),
    // sem U13 -> custo ausente para GO
  };

  const ws: Record<string, unknown> = { "!ref": "A1:AB13" };
  for (const [addr, cell] of Object.entries(sheetData)) {
    ws[addr] = cell;
  }

  const wb = xlsxUtils.book_new();
  xlsxUtils.book_append_sheet(wb, ws as never, "CSD");
  writeXlsxFile(wb, filePath);
  return filePath;
}

describe("parseSinapiReferencia — parser do arquivo oficial SINAPI", () => {
  let dir: string;
  let filePath: string;

  beforeAll(() => {
    dir = mkdtempSync(join(tmpdir(), "sinapi-test-"));
    filePath = criarFixtureSinapi(dir);
  });

  afterAll(() => {
    rmSync(dir, { recursive: true, force: true });
  });

  it("extrai o código real de dentro da fórmula HYPERLINK, não do valor cacheado", () => {
    const { mesReferencia, composicoes } = parseSinapiReferencia(filePath, "GO");
    expect(mesReferencia).toBe("07/2026");
    expect(composicoes.has(101116)).toBe(true);
    expect(composicoes.get(101116)?.custo).toBe(2.33);
    expect(composicoes.get(95568)?.custo).toBe(122.76);
  });

  it("ignora composições sem custo disponível para a UF pedida", () => {
    const { composicoes } = parseSinapiReferencia(filePath, "GO");
    expect(composicoes.has(999999)).toBe(false);
  });

  it("rejeita UF desconhecida", () => {
    expect(() => parseSinapiReferencia(filePath, "XX")).toThrow(/não reconhecida/);
  });

  it("lê a UF correta pela coluna certa (AC diferente de GO)", () => {
    const { composicoes } = parseSinapiReferencia(filePath, "AC");
    expect(composicoes.get(101116)?.custo).toBe(2.5); // valor da coluna AC (E), não GO (U)
  });
});

describe("importSinapiUnitCosts — grava no Módulo de Configuração", () => {
  let dir: string;
  let filePath: string;

  beforeAll(() => {
    dir = mkdtempSync(join(tmpdir(), "sinapi-test-"));
    filePath = criarFixtureSinapi(dir);
  });

  afterAll(() => {
    rmSync(dir, { recursive: true, force: true });
  });

  afterEach(async () => {
    const db = await getDb();
    if (!db) return;
    await db.delete(configUnitCosts).where(eq(configUnitCosts.regiao, "GO"));
  });

  it("importa apenas os itens cujos códigos existem no arquivo, reportando os que faltam", async () => {
    // fixture só tem 101116 e 95568 — os outros itens do SINAPI_ITEM_MAP (que
    // dependem de múltiplos códigos ou de códigos ausentes) devem faltar
    const result = await importSinapiUnitCosts(filePath, "GO");
    expect(result.importados).toBe(2); // "corte_aterro" (101116) e "drenagem_galeria" (95568), cada um de código único
    expect(result.naoEncontrados.length).toBeGreaterThan(0);

    const db = await getDb();
    const rows = await db!.select().from(configUnitCosts).where(eq(configUnitCosts.regiao, "GO"));
    const corteAterro = rows.find((r) => r.itemCodigo === "corte_aterro");
    expect(corteAterro).toBeDefined();
    expect(Number(corteAterro!.valorUnitario)).toBe(2.33);
    expect(corteAterro!.fonte).toContain("SINAPI 07/2026");

    // limpeza
    await db!.delete(configUnitCosts).where(eq(configUnitCosts.regiao, "GO"));
  });

  it("SINAPI_ITEM_MAP cobre pelo menos os grupos principais do CostEngine", () => {
    const grupos = new Set(SINAPI_ITEM_MAP.map((e) => e.grupo));
    expect(grupos.has("terraplenagem")).toBe(true);
    expect(grupos.has("drenagem")).toBe(true);
    expect(grupos.has("pavimentacao")).toBe(true);
    expect(grupos.has("agua")).toBe(true);
    expect(grupos.has("energia")).toBe(true);
  });
});
