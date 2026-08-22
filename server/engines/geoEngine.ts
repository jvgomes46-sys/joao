/**
 * GeoEngine - Motor Urbanístico
 * Cálculos de áreas, conformidade com Lei 6.766/79 e checklist GRAPROHAB
 *
 * Regras replicadas da Especificação EVTE PRO, seção 2.2 e 2.1:
 * - APP/Reserva Legal é deduzida da gleba ANTES de qualquer percentual
 *   (Área Parcelável = Gleba − APP/RL)
 * - % área verde / institucional / sistema viário / calçadas são inputs por
 *   projeto (com defaults), nunca constantes fixas
 * - Quantidade de lotes: modo Automático (área ÷ lote-alvo) ou Manual (nº
 *   digitado, e a área média por lote vira resultado, não input)
 * - Densidade (hab/ha) alimenta a regra de dispensa de rede coletora
 *   (< 20 hab/ha dispensa rede coletora — afeta o CostEngine)
 */

export type ModoLotes = "automatico" | "manual";

export interface GeoEngineInput {
  areaBruta: number; // m² — área total da gleba
  areaAPP?: number; // m² — APP/Reserva Legal, deduzida antes de qualquer percentual (padrão: 0)

  percentualVerde?: number; // % sobre a área parcelável (padrão: 15%, editável)
  percentualInstitucional?: number; // % sobre a área parcelável (padrão: 5%, editável)
  percentualSistemaViario?: number; // % sobre a área parcelável (padrão: 20%, editável)
  percentualCalcadas?: number; // % sobre a área parcelável (padrão: 0%, editável)

  // Quantidade de lotes: alternância Automático/Manual (spec seção 2.1 e regra 13 da seção 6)
  modoLotes?: ModoLotes; // padrão: "automatico"
  areaMediaLoteAlvo?: number; // m² — obrigatório se modoLotes = "automatico"
  numeroLotesManual?: number; // obrigatório se modoLotes = "manual"

  // Densidade (regra da seção 6: < 20 hab/ha dispensa rede coletora)
  taxaOcupacaoHabPorLote?: number; // hab/lote (padrão: 3.5, referência técnica comum para loteamentos)

  coeficienteAproveitamento?: number; // CA (padrão: 1.0)
  taxaOcupacao?: number; // TO em % (padrão: 60%)
  gabarito?: number; // altura máxima em metros

  // Pisos mínimos de conformidade (vêm do Módulo de Configuração — legislação
  // municipal ou piso federal Lei 6.766/79 — nunca hardcoded no motor)
  pisoPercentualVerdeMin?: number; // padrão: 15
  pisoPercentualInstitucionalMin?: number; // padrão: 5
  pisoPercentualSistemaViarioMin?: number; // padrão: 20
  pisoAreaMinimaLote?: number; // padrão: 125 m²
}

export interface GeoEngineOutput {
  areaBruta: number;
  areaAPP: number;
  areaParcelavel: number;

  areaVerde: number;
  areaInstitucional: number;
  sistemaViario: number;
  areaCalcadas: number;
  areaVendavel: number;

  // Indicadores (percentuais sobre a área parcelável, não sobre a gleba bruta)
  percentualVerde: number;
  percentualInstitucional: number;
  percentualSistemaViario: number;
  /** Pisos legais efetivamente aplicados (município cadastrado, piso federal ou override). */
  pisosAplicados: { verdeMin: number; institucionalMin: number; sistemaViarioMin: number };
  percentualCalcadas: number;

  // Coeficientes
  coeficienteAproveitamento: number;
  taxaOcupacao: number;
  potencialConstrutivo: number;

  // Lotes
  modoLotes: ModoLotes;
  numeroLotes: number;
  areaMediaLote: number; // input se modo automático, resultado calculado se modo manual

  // Densidade e dispensa de rede coletora (regra crítica seção 6)
  densidadeHabHa: number;
  dispensaRedeColetora: boolean; // true quando densidadeHabHa < 20

  // Conformidade
  conformidadeLei6766: boolean;
  alertasConformidade: string[];

  // GRAPROHAB
  checklistGRAPROHAB: GRAPROHABItem[];
  conformidadeGRAPROHAB: boolean;
}

