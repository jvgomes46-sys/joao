import PDFDocument from "pdfkit";
import {
  getCostEngineDataByProjectId,
  getFinanceEngineDataByProjectId,
  getGeoEngineDataByProjectId,
  getProjectById,
  getSalesEngineDataByProjectId,
  getScenariosByProjectId,
  getTaxEngineDataByProjectId,
} from "../db";
import { getDashboardData } from "./dashboardService";
import { getLegalComplianceChecklist } from "./legalComplianceService";
import type { FinanceMonthRow } from "../engines/financeEngine";
import type { CostItem } from "../engines/costEngine";
import type { AguaEnergiaOutput } from "../engines/aguaEnergiaEngine";
import type { ApprovalCostOutput } from "../engines/approvalCostEngine";

const GRUPO_APROVACAO_LABELS: Record<string, string> = {
  levantamentos: "A. Levantamentos e Projetos",
  ambiental: "B. Licenciamento Ambiental",
  taxas_oficiais: "C. Taxas Oficiais",
  concessionarias: "D. Concessionárias",
};

// Identidade visual MO Global (Manual de Diretrizes) — spec seção 2.12
const NAVY = "#14355E";
const GOLD = "#E9C469";
const GRAY = "#6B7280";
const LIGHT_GRAY = "#F3F4F6";
const RED = "#B91C1C";
const GREEN = "#15803D";

const currency = (v: number) =>
  v.toLocaleString("pt-BR", { style: "currency", currency: "BRL", maximumFractionDigits: 0 });
const percent = (v: number) => `${(v * 100).toLocaleString("pt-BR", { maximumFractionDigits: 1 })}%`;
const number0 = (v: number) => v.toLocaleString("pt-BR", { maximumFractionDigits: 0 });

const GRUPO_LABELS: Record<string, string> = {
  terraplenagem: "Terraplenagem",
  drenagem: "Drenagem",
  pavimentacao: "Pavimentação",
  agua: "Água",
  esgoto: "Esgoto",
  energia: "Energia",
  obras_civis_condominio: "Obras Civis / Condomínio",
  servicos_complementares: "Serviços Complementares",
};

function pdfToBuffer(doc: PDFKit.PDFDocument): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    doc.on("data", (chunk) => chunks.push(chunk));
    doc.on("end", () => resolve(Buffer.concat(chunks)));
    doc.on("error", reject);
    doc.end();
  });
}

function drawHeader(doc: PDFKit.PDFDocument, title: string, subtitle: string) {
  doc.rect(0, 0, doc.page.width, 90).fill(NAVY);
  doc
    .fillColor("#FFFFFF")
    .fontSize(20)
    .font("Helvetica-Bold")
    .text(title, 40, 28, { width: doc.page.width - 80 });
  doc
    .fillColor(GOLD)
    .fontSize(11)
    .font("Helvetica")
    .text(subtitle, 40, 56, { width: doc.page.width - 80 });
  doc.fillColor("#000000");
  doc.y = 110;
}

function drawSectionTitle(doc: PDFKit.PDFDocument, text: string) {
  doc.moveDown(0.5);
  doc.fontSize(14).font("Helvetica-Bold").fillColor(NAVY).text(text);
  doc
    .moveTo(doc.x, doc.y + 2)
    .lineTo(doc.page.width - 40, doc.y + 2)
    .strokeColor(GOLD)
    .lineWidth(2)
    .stroke();
  doc.moveDown(0.5);
  doc.fillColor("#000000").font("Helvetica").fontSize(10);
}

function drawKeyValueRow(doc: PDFKit.PDFDocument, label: string, value: string, opts?: { tone?: "positive" | "negative" }) {
  const startX = doc.x;
  const y = doc.y;
  doc.font("Helvetica").fontSize(10).fillColor(GRAY).text(label, startX, y, { continued: false });
  const color = opts?.tone === "positive" ? GREEN : opts?.tone === "negative" ? RED : "#000000";
  doc
    .font("Helvetica-Bold")
    .fontSize(10)
    .fillColor(color)
    .text(value, startX + 260, y, { width: doc.page.width - 80 - 260, align: "right" });
  doc.fillColor("#000000");
  doc.moveDown(0.35);
}

