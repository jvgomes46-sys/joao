import "dotenv/config";
import { importSinapiUnitCosts } from "../server/services/sinapiImport";

/**
 * CLI para importar a base oficial SINAPI (Caixa Econômica Federal) no
 * Módulo de Configuração, mantendo os custos unitários do CostEngine
 * sempre atualizados sem digitação manual.
 *
 * Uso:
 *   pnpm sinapi:import <caminho para SINAPI_Referência_AAAA_MM.xlsx> <UF>
 *
 * Exemplo:
 *   pnpm sinapi:import ./SINAPI_Referência_2026_07.xlsx GO
 *
 * Fonte oficial (baixar mensalmente e extrair o .zip):
 *   https://www.caixa.gov.br/site/Paginas/downloads.aspx#categoria_888
 * O arquivo relevante dentro do .zip é o "SINAPI_Referência_AAAA_MM.xlsx"
 * (os outros três — mão de obra, manutenções, famílias e coeficientes —
 * não são usados por este importador).
 */
async function main() {
  const [, , filePath, uf] = process.argv;

  if (!filePath || !uf) {
    console.error("Uso: pnpm sinapi:import <caminho-do-arquivo.xlsx> <UF>");
    console.error("Exemplo: pnpm sinapi:import ./SINAPI_Referência_2026_07.xlsx GO");
    process.exit(1);
  }

  console.log(`Importando SINAPI de "${filePath}" para a UF ${uf.toUpperCase()}...`);
  const result = await importSinapiUnitCosts(filePath, uf);

  console.log(`\n[SINAPI Import] ${result.importados} item(ns) importado(s) com sucesso.`);
  if (result.naoEncontrados.length > 0) {
    console.warn(`\n[SINAPI Import] ${result.naoEncontrados.length} item(ns) NÃO encontrado(s) neste arquivo:`);
    for (const item of result.naoEncontrados) {
      console.warn(`  - ${item}`);
    }
    console.warn("\nEsses itens continuam com o valor anterior (ou placeholder) até serem confirmados manualmente.");
  }

  process.exit(0);
}

main().catch((err) => {
  console.error("[SINAPI Import] Falhou:", err);
  process.exit(1);
});
