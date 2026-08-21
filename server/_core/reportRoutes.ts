import type { Express, Request, Response } from "express";
import { sdk } from "./sdk";
import { generateOnePagerPdf, generateTechnicalReportPdf } from "../services/reportService";

async function sendPdf(res: Response, buffer: Buffer, filename: string) {
  res.setHeader("Content-Type", "application/pdf");
  res.setHeader("Content-Disposition", `attachment; filename="${filename}"`);
  res.send(buffer);
}

function slugify(name: string): string {
  return name
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-zA-Z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .toLowerCase() || "estudo";
}

/**
 * Exportação de PDF (spec 2.12) — servida fora do tRPC porque tRPC não é o
 * transporte adequado para binário grande com Content-Disposition; usa a
 * mesma autenticação por cookie/Bearer do resto da API.
 */
export function registerReportRoutes(app: Express) {
  app.get("/api/reports/:projectId/technical.pdf", async (req: Request, res: Response) => {
    try {
      const user = await sdk.authenticateRequest(req);
      const projectId = Number(req.params.projectId);
      if (!Number.isFinite(projectId)) {
        res.status(400).json({ error: "projectId inválido" });
        return;
      }
      const buffer = await generateTechnicalReportPdf(projectId, user.id);
      await sendPdf(res, buffer, `evte-relatorio-tecnico-${slugify(String(projectId))}.pdf`);
    } catch (error) {
      res.status(error instanceof Error && /não encontrado/.test(error.message) ? 404 : 400).json({
        error: error instanceof Error ? error.message : "Falha ao gerar o relatório técnico",
      });
    }
  });

  app.get("/api/reports/:projectId/one-pager.pdf", async (req: Request, res: Response) => {
    try {
      const user = await sdk.authenticateRequest(req);
      const projectId = Number(req.params.projectId);
      if (!Number.isFinite(projectId)) {
        res.status(400).json({ error: "projectId inválido" });
        return;
      }
      const buffer = await generateOnePagerPdf(projectId, user.id);
      await sendPdf(res, buffer, `evte-one-pager-${slugify(String(projectId))}.pdf`);
    } catch (error) {
      res.status(error instanceof Error && /não encontrado/.test(error.message) ? 404 : 400).json({
        error: error instanceof Error ? error.message : "Falha ao gerar o one-pager",
      });
    }
  });
}