export interface GRAPROHABItem {
  id: string;
  categoria: string;
  criterio: string;
  conforme: boolean;
  observacao?: string;
}

/**
 * Calcula os parâmetros urbanísticos conforme Lei 6.766/79
 */
export function calcularGeoEngine(input: GeoEngineInput): GeoEngineOutput {
  const {
    areaBruta,
    areaAPP = 0,
    percentualVerde = 15,
    percentualInstitucional = 5,
    percentualSistemaViario = 20,
    percentualCalcadas = 0,
    modoLotes = "automatico",
    taxaOcupacaoHabPorLote = 3.5,
    coeficienteAproveitamento = 1.0,
    taxaOcupacao = 60,
    pisoPercentualVerdeMin = 15,
    pisoPercentualInstitucionalMin = 5,
    pisoPercentualSistemaViarioMin = 20,
  } = input;

  if (areaAPP > areaBruta) {
    throw new Error("Área de APP/Reserva Legal não pode ser maior que a área bruta da gleba");
  }

  // APP/RL sai da gleba ANTES de qualquer percentual (spec seção 2.1)
  const areaParcelavel = areaBruta - areaAPP;

  // Percentuais incidem sobre a área parcelável, não sobre a gleba bruta
  const areaVerde = (areaParcelavel * percentualVerde) / 100;
  const areaInstitucional = (areaParcelavel * percentualInstitucional) / 100;
  const sistemaViario = (areaParcelavel * percentualSistemaViario) / 100;
  const areaCalcadas = (areaParcelavel * percentualCalcadas) / 100;

  // Área Vendável = Parcelável − Públicas (verde+institucional) − Viário (sistema viário+calçadas)
  const areaVendavel = areaParcelavel - areaVerde - areaInstitucional - sistemaViario - areaCalcadas;

  if (areaVendavel <= 0) {
    throw new Error(
      "Área vendável resultou em zero ou negativa — percentuais de área pública/viário somam mais que 100% da área parcelável"
    );
  }

  // Indicadores percentuais (sobre a área parcelável — base de referência da Lei 6.766/79 local)
  const percentualVerdeFinal = (areaVerde / areaParcelavel) * 100;
  const percentualInstitucionalFinal = (areaInstitucional / areaParcelavel) * 100;
  const percentualSistemaViarioFinal = (sistemaViario / areaParcelavel) * 100;
  const percentualCalcadasFinal = (areaCalcadas / areaParcelavel) * 100;

  // Potencial construtivo
  const potencialConstrutivo = areaVendavel * coeficienteAproveitamento;

  // Quantidade de lotes — alternância Automático/Manual (regra 13, seção 6)
  let numeroLotes: number;
  let areaMediaLote: number;

  if (modoLotes === "automatico") {
    if (!input.areaMediaLoteAlvo || input.areaMediaLoteAlvo <= 0) {
      throw new Error("Modo Automático requer areaMediaLoteAlvo (m²) > 0");
    }
    numeroLotes = Math.floor(areaVendavel / input.areaMediaLoteAlvo);
    areaMediaLote = input.areaMediaLoteAlvo; // input, ecoado como resultado
  } else {
    if (!input.numeroLotesManual || input.numeroLotesManual <= 0) {
      throw new Error("Modo Manual requer numeroLotesManual > 0");
    }
    numeroLotes = input.numeroLotesManual;
    areaMediaLote = areaVendavel / numeroLotes; // resultado calculado, não input
  }

  if (numeroLotes <= 0) {
    throw new Error("Cálculo resultou em zero lotes — revisar área média do lote ou percentuais de área pública");
  }

  // Densidade (hab/ha) e regra de dispensa de rede coletora (seção 6)
  const areaBrutaHa = areaBruta / 10000;
  const densidadeHabHa = (numeroLotes * taxaOcupacaoHabPorLote) / areaBrutaHa;
  const dispensaRedeColetora = densidadeHabHa < 20;

  // Validação Lei 6.766/79 (piso pode vir da legislação municipal ou do piso federal)
  const alertasConformidade: string[] = [];
  let conformidadeLei6766 = true;

  if (percentualVerdeFinal < pisoPercentualVerdeMin) {
    alertasConformidade.push(
      `Área verde insuficiente: ${percentualVerdeFinal.toFixed(2)}% (mínimo ${pisoPercentualVerdeMin}%)`
    );
    conformidadeLei6766 = false;
  }

  if (percentualInstitucionalFinal < pisoPercentualInstitucionalMin) {
    alertasConformidade.push(
      `Área institucional insuficiente: ${percentualInstitucionalFinal.toFixed(2)}% (mínimo ${pisoPercentualInstitucionalMin}%)`
    );
    conformidadeLei6766 = false;
  }

  if (percentualSistemaViarioFinal < pisoPercentualSistemaViarioMin) {
    alertasConformidade.push(
      `Sistema viário insuficiente: ${percentualSistemaViarioFinal.toFixed(2)}% (mínimo ${pisoPercentualSistemaViarioMin}%)`
    );
  }

  if (dispensaRedeColetora) {
    alertasConformidade.push(
      `Densidade de ${densidadeHabHa.toFixed(2)} hab/ha está abaixo de 20 hab/ha — dispensa rede coletora interna (afeta drenagem, pavimentação e esgoto no orçamento)`
    );
  }

  // Checklist GRAPROHAB
  const checklistGRAPROHAB = gerarChecklistGRAPROHAB(input, {
    pisoPercentualVerdeMin,
    pisoPercentualInstitucionalMin,
    pisoPercentualSistemaViarioMin,
    areaParcelavel,
    areaVerde,
    areaInstitucional,
    sistemaViario,
    percentualVerdeFinal,
    percentualInstitucionalFinal,
    potencialConstrutivo,
  });

  const conformidadeGRAPROHAB = checklistGRAPROHAB.every((item) => item.conforme);

  return {
    areaBruta,
    areaAPP,
    areaParcelavel,
    areaVerde,
    areaInstitucional,
    sistemaViario,
    areaCalcadas,
    areaVendavel,
    percentualVerde: percentualVerdeFinal,
    percentualInstitucional: percentualInstitucionalFinal,
    percentualSistemaViario: percentualSistemaViarioFinal,
    percentualCalcadas: percentualCalcadasFinal,
    pisosAplicados: {
      verdeMin: pisoPercentualVerdeMin,
      institucionalMin: pisoPercentualInstitucionalMin,
      sistemaViarioMin: pisoPercentualSistemaViarioMin,
    },
    coeficienteAproveitamento,
    taxaOcupacao,
    potencialConstrutivo,
    modoLotes,
    numeroLotes,
    areaMediaLote,
    densidadeHabHa,
    dispensaRedeColetora,
    conformidadeLei6766,
    alertasConformidade,
    checklistGRAPROHAB,
    conformidadeGRAPROHAB,
  };
}

