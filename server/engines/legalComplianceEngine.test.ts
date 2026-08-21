import { describe, expect, it } from "vitest";
import { calcularConformidadeLegal } from "./legalComplianceEngine";

function findItem(itens: ReturnType<typeof calcularConformidadeLegal>["itens"], id: string) {
  const item = itens.find((i) => i.id === id);
  if (!item) throw new Error(`Item ${id} não encontrado`);
  return item;
}

describe("legalComplianceEngine (spec seção 2.6 — Lei 6.766/79)", () => {
  it("área mínima do lote: ok quando >= 125m² (piso federal)", () => {
    const output = calcularConformidadeLegal({ areaMediaLoteM2: 200 });
    expect(findItem(output.itens, "area_minima_lote").status).toBe("ok");
  });

  it("área mínima do lote: rever_atencao quando < 125m²", () => {
    const output = calcularConformidadeLegal({ areaMediaLoteM2: 100 });
    expect(findItem(output.itens, "area_minima_lote").status).toBe("rever_atencao");
    expect(output.conformidade).toBe(false);
  });

  it("frente mínima e declividade ficam não_verificável quando não informados (exigem geometria/topografia)", () => {
    const output = calcularConformidadeLegal({ areaMediaLoteM2: 200 });
    expect(findItem(output.itens, "frente_minima_lote").status).toBe("nao_verificavel");
    expect(findItem(output.itens, "declividade_terreno").status).toBe("nao_verificavel");
  });

  it("declividade: rever_atencao quando >= 30%", () => {
    const output = calcularConformidadeLegal({ areaMediaLoteM2: 200, declividadeTerrenoPercentual: 35 });
    expect(findItem(output.itens, "declividade_terreno").status).toBe("rever_atencao");
  });

  it("faixa non aedificandi: ok automaticamente quando não há curso d'água", () => {
    const output = calcularConformidadeLegal({ areaMediaLoteM2: 200, possuiCursoDagua: false });
    expect(findItem(output.itens, "faixa_non_aedificandi").status).toBe("ok");
  });

  it("faixa non aedificandi: rever_atencao quando há curso d'água e a faixa é insuficiente", () => {
    const output = calcularConformidadeLegal({ areaMediaLoteM2: 200, possuiCursoDagua: true, faixaNonAedificandiM: 10 });
    expect(findItem(output.itens, "faixa_non_aedificandi").status).toBe("rever_atencao");
  });

  it("prazo de execução: rever_atencao quando > 48 meses", () => {
    const output = calcularConformidadeLegal({ areaMediaLoteM2: 200, prazoExecucaoObrasMeses: 60 });
    expect(findItem(output.itens, "prazo_execucao_obras").status).toBe("rever_atencao");
  });

  it("infraestrutura básica: lista o que está faltando", () => {
    const output = calcularConformidadeLegal({
      areaMediaLoteM2: 200,
      infraestruturaBasica: { drenagem: true, iluminacaoPublica: false, esgoto: true, agua: true, energia: true, vias: true },
    });
    const item = findItem(output.itens, "infraestrutura_basica");
    expect(item.status).toBe("rever_atencao");
    expect(item.observacao).toContain("iluminacaoPublica");
  });

  it("árvores isoladas: ok quando não há nenhuma; não_verificável quando há mas autorização não foi informada", () => {
    const semArvores = calcularConformidadeLegal({ areaMediaLoteM2: 200, arvoresIsoladasUn: 0 });
    expect(findItem(semArvores.itens, "autorizacao_arvores_isoladas").status).toBe("ok");

    const comArvoresSemInfo = calcularConformidadeLegal({ areaMediaLoteM2: 200, arvoresIsoladasUn: 3 });
    expect(findItem(comArvoresSemInfo.itens, "autorizacao_arvores_isoladas").status).toBe("nao_verificavel");

    const comArvoresAutorizadas = calcularConformidadeLegal({
      areaMediaLoteM2: 200,
      arvoresIsoladasUn: 3,
      autorizacaoArvoresIsoladasObtida: true,
    });
    expect(findItem(comArvoresAutorizadas.itens, "autorizacao_arvores_isoladas").status).toBe("ok");
  });

  it("áreas públicas/destinação é sempre não_verificável — depende do plano diretor, não de um percentual fixo", () => {
    const output = calcularConformidadeLegal({ areaMediaLoteM2: 200 });
    const item = findItem(output.itens, "areas_publicas_destinacao");
    expect(item.status).toBe("nao_verificavel");
    expect(item.observacao).toMatch(/plano diretor/);
  });

  it("conformidade geral é true quando nenhum item está rever_atencao (mesmo com itens não_verificável)", () => {
    const output = calcularConformidadeLegal({ areaMediaLoteM2: 200 });
    expect(output.itens.some((i) => i.status === "nao_verificavel")).toBe(true);
    expect(output.itens.some((i) => i.status === "rever_atencao")).toBe(false);
    expect(output.conformidade).toBe(true);
  });

  it("sempre inclui o aviso de que é só o piso federal", () => {
    const output = calcularConformidadeLegal({ areaMediaLoteM2: 200 });
    expect(output.avisoPisoFederal).toMatch(/mínimo/i);
    expect(output.avisoPisoFederal).toMatch(/plano diretor/i);
  });
});
