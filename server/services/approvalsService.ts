import type { Approval, InsertApproval } from "../../drizzle/schema";
import { getApprovalsByProjectId, getGeoEngineDataByProjectId, getProjectById, seedApprovalsIfEmpty } from "../db";
import type { GRAPROHABItem } from "../engines/geoEngine";

type SeedItem = Omit<InsertApproval, "projectId" | "id">;

/**
 * Grupos fixos do módulo 2.5 (Aprovações e Projetos) — os itens em si variam
 * pouco de projeto para projeto, então usamos um template padrão em vez de
 * pedir para o usuário digitar cada linha manualmente.
 */
const CHECKLIST_MODULO_2_5: SeedItem[] = [
  // A. Levantamentos e Projetos
  { orgao: "Topografia/Georreferenciamento", grupo: "levantamentos", item: "Levantamento topográfico e georreferenciamento da gleba", status: "nao_iniciado", origem: "automatico" },
  { orgao: "Engenharia", grupo: "levantamentos", item: "Projetos de engenharia (urbanístico, infraestrutura)", status: "nao_iniciado", origem: "automatico" },
  { orgao: "Geotecnia", grupo: "levantamentos", item: "Sondagem do solo", status: "nao_iniciado", origem: "automatico" },
  // B. Licenciamento Ambiental
  { orgao: "Órgão Ambiental", grupo: "ambiental", item: "Estudo ambiental + ART", status: "nao_iniciado", origem: "automatico" },
  { orgao: "Órgão Ambiental", grupo: "ambiental", item: "Compensação/reposição florestal (se houver supressão de vegetação)", status: "nao_iniciado", origem: "automatico" },
  { orgao: "Órgão Ambiental / Recursos Hídricos", grupo: "ambiental", item: "Outorga de recursos hídricos (se solução de água for poço)", status: "nao_iniciado", origem: "automatico" },
  // C. Taxas Oficiais
  { orgao: "SEMAD/Prefeitura", grupo: "taxas_oficiais", item: "Licenciamento (SEMAD + Prefeitura)", status: "nao_iniciado", origem: "automatico" },
  { orgao: "Cartório de Registro de Imóveis (CRI)", grupo: "taxas_oficiais", item: "Registro do parcelamento", status: "nao_iniciado", origem: "automatico" },
  { orgao: "Assessoria Jurídica", grupo: "taxas_oficiais", item: "Assessoria e protocolos administrativos", status: "nao_iniciado", origem: "automatico" },
  // D. Concessionárias
  { orgao: "Concessionária de Água", grupo: "concessionarias", item: "Análise de projeto de água", status: "nao_iniciado", origem: "automatico" },
  { orgao: "Concessionária de Esgoto", grupo: "concessionarias", item: "Análise de projeto de esgoto (dispensado se solução for fossa)", status: "nao_iniciado", origem: "automatico" },
  { orgao: "Concessionária de Esgoto", grupo: "concessionarias", item: "Projeto hidrossanitário + ART", status: "nao_iniciado", origem: "automatico" },
  { orgao: "Concessionária de Energia", grupo: "concessionarias", item: "Participação financeira na rede elétrica", status: "nao_iniciado", origem: "automatico" },
];

function graprohabToApproval(item: GRAPROHABItem): SeedItem {
  return {
    orgao: "GRAPROHAB",
    grupo: "graprohab",
    item: `[${item.categoria}] ${item.criterio}`,
    status: "nao_iniciado",
    observacao: item.observacao,
    origem: "automatico",
  };
}

/**
 * Semeia o checklist de aprovações (spec seção 3) a partir do checklist
 * GRAPROHAB já calculado pelo GeoEngine (14 itens) somado ao template fixo
 * do módulo 2.5. Idempotente — não duplica se o projeto já tiver itens
 * (ver `seedApprovalsIfEmpty`), então pode ser chamado toda vez que o
 * GeoEngine roda sem medo de acumular linhas repetidas.
 */
export async function seedApprovalsForProject(projectId: number, userId: number): Promise<Approval[]> {
  const project = await getProjectById(projectId, userId);
  if (!project) {
    throw new Error("Projeto não encontrado ou não pertence ao usuário");
  }

  const geo = await getGeoEngineDataByProjectId(projectId);
  if (!geo) {
    throw new Error("Checklist de aprovações depende do GeoEngine — calcule o GeoEngine deste projeto antes");
  }

  const checklistGRAPROHAB = (geo.checklistGRAProhab as GRAPROHABItem[] | null) ?? [];
  const items: SeedItem[] = [...checklistGRAPROHAB.map(graprohabToApproval), ...CHECKLIST_MODULO_2_5];

  return seedApprovalsIfEmpty(projectId, items);
}

export async function listApprovals(projectId: number, userId: number): Promise<Approval[]> {
  const project = await getProjectById(projectId, userId);
  if (!project) {
    throw new Error("Projeto não encontrado ou não pertence ao usuário");
  }
  return getApprovalsByProjectId(projectId);
}
