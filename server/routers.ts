import { COOKIE_NAME } from "@shared/const";
import { getSessionCookieOptions } from "./_core/cookies";
import { systemRouter } from "./_core/systemRouter";
import { publicProcedure, protectedProcedure, router } from "./_core/trpc";
import { z } from "zod";
import {
  getProjectsByUserId,
  getProjectById,
  createProject,
  updateProject,
  deleteProject,
  getGeoEngineDataByProjectId,
  getCostEngineDataByProjectId,
  upsertCostEngineData,
  getSalesEngineDataByProjectId,
  upsertSalesEngineData,
  getFinanceEngineDataByProjectId,
  upsertFinanceEngineData,
  getTaxEngineDataByProjectId,
  upsertTaxEngineData,
  getScenariosByProjectId,
  getPartnershipAnalysisByProjectId,
} from "./db";
import { runGeoEngine } from "./services/geoEngineService";
import { runCostEngine } from "./services/costEngineService";
import { runFinanceEngine } from "./services/financeEngineService";
import { runSalesEngine } from "./services/salesEngineService";
import { runTaxEngine } from "./services/taxEngineService";
import { runScenarioEngine } from "./services/scenarioEngineService";
import { getDashboardData } from "./services/dashboardService";
import { TRPCError } from "@trpc/server";

/** Garante que o projeto existe e pertence ao usuário antes de ler/gravar dados de um motor. */
async function requireOwnedProject(projectId: number, userId: number) {
  const project = await getProjectById(projectId, userId);
  if (!project) {
    throw new TRPCError({ code: "NOT_FOUND", message: "Projeto não encontrado" });
  }
  return project;
}

