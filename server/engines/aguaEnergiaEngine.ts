/**
 * Módulo: Água e Energia (spec seção 2.3) — dimensionamento técnico
 * simplificado, pré-requisito do CostEngine (alimenta o item "reservatório"
 * do grupo Água e os indicadores de demanda de energia). Motor puro: só
 * recebe os parâmetros já resolvidos (GeoEngine + Módulo de Configuração) e
 * devolve os valores calculados — nenhuma leitura de banco aqui.
 */

export interface AguaEnergiaInput {
  numeroLotes: number;
  taxaOcupacaoHabPorLote: number; // hab/lote

  // Água — conforme AVTO da concessionária
  consumoPerCapitaLDia: number; // q, L/hab.dia — padrão 150
  k1: number; // coeficiente dia de maior consumo — padrão 1.2
  k2: number; // coeficiente hora de maior consumo — padrão 1.5
  diasReservacao: number; // padrão 1

  // Esgoto
  coeficienteRetornoEsgoto: number; // C — padrão 0.8
  k3: number; // coeficiente de vazão mínima — padrão 0.5

  // Energia
  demandaReferenciaKvaPorLote: number; // kVA/lote — padrão vem do Módulo de Configuração
  distanciaConexaoEnergiaM?: number; // distância até o ponto de conexão mais próximo (m)
  custoExtensaoRedeRsPorM?: number; // R$/m — padrão vem do Módulo de Configuração
}

export interface AguaEnergiaOutput {
  // Água
  populacaoEstimada: number;
  consumoMedioDiarioM3: number;
  consumoMaximoDiarioM3: number;
  volumeReservacaoM3: number;
  vazaoMediaLs: number;
  vazaoMaximaDiariaLs: number;
  vazaoMaximaHorariaLs: number;

  // Esgoto
  vazaoMediaEsgotoLs: number;
  vazaoMaximaEsgotoLs: number;
  vazaoMinimaEsgotoLs: number;

  // Energia
  demandaTotalKva: number;
  custoExtensaoRedeEnergiaTotal: number;
}

const SEGUNDOS_POR_DIA = 86_400;

export function calcularAguaEnergia(input: AguaEnergiaInput): AguaEnergiaOutput {
  const populacaoEstimada = input.numeroLotes * input.taxaOcupacaoHabPorLote;
  const consumoMedioDiarioM3 = (populacaoEstimada * input.consumoPerCapitaLDia) / 1000;
  const consumoMaximoDiarioM3 = consumoMedioDiarioM3 * input.k1;
  const volumeReservacaoM3 = consumoMaximoDiarioM3 * input.diasReservacao;

  // m³/dia → L/s
  const vazaoMediaLs = (consumoMedioDiarioM3 * 1000) / SEGUNDOS_POR_DIA;
  const vazaoMaximaDiariaLs = vazaoMediaLs * input.k1;
  const vazaoMaximaHorariaLs = vazaoMaximaDiariaLs * input.k2;

  const vazaoMediaEsgotoLs = vazaoMediaLs * input.coeficienteRetornoEsgoto;
  const vazaoMaximaEsgotoLs = vazaoMaximaDiariaLs * input.coeficienteRetornoEsgoto;
  const vazaoMinimaEsgotoLs = vazaoMediaEsgotoLs * input.k3;

  const demandaTotalKva = input.numeroLotes * input.demandaReferenciaKvaPorLote;
  const custoExtensaoRedeEnergiaTotal = (input.distanciaConexaoEnergiaM ?? 0) * (input.custoExtensaoRedeRsPorM ?? 0);

  return {
    populacaoEstimada,
    consumoMedioDiarioM3,
    consumoMaximoDiarioM3,
    volumeReservacaoM3,
    vazaoMediaLs,
    vazaoMaximaDiariaLs,
    vazaoMaximaHorariaLs,
    vazaoMediaEsgotoLs,
    vazaoMaximaEsgotoLs,
    vazaoMinimaEsgotoLs,
    demandaTotalKva,
    custoExtensaoRedeEnergiaTotal,
  };
}
