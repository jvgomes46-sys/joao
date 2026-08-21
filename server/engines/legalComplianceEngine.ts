/**
 * Módulo: Conformidade Legal — Lei 6.766/79 (spec seção 2.6).
 *
 * Distinto do checklist GRAPROHAB do GeoEngine (que cobre critérios de
 * aprovação de projeto habitacional) — este é o checklist específico dos
 * mínimos da lei federal de parcelamento do solo (atualizada pelas Leis
 * 9.785/99, 13.465/17 e 14.285/21). IMPORTANTE (spec): isto é o mínimo
 * federal — plano diretor municipal pode ser mais restritivo. Nunca deve
 * ser apresentado como aprovação garantida.
 */

export type StatusConformidadeLegal = "ok" | "rever_atencao" | "nao_verificavel";

export interface ItemConformidadeLegal {
  id: string;
  requisito: string;
  regra: string;
  status: StatusConformidadeLegal;
  valorAtual?: string;
  observacao?: string;
}

export interface LegalComplianceInput {
  areaMediaLoteM2: number; // do GeoEngine

  // Não verificáveis só por área/dado tabular — exigem geometria da planta
  // ou levantamento de campo. Se omitidos, o item fica "não verificável".
  frenteMinimaLoteM?: number;
  declividadeTerrenoPercentual?: number;
  possuiCursoDagua?: boolean;
  faixaNonAedificandiM?: number; // só relevante se possuiCursoDagua = true

  prazoExecucaoObrasMeses?: number;

  infraestruturaBasica?: {
    drenagem: boolean;
    iluminacaoPublica: boolean;
    esgoto: boolean;
    agua: boolean;
    energia: boolean;
    vias: boolean;
  };

  arvoresIsoladasUn?: number;
  autorizacaoArvoresIsoladasObtida?: boolean;

  // Pisos — vêm do Módulo de Configuração (legislação municipal) ou do piso federal
  pisoAreaMinimaLoteM2?: number; // padrão federal: 125
  pisoFrenteMinimaLoteM?: number; // padrão federal: 5
  pisoDeclividadeMaximaPercentual?: number; // padrão federal: 30
  pisoFaixaNonAedificandiM?: number; // padrão federal: 15
  pisoPrazoExecucaoMeses?: number; // padrão federal: 48 (prorrogável +48)
}

export interface LegalComplianceOutput {
  itens: ItemConformidadeLegal[];
  conformidade: boolean; // false se qualquer item está "rever_atencao"
  avisoPisoFederal: string;
}

const AVISO_PISO_FEDERAL =
  "Este checklist reflete o mínimo da Lei Federal 6.766/79 (atualizada pelas Leis 9.785/99, 13.465/17 e 14.285/21). " +
  "O plano diretor municipal pode ser mais restritivo — isto NÃO é uma aprovação garantida.";

