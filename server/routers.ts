import { COOKIE_NAME } from "@shared/const";
import { getSessionCookieOptions } from "./_core/cookies";
import { systemRouter } from "./_core/systemRouter";
import { protectedProcedure, publicProcedure, router } from "./_core/trpc";
import { z } from "zod";
import {
  getLoteById,
  getDevedoresByLote,
  getDevedorById,
  updateDevedor,
} from "./db";
import {
  getLotesPaginados,
  deleteLote,
  deleteLotesAntigos,
} from "./db";

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

  lotes: router({
    list: publicProcedure
      .input(z.object({ page: z.number().min(1).default(1), pageSize: z.number().min(1).max(100).default(10) }))
      .query(({ input }) => getLotesPaginados(input.page, input.pageSize)),
    getById: publicProcedure
      .input(z.object({ id: z.number() }))
      .query(({ input }) => getLoteById(input.id)),
    getDevedores: publicProcedure
      .input(z.object({ loteId: z.number() }))
      .query(({ input }) => getDevedoresByLote(input.loteId)),
    delete: publicProcedure
      .input(z.object({ id: z.number() }))
      .mutation(({ input }) => deleteLote(input.id)),
    limparAntigos: publicProcedure
      .mutation(() => deleteLotesAntigos()),
  }),

  devedores: router({
    getById: publicProcedure
      .input(z.object({ id: z.number() }))
      .query(({ input }) => getDevedorById(input.id)),
    update: publicProcedure
      .input(z.object({
        id: z.number(),
        contrarioNome: z.string().optional(),
        contrarioCpf: z.string().optional(),
        contrarioEndereco: z.string().optional(),
        foro: z.string().optional(),
        contratos: z.string().optional(),
        valorBordero: z.string().optional(),
        vencBordero: z.string().optional(),
        veiculoModelo: z.string().nullable().optional(),
        veiculoAno: z.string().nullable().optional(),
        veiculoPlaca: z.string().nullable().optional(),
        veiculoRenavam: z.string().nullable().optional(),
        veiculoChassis: z.string().nullable().optional(),
        tipoInicial: z.string().nullable().optional(),
        tipoPlanilha: z.string().nullable().optional(),
        observacoes: z.string().nullable().optional(),
      }))
      .mutation(({ input }) => {
        const { id, ...data } = input;
        return updateDevedor(id, data);
      }),
  }),
});

export type AppRouter = typeof appRouter;
