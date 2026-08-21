import {
  getCostEngineDataByProjectId,
  getFinanceEngineDataByProjectId,
  getGeoEngineDataByProjectId,
  getPartnershipAnalysisByProjectId,
  getProjectById,
  getSalesEngineDataByProjectId,
  getTaxEngineDataByProjectId,
} from "../db";
import type { FinanceMonthRow } from "../engines/financeEngine";
import type { CostItem } from "../engines/costEngine";

export interface ComposicaoCapexItem {
  grupo: string;
  valor: number;
  percentual: number;
}

export interface DreResumido {
  receitaBrutaTotal: number;
  deducoesTotal: number;
  receitaLiquidaTotal: number;
  aprovacoesTotal: number;
  obraTotal: number;
  lucroLiquido: number;
}

export interface DashboardData {
  projectName: string;

  // KPIs principais (spec seção 2.11)
  vgvTotal: number;
  vgvIncorporador: number;
  capexTotal: number;
  capexSobreVgv: number;

  lucroLiquido: number;
  margemSobreReceitaRealizada: number;
  roiSobreCapex: number;
  exposicaoMaximaCaixa: number;

  vpl: number;
  tirMensal: number | null;
  tirAnual: number | null;
  tirIndisponivelMotivo: string | null;
  paybackMes: number | null;

  composicaoCapexPorDisciplina: ComposicaoCapexItem[];
  dreResumido: DreResumido;
  alertas: string[];

  regimeTributario: string | null;
  impostosTotais: number | null;
}

/**
 * Consolida o Dashboard Executivo (spec seção 2.11) a partir dos dados já
 * persistidos pelos motores — NÃO recalcula nada, só agrega. Se algum
 * motor obrigatório ainda não rodou, falha alto explicando qual falta,
 * em vez de mostrar um dashboard com buracos silenciosos.
 */
export async function getDashboardData(projectId: number, userId: number): Promise<DashboardData> {
  const project = await getProjectById(projectId, userId);
  if (!project) {
    throw new Error("Projeto não encontrado ou não pertence ao usuário");
  }

  const [geo, cost, sales, finance, tax, parceria] = await Promise.all([
    getGeoEngineDataByProjectId(projectId),
    getCostEngineDataByProjectId(projectId),
    getSalesEngineDataByProjectId(projectId),
    getFinanceEngineDataByProjectId(projectId),
    getTaxEngineDataByProjectId(projectId),
    getPartnershipAnalysisByProjectId(projectId),
  ]);

  if (!geo) throw new Error("Dashboard depende do GeoEngine — calcule o GeoEngine deste projeto antes");
  if (!cost || cost.investimentoTotal === null) throw new Error("Dashboard depende do CostEngine — calcule o CostEngine deste projeto antes");
  if (!sales || sales.vgv === null) throw new Error("Dashboard depende do SalesEngine — calcule o SalesEngine deste projeto antes");
  if (!finance || finance.vpl === null) throw new Error("Dashboard depende do FinanceEngine — calcule o FinanceEngine deste projeto antes");

  const vgvTotal = Number(sales.vgv);
  const capexTotal = Number(cost.investimentoTotal);

  const vgvIncorporador = parceria ? Number((parceria.resultado as { vgvIncorporadora: number }).vgvIncorporadora) : vgvTotal;

  const fluxoMensal = (finance.fluxoCaixaMensal as FinanceMonthRow[] | null) ?? [];
  const dreResumido: DreResumido = fluxoMensal.reduce(
    (acc, row) => ({
      receitaBrutaTotal: acc.receitaBrutaTotal + row.receitaBruta,
      deducoesTotal: acc.deducoesTotal + row.deducoesVenda,
      receitaLiquidaTotal: acc.receitaLiquidaTotal + row.receitaLiquida,
      aprovacoesTotal: acc.aprovacoesTotal + row.custoAprovacoes,
      obraTotal: acc.obraTotal + row.custoObra,
      lucroLiquido: 0, // preenchido abaixo
    }),
    { receitaBrutaTotal: 0, deducoesTotal: 0, receitaLiquidaTotal: 0, aprovacoesTotal: 0, obraTotal: 0, lucroLiquido: 0 }
  );
  dreResumido.lucroLiquido = Number(finance.lucroTotal);

  const detalhamentoItens = (cost.detalhamentoItens as CostItem[] | null) ?? [];
  const totalPorGrupo = new Map<string, number>();
  for (const item of detalhamentoItens) {
    if (!item.ativo) continue;
    totalPorGrupo.set(item.grupo, (totalPorGrupo.get(item.grupo) ?? 0) + item.total);
  }
  const somaGrupos = Array.from(totalPorGrupo.values()).reduce((s, v) => s + v, 0);
  const composicaoCapexPorDisciplina: ComposicaoCapexItem[] = Array.from(totalPorGrupo.entries())
    .map(([grupo, valor]) => ({ grupo, valor, percentual: somaGrupos > 0 ? (valor / somaGrupos) * 100 : 0 }))
    .sort((a, b) => b.valor - a.valor);

  const geoAlertas = ((geo.indicesUrbanisticos as { alertasConformidade?: string[] } | null)?.alertasConformidade ?? []) as string[];
  const financeAlertas = (finance.alertasConsistencia as string[] | null) ?? [];
  const alertas = [...geoAlertas, ...financeAlertas];

  return {
    projectName: project.name,
    vgvTotal,
    vgvIncorporador,
    capexTotal,
    capexSobreVgv: vgvTotal > 0 ? capexTotal / vgvTotal : 0,
    lucroLiquido: Number(finance.lucroTotal),
    margemSobreReceitaRealizada: Number(finance.margemLucro),
    roiSobreCapex: Number(finance.roi),
    exposicaoMaximaCaixa: Number(finance.exposicaoMaximaCaixa),
    vpl: Number(finance.vpl),
    tirMensal: finance.tirMensal !== null ? Number(finance.tirMensal) : null,
    tirAnual: finance.tir !== null ? Number(finance.tir) : null,
    tirIndisponivelMotivo: finance.tirIndisponivelMotivo ?? null,
    paybackMes: finance.payback !== null ? Number(finance.payback) : null,
    composicaoCapexPorDisciplina,
    dreResumido,
    alertas,
    regimeTributario: tax?.regimeTributario ?? null,
    impostosTotais: tax?.impostosTotais !== undefined && tax?.impostosTotais !== null ? Number(tax.impostosTotais) : null,
  };
}