export const appRouter = router({
  // if you need to use socket.io, read and register route in server/_core/index.ts, all api should start with '/api/' so that the gateway can route correctly
  system: systemRouter,
  auth: router({
    me: publicProcedure.query(opts => opts.ctx.user),
    logout: publicProcedure.mutation(({ ctx }) => {
      const cookieOptions = getSessionCookieOptions(ctx.req);
      ctx.res.clearCookie(COOKIE_NAME, { ...cookieOptions, maxAge: -1 });
      return {
        success: true,
      } as const;
    }),
  }),

  projects: router({
    list: protectedProcedure.query(async ({ ctx }) => {
      return await getProjectsByUserId(ctx.user.id);
    }),

    get: protectedProcedure
      .input(z.object({ id: z.number() }))
      .query(async ({ ctx, input }) => {
        const project = await getProjectById(input.id, ctx.user.id);
        if (!project) {
          throw new TRPCError({
            code: "NOT_FOUND",
            message: "Projeto não encontrado",
          });
        }
        return project;
      }),

    create: protectedProcedure
      .input(
        z.object({
          name: z.string().min(1, "Nome do projeto é obrigatório").max(255),
          description: z.string().optional(),
          type: z.enum(["loteamento", "condominio", "incorporacao"]),
          location: z.string().optional(),
        })
      )
      .mutation(async ({ ctx, input }) => {
        const result = await createProject({
          userId: ctx.user.id,
          name: input.name,
          description: input.description,
          type: input.type,
          location: input.location,
          status: "rascunho",
        });
        return result;
      }),

    update: protectedProcedure
      .input(
        z.object({
          id: z.number(),
          name: z.string().min(1).max(255).optional(),
          description: z.string().optional(),
          type: z.enum(["loteamento", "condominio", "incorporacao"]).optional(),
          location: z.string().optional(),
          status: z.enum(["rascunho", "em_analise", "finalizado", "arquivado"]).optional(),
        })
      )
      .mutation(async ({ ctx, input }) => {
        const { id, ...data } = input;
        const project = await getProjectById(id, ctx.user.id);
        if (!project) {
          throw new TRPCError({
            code: "NOT_FOUND",
            message: "Projeto não encontrado",
          });
        }
        const result = await updateProject(id, ctx.user.id, data);
        return result;
      }),

    delete: protectedProcedure
      .input(z.object({ id: z.number() }))
      .mutation(async ({ ctx, input }) => {
        const project = await getProjectById(input.id, ctx.user.id);
        if (!project) {
          throw new TRPCError({
            code: "NOT_FOUND",
            message: "Projeto não encontrado",
          });
        }
        const result = await deleteProject(input.id, ctx.user.id);
        return { success: true };
      }),
  }),

  geoEngine: router({
    getByProjectId: protectedProcedure
      .input(z.object({ projectId: z.number() }))
      .query(async ({ ctx, input }) => {
        const project = await getProjectById(input.projectId, ctx.user.id);
        if (!project) {
          throw new TRPCError({ code: "NOT_FOUND", message: "Projeto não encontrado" });
        }
        return await getGeoEngineDataByProjectId(input.projectId);
      }),

    calculate: protectedProcedure
      .input(
        z.object({
          projectId: z.number(),
          areaBruta: z.number().positive(),
          areaAPP: z.number().min(0).optional(),
          percentualVerde: z.number().min(0).max(100).optional(),
          percentualInstitucional: z.number().min(0).max(100).optional(),
          percentualSistemaViario: z.number().min(0).max(100).optional(),
          percentualCalcadas: z.number().min(0).max(100).optional(),
          modoLotes: z.enum(["automatico", "manual"]).optional(),
          areaMediaLoteAlvo: z.number().positive().optional(),
          numeroLotesManual: z.number().int().positive().optional(),
          taxaOcupacaoHabPorLote: z.number().positive().optional(),
          coeficienteAproveitamento: z.number().positive().optional(),
          taxaOcupacao: z.number().min(0).max(100).optional(),
          gabarito: z.number().positive().optional(),
        })
      )
      .mutation(async ({ ctx, input }) => {
        const { projectId, ...geoInput } = input;
        try {
          return await runGeoEngine(projectId, ctx.user.id, geoInput);
        } catch (error) {
          throw new TRPCError({
            code: "BAD_REQUEST",
            message: error instanceof Error ? error.message : "Falha ao calcular GeoEngine",
          });
        }
      }),
  }),

  // CostEngine, SalesEngine, FinanceEngine e TaxEngine já são motores reais
  // (ver `calculate` em cada router abaixo); `save` continua disponível em
  // cada um como gravação manual/override simples, sem rodar a lógica
  // condicional completa.
  costEngine: router({
    getByProjectId: protectedProcedure
      .input(z.object({ projectId: z.number() }))
      .query(async ({ ctx, input }) => {
        await requireOwnedProject(input.projectId, ctx.user.id);
        return await getCostEngineDataByProjectId(input.projectId);
      }),

    save: protectedProcedure
      .input(
        z.object({
          projectId: z.number(),
          terraplanagem: z.number().optional(),
          pavimentacao: z.number().optional(),
          agua: z.number().optional(),
          esgoto: z.number().optional(),
          energia: z.number().optional(),
        })
      )
      .mutation(async ({ ctx, input }) => {
        await requireOwnedProject(input.projectId, ctx.user.id);
        const { projectId, ...rest } = input;
        return await upsertCostEngineData(projectId, {
          terraplanagem: rest.terraplanagem !== undefined ? String(rest.terraplanagem) : undefined,
          pavimentacao: rest.pavimentacao !== undefined ? String(rest.pavimentacao) : undefined,
          agua: rest.agua !== undefined ? String(rest.agua) : undefined,
          esgoto: rest.esgoto !== undefined ? String(rest.esgoto) : undefined,
          energia: rest.energia !== undefined ? String(rest.energia) : undefined,
        });
      }),

    calculate: protectedProcedure
      .input(
        z.object({
          projectId: z.number(),
          topografia: z.enum(["plana", "ondulada", "acidentada"]),
          padraoPavimentacao: z.enum(["asfalto", "paver"]),
          solucaoEsgoto: z.enum(["fossa", "rede_publica", "ete_propria"]),
          necessitaElevatoria: z.boolean().optional(),
          solucaoAgua: z.enum(["poco", "rede_publica"]),
          isChacara: z.boolean().optional(),
          areaSupressaoVegetalM2: z.number().min(0).optional(),
          arvoresIsoladasUn: z.number().int().min(0).optional(),
          tipologia: z.enum(["loteamento_popular", "loteamento_aberto", "condominio_fechado", "condominio_chacaras"]),
          participacaoEletrica: z.enum(["cliente_paga", "concessionaria_cobre"]),
          perimetroGlebaM: z.number().positive().optional(),
          larguraMediaViaM: z.number().positive().optional(),
          taxaOcupacaoHabPorLote: z.number().positive().optional(),
          consumoPerCapitaLDia: z.number().positive().optional(),
          k1: z.number().positive().optional(),
          diasReservacao: z.number().positive().optional(),
          contingenciaPercentual: z.number().min(0).max(100).optional(),
          custoFinanceiroPercentual: z.number().min(0).max(100).optional(),
          custoAprovacoesTotal: z.number().min(0).optional(),
          vgvTotal: z.number().min(0).optional(),
          regiao: z.string().optional(),
        })
      )
      .mutation(async ({ ctx, input }) => {
        const { projectId, ...costInput } = input;
        try {
          return await runCostEngine(projectId, ctx.user.id, costInput);
        } catch (error) {
          throw new TRPCError({
            code: "BAD_REQUEST",
            message: error instanceof Error ? error.message : "Falha ao calcular CostEngine",
          });
        }
      }),
  }),

  salesEngine: router({
    getByProjectId: protectedProcedure
      .input(z.object({ projectId: z.number() }))
      .query(async ({ ctx, input }) => {
        await requireOwnedProject(input.projectId, ctx.user.id);
        return await getSalesEngineDataByProjectId(input.projectId);
      }),

    save: protectedProcedure
      .input(
        z.object({
          projectId: z.number(),
          vgv: z.number().optional(),
          precoMedioM2: z.number().optional(),
          velocidadeVendas: z.number().optional(), // lotes/mês — gravado dentro de curvaVendas
        })
      )
      .mutation(async ({ ctx, input }) => {
        await requireOwnedProject(input.projectId, ctx.user.id);
        const { projectId, velocidadeVendas, ...rest } = input;
        return await upsertSalesEngineData(projectId, {
          vgv: rest.vgv !== undefined ? String(rest.vgv) : undefined,
          precoMedioM2: rest.precoMedioM2 !== undefined ? String(rest.precoMedioM2) : undefined,
          curvaVendas: velocidadeVendas !== undefined ? { velocidadeMensalLotes: velocidadeVendas } : undefined,
        });
      }),

    calculate: protectedProcedure
      .input(
        z.object({
          projectId: z.number(),
          tipologia: z.enum(["loteamento_popular", "loteamento_aberto", "condominio_fechado", "condominio_chacaras"]),
          modoPreco: z.enum(["automatico", "manual"]),
          agioPercentual: z.number().min(-1).max(5).optional(),
          precoManualM2: z.number().positive().optional(),
          modoAbsorcao: z.enum(["automatico", "manual"]),
          absorcaoManualLotesMes: z.number().int().positive().optional(),
          comissaoPercentual: z.number().min(0).max(1),
          marketingPercentual: z.number().min(0).max(1),
          impostosPercentual: z.number().min(0).max(1),
          inadimplenciaPercentual: z.number().min(0).max(1),
          despesasAdministrativasPercentual: z.number().min(0).max(1),
          regiao: z.string().optional(),
        })
      )
      .mutation(async ({ ctx, input }) => {
        const { projectId, ...salesInput } = input;
        try {
          return await runSalesEngine(projectId, ctx.user.id, salesInput);
        } catch (error) {
          throw new TRPCError({
            code: "BAD_REQUEST",
            message: error instanceof Error ? error.message : "Falha ao calcular SalesEngine",
          });
        }
      }),
  }),

  financeEngine: router({
    getByProjectId: protectedProcedure
      .input(z.object({ projectId: z.number() }))
      .query(async ({ ctx, input }) => {
        await requireOwnedProject(input.projectId, ctx.user.id);
        return await getFinanceEngineDataByProjectId(input.projectId);
      }),

    save: protectedProcedure
      .input(
        z.object({
          projectId: z.number(),
          tmaUtilizada: z.number().optional(),
          capitalDisponivel: z.number().optional(), // gravado como capitalProprio
        })
      )
      .mutation(async ({ ctx, input }) => {
        await requireOwnedProject(input.projectId, ctx.user.id);
        const { projectId, capitalDisponivel, ...rest } = input;
        return await upsertFinanceEngineData(projectId, {
          tmaUtilizada: rest.tmaUtilizada !== undefined ? String(rest.tmaUtilizada) : undefined,
          capitalProprio: capitalDisponivel !== undefined ? String(capitalDisponivel) : undefined,
        });
      }),

    calculate: protectedProcedure
      .input(
        z.object({
          projectId: z.number(),
          duracaoAprovacoesMeses: z.number().positive(),
          inicioVendasMes: z.number().int().positive(),
          precoBrutoPorLote: z.number().positive(),
          prazoVendasMeses: z.number().positive(),
          curvaVendas: z.enum(["constante", "rampa", "curva_s"]),
          percentualDeducoesVenda: z.number().min(0).max(1),
          percentualEntrada: z.number().min(0).max(1),
          numeroParcelas: z.number().int().positive(),
          tmaAnualFracao: z.number().min(0).max(5),
          reinvestirCaixaPositivo: z.boolean().optional(),
          custosIndexados: z.boolean().optional(),
          indiceCustosAnualFracao: z.number().min(0).max(5).optional(),
          recebiveisIndexados: z.boolean().optional(),
          indiceRecebiveisAnualFracao: z.number().min(0).max(5).optional(),
          capexAprovacoesTotal: z.number().min(0).optional(),
          curvaObra: z.enum(["linear", "curva_s"]).optional(),
          horizonteMeses: z.number().positive().optional(),
        })
      )
      .mutation(async ({ ctx, input }) => {
        const { projectId, ...financeInput } = input;
        try {
          return await runFinanceEngine(projectId, ctx.user.id, financeInput);
        } catch (error) {
          throw new TRPCError({
            code: "BAD_REQUEST",
            message: error instanceof Error ? error.message : "Falha ao calcular FinanceEngine",
          });
        }
      }),
  }),

  taxEngine: router({
    getByProjectId: protectedProcedure
      .input(z.object({ projectId: z.number() }))
      .query(async ({ ctx, input }) => {
        await requireOwnedProject(input.projectId, ctx.user.id);
        return await getTaxEngineDataByProjectId(input.projectId);
      }),

    save: protectedProcedure
      .input(
        z.object({
          projectId: z.number(),
          regimeTributario: z.enum(["ret", "lucro_presumido", "lucro_real"]),
        })
      )
      .mutation(async ({ ctx, input }) => {
        await requireOwnedProject(input.projectId, ctx.user.id);
        const { projectId, ...rest } = input;
        return await upsertTaxEngineData(projectId, rest);
      }),

    calculate: protectedProcedure
      .input(
        z.object({
          projectId: z.number(),
          regime: z.enum(["ret", "lucro_presumido", "lucro_real"]),
          redutorSocialReais: z.number().min(0).optional(),
          patrimonioAfetacao: z.boolean().optional(),
          pais: z.string().optional(),
        })
      )
      .mutation(async ({ ctx, input }) => {
        const { projectId, ...taxInput } = input;
        try {
          return await runTaxEngine(projectId, ctx.user.id, taxInput);
        } catch (error) {
          throw new TRPCError({
            code: "BAD_REQUEST",
            message: error instanceof Error ? error.message : "Falha ao calcular TaxEngine",
          });
        }
      }),
  }),

  scenarioEngine: router({
    getByProjectId: protectedProcedure
      .input(z.object({ projectId: z.number() }))
      .query(async ({ ctx, input }) => {
        await requireOwnedProject(input.projectId, ctx.user.id);
        const [cenarios, parceria] = await Promise.all([
          getScenariosByProjectId(input.projectId),
          getPartnershipAnalysisByProjectId(input.projectId),
        ]);
        return { cenarios, parceria };
      }),

    calculate: protectedProcedure
      .input(
        z.object({
          projectId: z.number(),
          duracaoAprovacoesMeses: z.number().positive(),
          inicioVendasMes: z.number().int().positive(),
          precoBrutoPorLote: z.number().positive(),
          prazoVendasMeses: z.number().positive(),
          curvaVendas: z.enum(["constante", "rampa", "curva_s"]),
          percentualDeducoesVenda: z.number().min(0).max(1),
          percentualEntrada: z.number().min(0).max(1),
          numeroParcelas: z.number().int().positive(),
          tmaAnualFracao: z.number().min(0).max(5),
          reinvestirCaixaPositivo: z.boolean().optional(),
          custosIndexados: z.boolean().optional(),
          indiceCustosAnualFracao: z.number().min(0).max(5).optional(),
          recebiveisIndexados: z.boolean().optional(),
          indiceRecebiveisAnualFracao: z.number().min(0).max(5).optional(),
          capexAprovacoesTotal: z.number().min(0).optional(),
          curvaObra: z.enum(["linear", "curva_s"]).optional(),
          horizonteMeses: z.number().positive().optional(),
          percentualParceriaTerreno: z.number().min(0).max(1).optional(),
          percentuaisParceriaSensibilidade: z.array(z.number().min(0).max(1)).optional(),
          variacoesPrecoSensibilidade: z.array(z.number().min(-1).max(5)).optional(),
        })
      )
      .mutation(async ({ ctx, input }) => {
        const { projectId, ...scenarioInput } = input;
        try {
          return await runScenarioEngine(projectId, ctx.user.id, scenarioInput);
        } catch (error) {
          throw new TRPCError({
            code: "BAD_REQUEST",
            message: error instanceof Error ? error.message : "Falha ao calcular Cenários",
          });
        }
      }),
  }),

  dashboard: router({
    getByProjectId: protectedProcedure
      .input(z.object({ projectId: z.number() }))
      .query(async ({ ctx, input }) => {
        try {
          return await getDashboardData(input.projectId, ctx.user.id);
        } catch (error) {
          throw new TRPCError({
            code: "BAD_REQUEST",
            message: error instanceof Error ? error.message : "Falha ao montar o Dashboard",
          });
        }
      }),
  }),
});

export type AppRouter = typeof appRouter;