function drawTable(
  doc: PDFKit.PDFDocument,
  headers: string[],
  rows: string[][],
  colWidths: number[],
  opts?: { align?: ("left" | "right")[] }
) {
  const startX = doc.x;
  const rowHeight = 18;
  const align = opts?.align ?? headers.map(() => "left" as const);

  function ensureSpace(needed: number) {
    if (doc.y + needed > doc.page.height - 50) {
      doc.addPage();
      doc.y = 40;
    }
  }

  ensureSpace(rowHeight);
  let x = startX;
  doc.font("Helvetica-Bold").fontSize(9).fillColor("#FFFFFF");
  doc.rect(startX, doc.y, colWidths.reduce((a, b) => a + b, 0), rowHeight).fill(NAVY);
  doc.fillColor("#FFFFFF");
  const headerY = doc.y + 4;
  headers.forEach((h, i) => {
    doc.text(h, x + 4, headerY, { width: colWidths[i] - 8, align: align[i] });
    x += colWidths[i];
  });
  doc.y += rowHeight;
  doc.fillColor("#000000").font("Helvetica").fontSize(9);

  rows.forEach((row, rIdx) => {
    ensureSpace(rowHeight);
    const y = doc.y;
    if (rIdx % 2 === 1) {
      doc.rect(startX, y, colWidths.reduce((a, b) => a + b, 0), rowHeight).fill(LIGHT_GRAY);
      doc.fillColor("#000000");
    }
    x = startX;
    row.forEach((cell, i) => {
      doc.text(cell, x + 4, y + 4, { width: colWidths[i] - 8, align: align[i] });
      x += colWidths[i];
    });
    doc.y = y + rowHeight;
  });
  doc.moveDown(0.5);
}

async function loadFullProjectData(projectId: number, userId: number) {
  const dashboard = await getDashboardData(projectId, userId);
  const [project, geo, cost, sales, finance, tax, scenarios] = await Promise.all([
    getProjectById(projectId, userId),
    getGeoEngineDataByProjectId(projectId),
    getCostEngineDataByProjectId(projectId),
    getSalesEngineDataByProjectId(projectId),
    getFinanceEngineDataByProjectId(projectId),
    getTaxEngineDataByProjectId(projectId),
    getScenariosByProjectId(projectId),
  ]);
  if (!project) throw new Error("Projeto não encontrado ou não pertence ao usuário");
  return { dashboard, project, geo, cost, sales, finance, tax, scenarios };
}

/**
 * Exportação "one-pager" executivo (spec 2.12) — o equivalente ao PPTX de
 * apresentação para investidor/comitê, gerado direto dos dados já
 * calculados/persistidos (sem repetir números manualmente em outro arquivo).
 */
