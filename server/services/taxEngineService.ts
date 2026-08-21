import { createConfigSnapshot, getTaxRegime } from "../config";
import { getFinanceEngineDataByProjectId, getProjectById, getSalesEngineDataByProjectId, upsertTaxEngineData } from "../db";
import { calcularTaxEngine, RegimeTributario, TaxEngineOutput } from "../engines/taxEngine";

export interface TaxEngineServiceInput {
  regime: RegimeTributario;
  redutorSocialReais?: number;
  patrimonioAfetacao?: boolean;
  pais?: string; // padrão: "Brasil"
}

/**
 * Orquestra o cálculo do TaxEngine para um projeto:
 * 1. Exige SalesEngine (receita bruta) e FinanceEngine (lucro/resultado
 *    nominal) já calculados — impostos incidem sobre números que os outros
 *    motores produzem, não são digitados de novo.
 * 2. Resolve as alíquotas vigentes do regime escolhido no Módulo de
 *    Configuração (já preparado para múltiplos países — seção 5.1-F).
 * 3. Roda o cálculo puro (`calcularTaxEngine`).
 * 4. Persiste o resultado em `tax_engine_data`.
 * 5. Grava snapshot imutável da configuração usada (seção 5.3).
 */
export async function runTaxEngine(projectId: number, userId: number, input: TaxEngineServiceInput): Promise<TaxEngineOutput> {
  const project = await getProjectById(projectId, userId);
  if (!project) {
    throw new Error("Projeto não encontrado ou não pertence ao usuário");
  }

  const sales = await getSalesEngineDataByProjectId(projectId);
  if (!sales || sales.vgv === null) {
    throw new Error("TaxEngine depende do SalesEngine — calcule o SalesEngine deste projeto antes (receita bruta vem de lá)");
  }

  const finance = await getFinanceEngineDataByProjectId(projectId);
  if (!finance || finance.lucroTotal === null) {
    throw new Error("TaxEngine depende do FinanceEngine — calcule o FinanceEngine deste projeto antes (resultado nominal vem de lá)");
  }

  const pais = input.pais ?? "Brasil";
  const taxRegime = await getTaxRegime(pais, input.regime);
  const aliquotas = taxRegime.aliquotas as Record<string, number>;

  const output = calcularTaxEngine({
    regime: input.regime,
    receitaBrutaTotal: Number(sales.vgv),
    lucroContabil: Number(finance.lucroTotal),
    redutorSocialReais: input.redutorSocialReais,
    patrimonioAfetacao: input.patrimonioAfetacao,
    aliquotas,
  });

  await upsertTaxEngineData(projectId, {
    regimeTributario: input.regime,
    aliquotaIBS: aliquotas.ibs !== undefined ? String(aliquotas.ibs) : null,
    aliquotaCBS: aliquotas.cbs !== undefined ? String(aliquotas.cbs) : null,
    aliquotaIRPJ: aliquotas.irpj !== undefined ? String(aliquotas.irpj) : null,
    aliquotaCSLL: aliquotas.csll !== undefined ? String(aliquotas.csll) : null,
    aliquotaPIS: aliquotas.pis !== undefined ? String(aliquotas.pis) : null,
    aliquotaCOFINS: aliquotas.cofins !== undefined ? String(aliquotas.cofins) : null,
    redutorSocial: input.redutorSocialReais !== undefined ? String(input.redutorSocialReais) : null,
    patrimonioAfetacao: input.patrimonioAfetacao ?? false,
    impostosTotais: String(output.impostosTotais),
    impactoReforma: {
      linhas: output.linhas,
      comparativoReforma: output.comparativoReforma,
      cargaTributariaSobreReceita: output.cargaTributariaSobreReceita,
      lucroLiquidoAposImpostos: output.lucroLiquidoAposImpostos,
      alertas: output.alertas,
    },
  });

  await createConfigSnapshot({
    projectId,
    engine: "tax_engine",
    snapshotData: {
      pais,
      regime: input.regime,
      aliquotas,
    },
    overrides: {
      redutorSocialReais: input.redutorSocialReais,
      patrimonioAfetacao: input.patrimonioAfetacao,
    },
  });

  return output;
}