/**
 * Gera o checklist GRAPROHAB (Grupo de Análise e Aprovação de Projetos Habitacionais)
 */
function gerarChecklistGRAPROHAB(
  input: GeoEngineInput,
  calculados: {
    pisoPercentualVerdeMin: number;
    pisoPercentualInstitucionalMin: number;
    pisoPercentualSistemaViarioMin: number;
    areaParcelavel: number;
    areaVerde: number;
    areaInstitucional: number;
    sistemaViario: number;
    percentualVerdeFinal: number;
    percentualInstitucionalFinal: number;
    potencialConstrutivo: number;
  }
): GRAPROHABItem[] {
  const items: GRAPROHABItem[] = [];

  // Áreas Públicas
  items.push({
    id: "graprohab_001",
    categoria: "Áreas Públicas",
    criterio: `Área verde mínima de ${calculados.pisoPercentualVerdeMin}%`,
    conforme: calculados.percentualVerdeFinal >= calculados.pisoPercentualVerdeMin,
    observacao: `Atual: ${calculados.percentualVerdeFinal.toFixed(2)}%`,
  });

  items.push({
    id: "graprohab_002",
    categoria: "Áreas Públicas",
    criterio: `Área institucional mínima de ${calculados.pisoPercentualInstitucionalMin}%`,
    conforme: calculados.percentualInstitucionalFinal >= calculados.pisoPercentualInstitucionalMin,
    observacao: `Atual: ${calculados.percentualInstitucionalFinal.toFixed(2)}%`,
  });

  items.push({
    id: "graprohab_003",
    categoria: "Áreas Públicas",
    criterio: `Sistema viário adequado (mínimo ${calculados.pisoPercentualSistemaViarioMin}%)`,
    conforme: (calculados.sistemaViario / calculados.areaParcelavel) * 100 >= calculados.pisoPercentualSistemaViarioMin,
    observacao: `Atual: ${((calculados.sistemaViario / calculados.areaParcelavel) * 100).toFixed(2)}%`,
  });

  // Lotes e Ocupação
  items.push({
    id: "graprohab_004",
    categoria: "Lotes",
    criterio: "Lotes com dimensões mínimas adequadas",
    conforme: true, // Será validado após definir tipologias
    observacao: "Validar após definir tipologias de lotes",
  });

  items.push({
    id: "graprohab_005",
    categoria: "Ocupação",
    criterio: "Taxa de ocupação conforme zoneamento",
    conforme: input.taxaOcupacao ? input.taxaOcupacao <= 80 : true,
    observacao: `Taxa de ocupação: ${input.taxaOcupacao ?? "não informada"}%`,
  });

  // Infraestrutura
  items.push({
    id: "graprohab_006",
    categoria: "Infraestrutura",
    criterio: "Previsão de água potável",
    conforme: true,
    observacao: "Validar projeto de infraestrutura",
  });

  items.push({
    id: "graprohab_007",
    categoria: "Infraestrutura",
    criterio: "Previsão de esgotamento sanitário",
    conforme: true,
    observacao: "Validar projeto de infraestrutura",
  });

  items.push({
    id: "graprohab_008",
    categoria: "Infraestrutura",
    criterio: "Previsão de drenagem pluvial",
    conforme: true,
    observacao: "Validar projeto de infraestrutura",
  });

  items.push({
    id: "graprohab_009",
    categoria: "Infraestrutura",
    criterio: "Previsão de energia elétrica",
    conforme: true,
    observacao: "Validar projeto de infraestrutura",
  });

  // Acessibilidade
  items.push({
    id: "graprohab_010",
    categoria: "Acessibilidade",
    criterio: "Conformidade com NBR 9050 (acessibilidade)",
    conforme: true,
    observacao: "Validar em projeto executivo",
  });

  items.push({
    id: "graprohab_011",
    categoria: "Acessibilidade",
    criterio: "Rotas acessíveis nas áreas públicas",
    conforme: true,
    observacao: "Validar em projeto executivo",
  });

  // Segurança
  items.push({
    id: "graprohab_012",
    categoria: "Segurança",
    criterio: "Conformidade com CBRN (Código de Segurança Contra Incêndio)",
    conforme: true,
    observacao: "Validar em projeto executivo",
  });

  // Meio Ambiente
  items.push({
    id: "graprohab_013",
    categoria: "Meio Ambiente",
    criterio: "Preservação de áreas de proteção ambiental",
    conforme: true,
    observacao: "Validar localização e legislação ambiental",
  });

  items.push({
    id: "graprohab_014",
    categoria: "Meio Ambiente",
    criterio: "Adequação a legislação de resíduos",
    conforme: true,
    observacao: "Validar plano de gerenciamento de resíduos",
  });

  return items;
}

/**
 * Calcula o número de lotes por tipologia (distribuição de um mix de tipologias
 * dentro da área vendável — usado quando o empreendimento mistura tipos de lote)
 */
export function calcularLotesPorTipologia(
  areaVendavel: number,
  tipologias: {
    nome: string;
    percentual: number;
    areaMedia: number;
  }[]
): {
  tipologia: string;
  percentual: number;
  areaTotal: number;
  numeroLotes: number;
  areaMediaResultante: number;
}[] {
  return tipologias.map((tip) => {
    const areaTotal = (areaVendavel * tip.percentual) / 100;
    const numeroLotes = Math.floor(areaTotal / tip.areaMedia);
    const areaMediaResultante = numeroLotes > 0 ? areaTotal / numeroLotes : 0;

    return {
      tipologia: tip.nome,
      percentual: tip.percentual,
      areaTotal,
      numeroLotes,
      areaMediaResultante,
    };
  });
}