export async function generateOnePagerPdf(projectId: number, userId: number): Promise<Buffer> {
  const { dashboard } = await loadFullProjectData(projectId, userId);

  const doc = new PDFDocument({ size: "A4", margins: { top: 0, bottom: 40, left: 40, right: 40 } });
  drawHeader(doc, dashboard.projectName, "Resumo Executivo — Estudo de Viabilidade (EVTE)");

  doc.x = 40;
  doc.y = 110;

  const vplPositivo = dashboard.vpl >= 0;
  doc
    .rect(40, doc.y, doc.page.width - 80, 34)
    .fill(vplPositivo ? "#DCFCE7" : "#FEE2E2");
  doc
    .fillColor(vplPositivo ? GREEN : RED)
    .font("Helvetica-Bold")
    .fontSize(12)
    .text(
      vplPositivo ? "PROJETO VIÁVEL — VPL positivo na TMA considerada" : "PROJETO NÃO VIÁVEL — VPL negativo na TMA considerada",
      50,
      doc.y + 10
    );
  doc.fillColor("#000000");
  doc.y += 46;

  drawSectionTitle(doc, "Indicadores Principais");
  const kpiCols = 2;
  const kpis: [string, string, "positive" | "negative" | undefined][] = [
    ["VGV Total", currency(dashboard.vgvTotal), undefined],
    ["VGV do Incorporador", currency(dashboard.vgvIncorporador), undefined],
    ["CAPEX Total", currency(dashboard.capexTotal), undefined],
    ["CAPEX / VGV", percent(dashboard.capexSobreVgv), undefined],
    ["Lucro Líquido", currency(dashboard.lucroLiquido), dashboard.lucroLiquido >= 0 ? "positive" : "negative"],
    ["Margem sobre Receita", percent(dashboard.margemSobreReceitaRealizada), undefined],
    ["ROI sobre CAPEX", percent(dashboard.roiSobreCapex), undefined],
    ["Exposição Máxima de Caixa", currency(dashboard.exposicaoMaximaCaixa), "negative"],
    ["VPL", currency(dashboard.vpl), vplPositivo ? "positive" : "negative"],
    [
      "TIR (a.a. / a.m.)",
      dashboard.tirAnual !== null ? `${percent(dashboard.tirAnual)} / ${percent(dashboard.tirMensal ?? 0)}` : (dashboard.tirIndisponivelMotivo ?? "Indisponível"),
      undefined,
    ],
    ["Payback", dashboard.paybackMes !== null ? `${dashboard.paybackMes} meses` : "Não paga no horizonte", dashboard.paybackMes !== null ? undefined : "negative"],
  ];
  const colWidth = (doc.page.width - 80) / kpiCols;
  kpis.forEach((_, idx) => {
    if (idx % kpiCols === 0) doc.x = 40;
  });
  for (let i = 0; i < kpis.length; i += kpiCols) {
    const rowY = doc.y;
    for (let c = 0; c < kpiCols; c++) {
      const item = kpis[i + c];
      if (!item) continue;
      const [label, value, tone] = item;
      const cx = 40 + c * colWidth;
      doc.font("Helvetica").fontSize(9).fillColor(GRAY).text(label, cx, rowY, { width: colWidth - 10 });
      const color = tone === "positive" ? GREEN : tone === "negative" ? RED : "#000000";
      doc.font("Helvetica-Bold").fontSize(12).fillColor(color).text(value, cx, rowY + 12, { width: colWidth - 10 });
    }
    doc.fillColor("#000000");
    doc.y = rowY + 34;
  }

  drawSectionTitle(doc, "Composição do CAPEX por Disciplina");
  if (dashboard.composicaoCapexPorDisciplina.length > 0) {
    drawTable(
      doc,
      ["Disciplina", "Valor (R$)", "% do CAPEX"],
      dashboard.composicaoCapexPorDisciplina.map((c) => [
        GRUPO_LABELS[c.grupo] ?? c.grupo,
        currency(c.valor),
        `${c.percentual.toFixed(1)}%`,
      ]),
      [260, 155, 95],
      { align: ["left", "right", "right"] }
    );
  } else {
    doc.fontSize(10).fillColor(GRAY).text("Nenhum item de custo ativo.");
  }

  drawSectionTitle(doc, "DRE Resumido");
  const dre = dashboard.dreResumido;
  drawKeyValueRow(doc, "Receita Bruta", currency(dre.receitaBrutaTotal));
  drawKeyValueRow(doc, "(-) Deduções sobre Venda", `(${currency(dre.deducoesTotal)})`);
  drawKeyValueRow(doc, "= Receita Líquida", currency(dre.receitaLiquidaTotal));
  drawKeyValueRow(doc, "(-) Custo de Aprovações", `(${currency(dre.aprovacoesTotal)})`);
  drawKeyValueRow(doc, "(-) Custo de Obra", `(${currency(dre.obraTotal)})`);
  drawKeyValueRow(doc, "= Lucro Líquido", currency(dre.lucroLiquido), {
    tone: dre.lucroLiquido >= 0 ? "positive" : "negative",
  });

  if (dashboard.alertas.length > 0) {
    drawSectionTitle(doc, "Alertas de Consistência");
    dashboard.alertas.forEach((alerta) => {
      doc.fontSize(9).fillColor(RED).text(`• ${alerta}`, { width: doc.page.width - 80 });
    });
    doc.fillColor("#000000");
  }

  return pdfToBuffer(doc);
}

/**
 * Exportação técnica completa (spec 2.12) — cobre GeoEngine, CostEngine,
 * SalesEngine, FinanceEngine, TaxEngine e Cenários com o mesmo nível de
 * detalhe usado internamente pelo sistema, para o comitê técnico.
 */
