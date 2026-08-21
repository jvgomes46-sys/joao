import { getGeoEngineDataByProjectId, getProjectById } from "../db";
import { calcularConformidadeLegal, type LegalComplianceInput, type LegalComplianceOutput } from "../engines/legalComplianceEngine";

export type LegalComplianceExtras = Omit<LegalComplianceInput, "areaMediaLoteM2">;

/**
 * Monta o checklist de Conformidade Legal (Lei 6.766/79, spec seção 2.6) a
 * partir da área média de lote já calculada pelo GeoEngine, mais os campos
 * que exigem geometria/topografia/levantamento de campo (não verificáveis
 * automaticamente — ficam "não_verificável" se omitidos). Não persiste:
 * é uma leitura computada sob demanda, como o GRAPROHAB já era antes de
 * virar checklist editável de aprovações (spec seção 3).
 */
export async function getLegalComplianceChecklist(
  projectId: number,
  userId: number,
  extras: LegalComplianceExtras = {}
): Promise<LegalComplianceOutput> {
  const project = await getProjectById(projectId, userId);
  if (!project) {
    throw new Error("Projeto não encontrado ou não pertence ao usuário");
  }

  const geo = await getGeoEngineDataByProjectId(projectId);
  if (!geo || geo.numeroLotes === null || geo.areaVendavel === null) {
    throw new Error("Conformidade Legal depende do GeoEngine — calcule o GeoEngine deste projeto antes");
  }

  const indices = geo.indicesUrbanisticos as { areaMediaLote?: number } | null;
  const areaMediaLoteM2 = indices?.areaMediaLote ?? Number(geo.areaVendavel) / geo.numeroLotes;

  return calcularConformidadeLegal({ areaMediaLoteM2, ...extras });
}