export function calcularConformidadeLegal(input: LegalComplianceInput): LegalComplianceOutput {
  const pisoAreaMinimaLoteM2 = input.pisoAreaMinimaLoteM2 ?? 125;
  const pisoFrenteMinimaLoteM = input.pisoFrenteMinimaLoteM ?? 5;
  const pisoDeclividadeMaximaPercentual = input.pisoDeclividadeMaximaPercentual ?? 30;
  const pisoFaixaNonAedificandiM = input.pisoFaixaNonAedificandiM ?? 15;
  const pisoPrazoExecucaoMeses = input.pisoPrazoExecucaoMeses ?? 48;

  const itens: ItemConformidadeLegal[] = [];

  itens.push({
    id: "area_minima_lote",
    requisito: "Área mínima do lote",
    regra: `≥ ${pisoAreaMinimaLoteM2} m²`,
    status: input.areaMediaLoteM2 >= pisoAreaMinimaLoteM2 ? "ok" : "rever_atencao",
    valorAtual: `${input.areaMediaLoteM2.toFixed(2)} m²`,
  });

  itens.push({
    id: "frente_minima_lote",
    requisito: "Frente mínima do lote",
    regra: `≥ ${pisoFrenteMinimaLoteM} m`,
    status:
      input.frenteMinimaLoteM === undefined
        ? "nao_verificavel"
        : input.frenteMinimaLoteM >= pisoFrenteMinimaLoteM
          ? "ok"
          : "rever_atencao",
    valorAtual: input.frenteMinimaLoteM !== undefined ? `${input.frenteMinimaLoteM.toFixed(2)} m` : undefined,
    observacao: input.frenteMinimaLoteM === undefined ? "Exige geometria da planta — checar manualmente" : undefined,
  });

  itens.push({
    id: "declividade_terreno",
    requisito: "Declividade do terreno",
    regra: `< ${pisoDeclividadeMaximaPercentual}%`,
    status:
      input.declividadeTerrenoPercentual === undefined
        ? "nao_verificavel"
        : input.declividadeTerrenoPercentual < pisoDeclividadeMaximaPercentual
          ? "ok"
          : "rever_atencao",
    valorAtual: input.declividadeTerrenoPercentual !== undefined ? `${input.declividadeTerrenoPercentual.toFixed(1)}%` : undefined,
    observacao: input.declividadeTerrenoPercentual === undefined ? "Exige levantamento topográfico — checar manualmente" : undefined,
  });

  itens.push({
    id: "areas_publicas_destinacao",
    requisito: "Áreas públicas / destinação",
    regra: "Conforme plano diretor municipal",
    status: "nao_verificavel",
    observacao: "A lei federal não fixa mais 35% desde a Lei 9.785/99 — validar contra o plano diretor local, não contra um percentual fixo",
  });

  if (input.possuiCursoDagua) {
    itens.push({
      id: "faixa_non_aedificandi",
      requisito: "Faixa non aedificandi (águas)",
      regra: `≥ ${pisoFaixaNonAedificandiM} m cada margem`,
      status:
        input.faixaNonAedificandiM === undefined
          ? "nao_verificavel"
          : input.faixaNonAedificandiM >= pisoFaixaNonAedificandiM
            ? "ok"
            : "rever_atencao",
      valorAtual: input.faixaNonAedificandiM !== undefined ? `${input.faixaNonAedificandiM.toFixed(2)} m` : undefined,
    });
  } else {
    itens.push({
      id: "faixa_non_aedificandi",
      requisito: "Faixa non aedificandi (águas)",
      regra: `≥ ${pisoFaixaNonAedificandiM} m cada margem, se houver curso d'água`,
      status: "ok",
      observacao: "Sem curso d'água identificado no terreno",
    });
  }

  itens.push({
    id: "prazo_execucao_obras",
    requisito: "Prazo de execução das obras",
    regra: `≤ ${pisoPrazoExecucaoMeses} meses (prorrogável +${pisoPrazoExecucaoMeses})`,
    status:
      input.prazoExecucaoObrasMeses === undefined
        ? "nao_verificavel"
        : input.prazoExecucaoObrasMeses <= pisoPrazoExecucaoMeses
          ? "ok"
          : "rever_atencao",
    valorAtual: input.prazoExecucaoObrasMeses !== undefined ? `${input.prazoExecucaoObrasMeses} meses` : undefined,
  });

  if (input.infraestruturaBasica) {
    const faltando = Object.entries(input.infraestruturaBasica)
      .filter(([, presente]) => !presente)
      .map(([chave]) => chave);
    itens.push({
      id: "infraestrutura_basica",
      requisito: "Infraestrutura básica",
      regra: "Drenagem, iluminação, esgoto, água, energia, vias",
      status: faltando.length === 0 ? "ok" : "rever_atencao",
      observacao: faltando.length > 0 ? `Faltando: ${faltando.join(", ")}` : undefined,
    });
  } else {
    itens.push({
      id: "infraestrutura_basica",
      requisito: "Infraestrutura básica",
      regra: "Drenagem, iluminação, esgoto, água, energia, vias",
      status: "nao_verificavel",
      observacao: "Checklist de infraestrutura não informado",
    });
  }

  const arvoresIsoladasUn = input.arvoresIsoladasUn ?? 0;
  itens.push({
    id: "autorizacao_arvores_isoladas",
    requisito: "Autorização de árvores isoladas",
    regra: "Por unidade, via lei municipal — distinto da compensação por supressão em área",
    status:
      arvoresIsoladasUn === 0
        ? "ok"
        : input.autorizacaoArvoresIsoladasObtida === undefined
          ? "nao_verificavel"
          : input.autorizacaoArvoresIsoladasObtida
            ? "ok"
            : "rever_atencao",
    valorAtual: arvoresIsoladasUn > 0 ? `${arvoresIsoladasUn} árvore(s) isolada(s)` : "Nenhuma árvore isolada informada",
  });

  const conformidade = itens.every((i) => i.status !== "rever_atencao");

  return { itens, conformidade, avisoPisoFederal: AVISO_PISO_FEDERAL };
}
