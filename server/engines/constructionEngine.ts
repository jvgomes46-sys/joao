/**
 * Motor de cálculo puro para a Fase 3 — Execução de Obra (spec seção 4).
 * Nenhuma I/O aqui: recebe as etapas já carregadas do banco e devolve os
 * indicadores derivados. "Peso da etapa (%)" é um campo editável/informativo
 * gravado por etapa (spec), mas o progresso consolidado é calculado a partir
 * dos valores em R$ (valorPrevisto/valorExecutado) — não depende de alguém
 * manter manualmente a soma dos pesos em 100%.
 */

/**
 * Templates padrão de etapas por tipo de subcategoria (spec seção 4): a
 * mesma sequência de 13 etapas se repete para qualquer subcategoria "de
 * edificação"; outros tipos de obra (ex.: complexo esportivo) usam outra
 * sequência. Reutilizável em vez de digitar tudo manualmente a cada obra.
 */
export const STAGE_TEMPLATES: Record<string, string[]> = {
  edificacao: [
    "Serviços Preliminares",
    "Infraestrutura Enterrada",
    "Fundação",
    "Estrutura",
    "Vedações",
    "Instalações Embutidas",
    "Cobertura",
    "Forro",
    "Revestimentos",
    "Esquadrias",
    "Pintura",
    "Instalações Finais",
    "Testes e Entrega",
  ],
  complexo_esportivo: ["Terraplanagem", "Drenagem", "Irrigação", "Base", "Plantio"],
  infraestrutura_loteamento: [
    "Serviços Preliminares",
    "Terraplanagem",
    "Drenagem",
    "Pavimentação",
    "Redes (água/esgoto/energia)",
    "Serviços Complementares",
    "Testes e Entrega",
  ],
};

export interface StageInput {
  id: number;
  nome: string;
  pesoPercentual: number;
  valorPrevisto: number;
  percentualPrevisto: number;
  percentualExecutado: number;
  status: "nao_iniciado" | "em_execucao" | "concluido";
}

export interface StageComputed extends StageInput {
  percentualAcumulado: number; // pesoPercentual × percentualExecutado / 100 — leitura informativa (spec)
  valorExecutado: number; // valorPrevisto × percentualExecutado / 100
  saldoAExecutar: number; // valorPrevisto − valorExecutado
}

export function calcularEtapa(stage: StageInput): StageComputed {
  const valorExecutado = (stage.valorPrevisto * stage.percentualExecutado) / 100;
  return {
    ...stage,
    percentualAcumulado: (stage.pesoPercentual * stage.percentualExecutado) / 100,
    valorExecutado,
    saldoAExecutar: stage.valorPrevisto - valorExecutado,
  };
}

export interface ProgressoConsolidado {
  valorPrevistoTotal: number;
  valorExecutadoTotal: number;
  saldoAExecutarTotal: number;
  progressoPercentual: number; // valorExecutadoTotal / valorPrevistoTotal, ponderado pelo R$ de cada etapa
}

/** Progresso geral (spec: "Progresso realizado (%) geral da obra") ponderado pelo valor previsto de cada etapa — não pelo campo peso%, que é só informativo. */
export function calcularProgressoConsolidado(stages: StageInput[]): ProgressoConsolidado {
  const computed = stages.map(calcularEtapa);
  const valorPrevistoTotal = computed.reduce((s, e) => s + e.valorPrevisto, 0);
  const valorExecutadoTotal = computed.reduce((s, e) => s + e.valorExecutado, 0);
  return {
    valorPrevistoTotal,
    valorExecutadoTotal,
    saldoAExecutarTotal: valorPrevistoTotal - valorExecutadoTotal,
    progressoPercentual: valorPrevistoTotal > 0 ? (valorExecutadoTotal / valorPrevistoTotal) * 100 : 0,
  };
}

export interface ResumoCategoria {
  categoriaId: number;
  nome: string;
  valorPrevistoTotal: number;
  valorExecutadoTotal: number;
  progressoPercentual: number;
}

export interface ResumoSubcategoria {
  subcategoriaId: number;
  nome: string;
  valorPrevistoTotal: number;
  valorExecutadoTotal: number;
  progressoPercentual: number;
}
