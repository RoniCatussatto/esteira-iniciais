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
import { processarDocumentoUploadado } from "./extractor";
import { triarDocumentos, processarItemTriagem } from "./extractor";
import { baixarArquivo, extrairTextoPDF } from "./extractor";
import { updateDocumentoTexto, getDb } from "./db";
import { documentos as documentosTable } from "../drizzle/schema";
import { eq } from "drizzle-orm";
import {
  getLotesPaginados,
  deleteLote,
  deleteLotesAntigos,
} from "./db";
import {
  getDocumentosByLote,
  getDocumentosByDevedor,
  deleteDocumento,
} from "./db";
import {
  getExtracoesByDevedor,
  getExtracoesByLote,
  createExtracao,
  updateExtracao,
  deleteExtracao,
  initExtracoesByContratos,
} from "./db";

import {
  getAllClientes,
  getClienteById,
  createCliente,
  updateCliente,
  deleteCliente,
  getDocConfigsByCliente,
  getDocConfigById,
  createDocConfig,
  updateDocConfig,
  deleteDocConfig,
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
  documentos: router({
    getByLote: publicProcedure
      .input(z.object({ loteId: z.number() }))
      .query(({ input }) => getDocumentosByLote(input.loteId)),
    getByDevedor: publicProcedure
      .input(z.object({ devedorId: z.number() }))
      .query(({ input }) => getDocumentosByDevedor(input.devedorId)),
    delete: publicProcedure
      .input(z.object({ id: z.number() }))
      .mutation(({ input }) => deleteDocumento(input.id)),
    // Disparar extração automática para todos os documentos de um devedor
    extrairDevedor: publicProcedure
      .input(z.object({ devedorId: z.number(), loteId: z.number() }))
      .mutation(async ({ input }) => {
        const { devedorId, loteId } = input;
        const docs = await getDocumentosByDevedor(devedorId);
        const lote = await getLoteById(loteId);
        if (!lote?.cooperativa) return { extraidos: 0, erro: "Cooperativa não encontrada no lote" };
        // Triagem: identificar documentos pelo nome antes de baixar
        const triagem = await triarDocumentos(
          docs.map(d => ({ fileKey: d.fileKey, nomeArquivo: d.nomeArquivo, mimeType: d.mimeType })),
          lote.cooperativa
        );
        // Extração: processar apenas os identificados
        let extraidos = 0;
        for (const item of triagem.identificados) {
          // Usar textoExtraido do banco se disponível (evita 403 ao baixar do S3)
          const docComTexto = docs.find(d => d.nomeArquivo === item.nomeArquivo && d.textoExtraido);
          const resultado = docComTexto?.textoExtraido
            ? await processarItemTriagemComTexto(item, devedorId, loteId, docComTexto.textoExtraido)
            : await processarItemTriagem(item, devedorId, loteId);
          if (resultado) extraidos++;
        }
        return {
          extraidos,
          identificados: triagem.identificados.map(i => ({ arquivo: i.nomeArquivo, regra: i.docConfig.nomeDocumento })),
          naoIdentificados: triagem.naoIdentificados,
        };
      }),
    // Re-extrair texto de documentos com textoExtraido nulo (baixa do S3 e salva no banco)
    reextrairTexto: publicProcedure
      .input(z.object({ loteId: z.number() }))
      .mutation(async ({ input }) => {
        const { loteId } = input;
        const db = await getDb();
        if (!db) return { atualizados: 0, erro: "DB não disponível" };
        // Buscar documentos PDF sem texto extraído neste lote
        const docsLote = await getDocumentosByLote(loteId);
        const docsSemTexto = docsLote.filter(d => {
          const raw = d.textoExtraido;
          if (!raw) return true;
          const str = Buffer.isBuffer(raw) ? (raw as Buffer).toString('utf8') : String(raw);
          return str.trim().length === 0;
        }).filter(d => d.mimeType?.includes('pdf') || d.nomeArquivo.toLowerCase().endsWith('.pdf'));
        console.log(`[ReextrairTexto] ${docsSemTexto.length} documento(s) sem texto no lote ${loteId}`);
        let atualizados = 0;
        for (const doc of docsSemTexto) {
          console.log(`[ReextrairTexto] Baixando: ${doc.nomeArquivo} (key=${doc.fileKey})`);
          const buf = await baixarArquivo(doc.fileKey);
          if (!buf) { console.warn(`[ReextrairTexto] Falha ao baixar: ${doc.nomeArquivo}`); continue; }
          const texto = await extrairTextoPDF(buf);
          if (!texto || texto.trim().length === 0) { console.warn(`[ReextrairTexto] Texto vazio para: ${doc.nomeArquivo}`); continue; }
          await updateDocumentoTexto(doc.id, texto);
          console.log(`[ReextrairTexto] Texto salvo para doc ${doc.id} (${doc.nomeArquivo}): ${texto.length} chars`);
          atualizados++;
        }
        return { atualizados, total: docsSemTexto.length };
      }),
    // Disparar extração automática para TODOS os devedores de um lote
    extrairLote: publicProcedure
      .input(z.object({ loteId: z.number() }))
      .mutation(async ({ input }) => {
        const { loteId } = input;
        const lote = await getLoteById(loteId);
        if (!lote?.cooperativa) return { extraidos: 0, devedoresProcessados: 0, erro: "Cooperativa não encontrada no lote" };
        const devedoresLote = await getDevedoresByLote(loteId);
        let extraidos = 0;
        let devedoresProcessados = 0;
        for (const dev of devedoresLote) {
          const docs = await getDocumentosByDevedor(dev.id);
          if (docs.length === 0) continue;
          devedoresProcessados++;
          // Triagem por nome, depois extração apenas dos identificados
          const triagem = await triarDocumentos(
            docs.map(d => ({ fileKey: d.fileKey, nomeArquivo: d.nomeArquivo, mimeType: d.mimeType })),
            lote.cooperativa
          );
          for (const item of triagem.identificados) {
            // Usar textoExtraido do banco se disponível (evita 403 ao baixar do S3)
            const docComTexto = docs.find(d => d.nomeArquivo === item.nomeArquivo && d.textoExtraido);
            const resultado = docComTexto?.textoExtraido
              ? await processarItemTriagemComTexto(item, dev.id, loteId, docComTexto.textoExtraido)
              : await processarItemTriagem(item, dev.id, loteId);
            if (resultado) extraidos++;
          }
        }
        return { extraidos, devedoresProcessados };
      }),
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
    // Salvar campos de extração dos documentos (Etapa 3)
    saveExtraction: publicProcedure
      .input(z.object({
        id: z.number(),
        dadoPlanilha01: z.string().nullable().optional(),
        dadoPlanilha02: z.string().nullable().optional(),
        dadoPlanilha03: z.string().nullable().optional(),
        dadoPlanilha04: z.string().nullable().optional(),
        multa2pct: z.enum(["sim", "nao", "branco"]).optional(),
        moraEspecifica: z.string().nullable().optional(),
      }))
      .mutation(({ input }) => {
        const { id, ...data } = input;
        return updateDevedor(id, data);
      }),
  }),

  extracoes: router({
    getByDevedor: publicProcedure
      .input(z.object({ devedorId: z.number() }))
      .query(({ input }) => getExtracoesByDevedor(input.devedorId)),
    getByLote: publicProcedure
      .input(z.object({ loteId: z.number() }))
      .query(({ input }) => getExtracoesByLote(input.loteId)),
    init: publicProcedure
      .input(z.object({ devedorId: z.number(), loteId: z.number(), contratos: z.string() }))
      .mutation(({ input }) => initExtracoesByContratos(input.devedorId, input.loteId, input.contratos)),
    create: publicProcedure
      .input(z.object({
        devedorId: z.number(),
        loteId: z.number(),
        numeroContrato: z.string(),
        dadoPlanilha01: z.string().nullable().optional(),
        dadoPlanilha02: z.string().nullable().optional(),
        dadoPlanilha03: z.string().nullable().optional(),
        dadoPlanilha04: z.string().nullable().optional(),
        multa2pct: z.enum(["sim", "nao", "branco"]).optional(),
        moraEspecifica: z.string().nullable().optional(),
      }))
      .mutation(({ input }) => createExtracao(input)),
    update: publicProcedure
      .input(z.object({
        id: z.number(),
        numeroContrato: z.string().optional(),
        dadoPlanilha01: z.string().nullable().optional(),
        dadoPlanilha02: z.string().nullable().optional(),
        dadoPlanilha03: z.string().nullable().optional(),
        dadoPlanilha04: z.string().nullable().optional(),
        multa2pct: z.enum(["sim", "nao", "branco"]).optional(),
        moraEspecifica: z.string().nullable().optional(),
      }))
      .mutation(({ input }) => {
        const { id, ...data } = input;
        return updateExtracao(id, data);
      }),
    delete: publicProcedure
      .input(z.object({ id: z.number() }))
      .mutation(({ input }) => deleteExtracao(input.id)),
  }),

  clientes: router({
    list: publicProcedure.query(() => getAllClientes()),
    getById: publicProcedure
      .input(z.object({ id: z.number() }))
      .query(({ input }) => getClienteById(input.id)),
    create: publicProcedure
      .input(z.object({
        nomeFantasia: z.string(),
        nomeCompleto: z.string().nullable().optional(),
        doc: z.string().nullable().optional(),
        telefone: z.string().nullable().optional(),
        logradouro: z.string().nullable().optional(),
        numero: z.string().nullable().optional(),
        complemento: z.string().nullable().optional(),
        cep: z.string().nullable().optional(),
        uf: z.string().nullable().optional(),
        municipio: z.string().nullable().optional(),
        paragrafaInicial: z.string().nullable().optional(),
        enderecoCoop: z.string().nullable().optional(),
      }))
      .mutation(({ input }) => createCliente(input)),
    update: publicProcedure
      .input(z.object({
        id: z.number(),
        nomeFantasia: z.string().optional(),
        nomeCompleto: z.string().nullable().optional(),
        doc: z.string().nullable().optional(),
        telefone: z.string().nullable().optional(),
        logradouro: z.string().nullable().optional(),
        numero: z.string().nullable().optional(),
        complemento: z.string().nullable().optional(),
        cep: z.string().nullable().optional(),
        uf: z.string().nullable().optional(),
        municipio: z.string().nullable().optional(),
        paragrafaInicial: z.string().nullable().optional(),
        enderecoCoop: z.string().nullable().optional(),
      }))
      .mutation(({ input }) => {
        const { id, ...data } = input;
        return updateCliente(id, data);
      }),
    delete: publicProcedure
      .input(z.object({ id: z.number() }))
      .mutation(({ input }) => deleteCliente(input.id)),
  }),

  docConfigs: router({
    getByCliente: publicProcedure
      .input(z.object({ clienteId: z.number() }))
      .query(({ input }) => getDocConfigsByCliente(input.clienteId)),
    getById: publicProcedure
      .input(z.object({ id: z.number() }))
      .query(({ input }) => getDocConfigById(input.id)),
    create: publicProcedure
      .input(z.object({
        clienteId: z.number(),
        nomeDocumento: z.string(),
        descricao: z.string().nullable().optional(),
        configJson: z.string().nullable().optional(),
      }))
      .mutation(({ input }) => createDocConfig(input)),
    update: publicProcedure
      .input(z.object({
        id: z.number(),
        nomeDocumento: z.string().optional(),
        descricao: z.string().nullable().optional(),
        configJson: z.string().nullable().optional(),
        ativo: z.number().optional(),
      }))
      .mutation(({ input }) => {
        const { id, ...data } = input;
        return updateDocConfig(id, data);
      }),
    delete: publicProcedure
      .input(z.object({ id: z.number() }))
      .mutation(({ input }) => deleteDocConfig(input.id)),
  }),
});

export type AppRouter = typeof appRouter;
import { processarItemTriagemComTexto } from "./extractor";
