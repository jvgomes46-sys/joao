/**
 * GeoEngine - Motor Urbanístico
 * Cálculos de áreas, conformidade com Lei 6.766/79 e checklist GRAPROHAB
 */

export interface GeoEngineInput {
  areaBruta: number; // m²
  areaVerde?: number; // m² (será calculada se não informada)
  areaInstitucional?: number; // m² (será calculada se não informada)
  sistemaViario?: number; // m² (será calculada se não informada)
  percentualVerde?: number; // % (padrão: 15%)
  percentualInstitucional?: number; // % (padrão: 5%)
  coeficienteAproveitamento?: number; // CA (padrão: 1.0)
  taxaOcupacao?: number; // TO em % (padrão: 60%)
  gabarito?: number; // altura máxima em metros
}

export interface GeoEngineOutput {
  areaBruta: number;
  areaVerde: number;
  areaInstitucional: number;
  sistemaViario: number;
  areaLiquida: number;
  areaComercializavel: number;
  
  // Indicadores
  percentualVerde: number;
  percentualInstitucional: number;
  percentualSistemaViario: number;
  
  // Coeficientes
  coeficienteAproveitamento: number;
  taxaOcupacao: number;
  potencialConstrutivo: number;
  
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
    percentualVerde = 15,
    percentualInstitucional = 5,
    coeficienteAproveitamento = 1.0,
    taxaOcupacao = 60,
    gabarito,
  } = input;

  // Cálculos de áreas
  const areaVerde = input.areaVerde ?? (areaBruta * percentualVerde) / 100;
  const areaInstitucional = input.areaInstitucional ?? (areaBruta * percentualInstitucional) / 100;
  
  // Sistema viário é o restante
  const areaComPublica = areaVerde + areaInstitucional;
  const sistemaViario = input.sistemaViario ?? areaBruta - areaComPublica - (areaBruta * 0.25); // Estimativa padrão
  
  const areaLiquida = areaBruta - sistemaViario;
  const areaComercializavel = areaLiquida - areaVerde - areaInstitucional;

  // Indicadores percentuais
  const percentualVerdeFinal = (areaVerde / areaBruta) * 100;
  const percentualInstitucionalFinal = (areaInstitucional / areaBruta) * 100;
  const percentualSistemaViarioFinal = (sistemaViario / areaBruta) * 100;

  // Potencial construtivo
  const potencialConstrutivo = areaComercializavel * coeficienteAproveitamento;

  // Validação Lei 6.766/79
  const alertasConformidade: string[] = [];
  let conformidadeLei6766 = true;

  if (percentualVerdeFinal < 15) {
    alertasConformidade.push(`Área verde insuficiente: ${percentualVerdeFinal.toFixed(2)}% (mínimo 15%)`);
    conformidadeLei6766 = false;
  }

  if (percentualInstitucionalFinal < 5) {
    alertasConformidade.push(`Área institucional insuficiente: ${percentualInstitucionalFinal.toFixed(2)}% (mínimo 5%)`);
    conformidadeLei6766 = false;
  }

  if (percentualSistemaViarioFinal < 20) {
    alertasConformidade.push(`Sistema viário insuficiente: ${percentualSistemaViarioFinal.toFixed(2)}% (recomendado mínimo 20%)`);
  }

  // Checklist GRAPROHAB
  const checklistGRAPROHAB = gerarChecklistGRAPROHAB(
    input,
    {
      areaBruta,
      areaVerde,
      areaInstitucional,
      sistemaViario,
      percentualVerdeFinal,
      percentualInstitucionalFinal,
      potencialConstrutivo,
    }
  );

  const conformidadeGRAPROHAB = checklistGRAPROHAB.every((item) => item.conforme);

  return {
    areaBruta,
    areaVerde,
    areaInstitucional,
    sistemaViario,
    areaLiquida,
    areaComercializavel,
    percentualVerde: percentualVerdeFinal,
    percentualInstitucional: percentualInstitucionalFinal,
    percentualSistemaViario: percentualSistemaViarioFinal,
    coeficienteAproveitamento,
    taxaOcupacao,
    potencialConstrutivo,
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
    areaBruta: number;
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
    criterio: "Área verde mínima de 15%",
    conforme: calculados.percentualVerdeFinal >= 15,
    observacao: `Atual: ${calculados.percentualVerdeFinal.toFixed(2)}%`,
  });

  items.push({
    id: "graprohab_002",
    categoria: "Áreas Públicas",
    criterio: "Área institucional mínima de 5%",
    conforme: calculados.percentualInstitucionalFinal >= 5,
    observacao: `Atual: ${calculados.percentualInstitucionalFinal.toFixed(2)}%`,
  });

  items.push({
    id: "graprohab_003",
    categoria: "Áreas Públicas",
    criterio: "Sistema viário adequado (mínimo 20%)",
    conforme: calculados.sistemaViario / calculados.areaBruta >= 0.2,
    observacao: `Atual: ${((calculados.sistemaViario / calculados.areaBruta) * 100).toFixed(2)}%`,
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
 * Calcula o número de lotes por tipologia
 */
export function calcularLotesPorTipologia(
  areaComercializavel: number,
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
  areMedia: number;
}[] {
  return tipologias.map((tip) => {
    const areaTotal = (areaComercializavel * tip.percentual) / 100;
    const numeroLotes = Math.floor(areaTotal / tip.areaMedia);
    const areaMedia = areaTotal / numeroLotes;

    return {
      tipologia: tip.nome,
      percentual: tip.percentual,
      areaTotal,
      numeroLotes,
      areMedia,
    };
  });
}