export async function generateTechnicalReportPdf(projectId: number, userId: number): Promise<Buffer> {
  const { dashboard, project, geo, cost, sales, finance, tax, scenarios } = await loadFullProjectData(projectId, userId);
  const legalCompliance = await getLegalComplianceChecklist(projectId, userId).catch(() => null);

  const doc = new PDFDocument({ size: "A4", margins: { top: 0, bottom: 40, left: 40, right: 40 } });
  drawHeader(doc, project.name, "Estudo de Viabilidade Técnico-Econômica (EVTE) — Relatório Completo");
  doc.x = 40;
  doc.y = 110;

  doc.fontSize(9).fillColor(GRAY).text(`Localização: ${project.location ?? "não informada"}`);
  doc.text(`Tipo: ${project.type}   •   Emitido em: ${new Date().toLocaleDateString("pt-BR")}`);
  doc.fillColor("#000000");
  doc.moveDown(0.5);

  // --- GeoEngine ---
  if (geo) {
    drawSectionTitle(doc, "1. GeoEngine — Urbanístico");
    drawKeyValueRow(doc, "Área Bruta", `${number0(Number(geo.areaBruta ?? 0))} m²`);
    drawKeyValueRow(doc, "Área Líquida", `${number0(Number(geo.areaLiquida ?? 0))} m²`);
    drawKeyValueRow(doc, "Área Vendável", `${number0(Number(geo.areaVendavel ?? 0))} m²`);
    drawKeyValueRow(doc, "Área Institucional", `${number0(Number(geo.areaInstitucional ?? 0))} m²`);
    drawKeyValueRow(doc, "Área Verde", `${number0(Number(geo.areaVerde ?? 0))} m²`);
    drawKeyValueRow(doc, "Área de Preservação Permanente (APP)", `${number0(Number(geo.areaAPP ?? 0))} m²`);
    drawKeyValueRow(doc, "Sistema Viário", `${number0(Number(geo.sistemaViario ?? 0))} m²`);
    drawKeyValueRow(doc, "Eficiência Urbanística", `${Number(geo.eficienciaUrbanistica ?? 0).toFixed(1)}%`);
    drawKeyValueRow(doc, "Número de Lotes", number0(geo.numeroLotes ?? 0));
    drawKeyValueRow(doc, "Densidade", `${Number(geo.densidade ?? 0).toFixed(1)} hab/ha`);
  }

  // --- Conformidade Legal (Lei 6.766/79) ---
  if (legalCompliance) {
    drawSectionTitle(doc, "1b. Conformidade Legal — Lei 6.766/79");
    doc.fontSize(8).fillColor(GRAY).text(legalCompliance.avisoPisoFederal, { width: doc.page.width - 80 });
    doc.fillColor("#000000").moveDown(0.3);
    const STATUS_LABELS: Record<string, string> = { ok: "OK", rever_atencao: "REVER/ATENÇÃO", nao_verificavel: "N/V" };
    drawTable(
      doc,
      ["Requisito", "Regra", "Status", "Valor Atual"],
      legalCompliance.itens.map((i) => [i.requisito, i.regra, STATUS_LABELS[i.status], i.valorAtual ?? i.observacao ?? "-"]),
      [130, 175, 80, 105],
      { align: ["left", "left", "left", "left"] }
    );
  }

  // --- CostEngine ---
  if (cost) {
    drawSectionTitle(doc, "2. CostEngine — Orçamento Parametrizado");
    drawKeyValueRow(doc, "Investimento Total (CAPEX)", currency(Number(cost.investimentoTotal ?? 0)));
    drawKeyValueRow(doc, "Valor por Hectare", currency(Number(cost.valorPorHectare ?? 0)));
    drawKeyValueRow(doc, "Valor por m²", currency(Number(cost.valorPorM2 ?? 0)));
    drawKeyValueRow(doc, "Valor por Lote", currency(Number(cost.valorPorLote ?? 0)));

    const itens = (cost.detalhamentoItens as CostItem[] | null) ?? [];
    const ativos = itens.filter((i) => i.ativo);
    if (ativos.length > 0) {
      doc.moveDown(0.3);
      doc.fontSize(10).font("Helvetica-Bold").text("Detalhamento por Item (itens ativos):");
      doc.font("Helvetica");
      drawTable(
        doc,
        ["Item", "Grupo", "Qtd.", "Unid.", "Custo Unit.", "Total"],
        ativos.map((i) => [
          i.itemCodigo,
          GRUPO_LABELS[i.grupo] ?? i.grupo,
          number0(i.quantidade),
          i.unidade,
          currency(i.custoUnitario),
          currency(i.total),
        ]),
        [90, 130, 55, 55, 85, 95],
        { align: ["left", "left", "right", "left", "right", "right"] }
      );
    }

    const dimensionamento = cost.dimensionamentoAguaEnergia as AguaEnergiaOutput | null;
    if (dimensionamento) {
      doc.moveDown(0.3);
      doc.fontSize(10).font("Helvetica-Bold").text("Dimensionamento Técnico — Água e Energia (módulo 2.3):");
      doc.font("Helvetica");
      drawKeyValueRow(doc, "População Estimada", `${number0(dimensionamento.populacaoEstimada)} hab`);
      drawKeyValueRow(doc, "Volume de Reservação", `${number0(dimensionamento.volumeReservacaoM3)} m³`);
      drawKeyValueRow(doc, "Vazão Máxima Horária (água)", `${dimensionamento.vazaoMaximaHorariaLs.toFixed(2)} L/s`);
      drawKeyValueRow(doc, "Vazão Máxima de Esgoto", `${dimensionamento.vazaoMaximaEsgotoLs.toFixed(2)} L/s`);
      drawKeyValueRow(doc, "Demanda Total de Energia", `${number0(dimensionamento.demandaTotalKva)} kVA`);
      if (dimensionamento.custoExtensaoRedeEnergiaTotal > 0) {
        drawKeyValueRow(doc, "Custo de Extensão de Rede (energia)", currency(dimensionamento.custoExtensaoRedeEnergiaTotal));
      }
    }

    const aprovacoes = cost.detalhamentoAprovacoes as ApprovalCostOutput | null;
    if (aprovacoes && aprovacoes.itens.length > 0) {
      doc.moveDown(0.3);
      doc.fontSize(10).font("Helvetica-Bold").text("Aprovações e Projetos (módulo 2.5) — calculado por m² de gleba:");
      doc.font("Helvetica");
      drawTable(
        doc,
        ["Item", "Grupo", "Índice", "Total"],
        aprovacoes.itens.map((i) => [
          i.descricao,
          GRUPO_APROVACAO_LABELS[i.grupo] ?? i.grupo,
          i.base === "area_gleba" ? `R$ ${i.indice.toFixed(2)}/m²` : "verba",
          i.ativo ? currency(i.total) : "— zerado",
        ]),
        [200, 130, 90, 90],
        { align: ["left", "left", "right", "right"] }
      );
      drawKeyValueRow(doc, "TOTAL DE APROVAÇÕES E PROJETOS", currency(aprovacoes.custoAprovacoesTotal));
      drawKeyValueRow(doc, "Custo de aprovação por m² de gleba", `R$ ${aprovacoes.custoPorM2Gleba.toFixed(2)}/m²`);
    }
  }

  // --- SalesEngine ---
  if (sales) {
    drawSectionTitle(doc, "3. SalesEngine — Comercial");
    drawKeyValueRow(doc, "VGV", currency(Number(sales.vgv ?? 0)));
    drawKeyValueRow(doc, "Preço Médio por m²", currency(Number(sales.precoMedioM2 ?? 0)));
    drawKeyValueRow(doc, "Custos de Vendas", currency(Number(sales.custoVendas ?? 0)));
    drawKeyValueRow(doc, "Inadimplência", `${Number(sales.inadimplencia ?? 0).toFixed(1)}%`);
  }

  // --- FinanceEngine ---
  if (finance) {
    drawSectionTitle(doc, "4. FinanceEngine — Fluxo de Caixa e Indicadores");
    drawKeyValueRow(doc, "VPL", currency(Number(finance.vpl ?? 0)), {
      tone: Number(finance.vpl ?? 0) >= 0 ? "positive" : "negative",
    });
    drawKeyValueRow(
      doc,
      "TIR a.a. / a.m.",
      finance.tir !== null ? `${Number(finance.tir).toFixed(2)}% / ${Number(finance.tirMensal ?? 0).toFixed(2)}%` : (finance.tirIndisponivelMotivo ?? "Indisponível")
    );
    drawKeyValueRow(doc, "Payback", finance.payback !== null ? `${Number(finance.payback).toFixed(0)} meses` : "Não paga no horizonte");
    drawKeyValueRow(doc, "ROI sobre CAPEX", `${Number(finance.roi ?? 0).toFixed(1)}%`);
    drawKeyValueRow(doc, "Exposição Máxima de Caixa", currency(Number(finance.exposicaoMaximaCaixa ?? 0)));
    drawKeyValueRow(doc, "Lucro Total", currency(Number(finance.lucroTotal ?? 0)));
    drawKeyValueRow(doc, "Margem de Lucro", `${Number(finance.margemLucro ?? 0).toFixed(1)}%`);
    drawKeyValueRow(doc, "TMA Utilizada", `${Number(finance.tmaUtilizada ?? 0).toFixed(1)}% a.a.`);

    const fluxo = (finance.fluxoCaixaMensal as FinanceMonthRow[] | null) ?? [];
    if (fluxo.length > 0) {
      // Resumo anual — o mensal completo tem até 120 linhas, longo demais para o relatório impresso.
      const porAno = new Map<number, { receitaBruta: number; custoObra: number; fluxoLiquido: number }>();
      fluxo.forEach((row) => {
        const ano = Math.floor((row.mes - 1) / 12) + 1;
        const acc = porAno.get(ano) ?? { receitaBruta: 0, custoObra: 0, fluxoLiquido: 0 };
        acc.receitaBruta += row.receitaBruta;
        acc.custoObra += row.custoObra;
        acc.fluxoLiquido += row.fluxoLiquido;
        porAno.set(ano, acc);
      });
      doc.moveDown(0.3);
      doc.fontSize(10).font("Helvetica-Bold").text("Fluxo de Caixa — Resumo Anual:");
      doc.font("Helvetica");
      drawTable(
        doc,
        ["Ano", "Receita Bruta", "Custo de Obra", "Fluxo Líquido"],
        Array.from(porAno.entries()).map(([ano, v]) => [
          `Ano ${ano}`,
          currency(v.receitaBruta),
          currency(v.custoObra),
          currency(v.fluxoLiquido),
        ]),
        [80, 140, 140, 140],
        { align: ["left", "right", "right", "right"] }
      );
    }

    const alertas = (finance.alertasConsistencia as string[] | null) ?? [];
    if (alertas.length > 0) {
      doc.moveDown(0.3);
      doc.fontSize(10).font("Helvetica-Bold").text("Alertas de Consistência:");
      doc.font("Helvetica").fontSize(9);
      alertas.forEach((a) => doc.fillColor(RED).text(`• ${a}`, { width: doc.page.width - 80 }));
      doc.fillColor("#000000").fontSize(10);
    }
  }

  // --- TaxEngine ---
  if (tax) {
    drawSectionTitle(doc, "5. TaxEngine — Tributário");
    drawKeyValueRow(doc, "Regime Tributário", tax.regimeTributario.replace("_", " ").toUpperCase());
    drawKeyValueRow(doc, "Impostos Totais", currency(Number(tax.impostosTotais ?? 0)));
    if (tax.patrimonioAfetacao) drawKeyValueRow(doc, "Patrimônio de Afetação", "Sim");
    doc.fontSize(8).fillColor(GRAY).text(
      "Regime simplificado/educacional — não substitui parecer contábil/tributário específico.",
      { width: doc.page.width - 80 }
    );
    doc.fillColor("#000000").fontSize(10);
  }

  // --- Cenários ---
  if (scenarios && scenarios.length > 0) {
    drawSectionTitle(doc, "6. Cenários (Conservador / Realista / Otimista)");
    doc.fontSize(9).fillColor(GRAY).text(
      "Valores nominais para análise de sensibilidade — o veredito de viabilidade continua sendo o VPL do FinanceEngine (seção 4).",
      { width: doc.page.width - 80 }
    );
    doc.fillColor("#000000").moveDown(0.3);
    drawTable(
      doc,
      ["Cenário", "Variação VGV", "Variação Custos"],
      scenarios.map((s) => [s.nome, `${Number(s.variacaoVGV ?? 0).toFixed(1)}%`, `${Number(s.variacaoCustos ?? 0).toFixed(1)}%`]),
      [180, 160, 160],
      { align: ["left", "right", "right"] }
    );
  }

  doc.fontSize(8).fillColor(GRAY).moveDown(1);
  doc.text(
    `Relatório gerado automaticamente pelo EVTE PRO a partir dos dados calculados e persistidos do estudo "${dashboard.projectName}". Nenhum número foi digitado manualmente.`,
    { width: doc.page.width - 80 }
  );

  return pdfToBuffer(doc);
}
