import { Router } from "express";
import { deleteLotesAntigos } from "./db";

export const scheduledRouter = Router();

/**
 * POST /api/scheduled/limpar-lotes-antigos
 * Executado diariamente pelo Heartbeat para remover lotes com mais de 30 dias.
 * Não requer autenticação de usuário — é chamado pela plataforma Manus.
 */
scheduledRouter.post("/limpar-lotes-antigos", async (req, res) => {
  try {
    const excluidos = await deleteLotesAntigos();
    console.log(`[Cleanup] Lotes antigos excluídos: ${excluidos}`);
    return res.json({ ok: true, excluidos });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Erro interno";
    console.error("[Cleanup] Erro ao excluir lotes antigos:", err);
    return res.status(500).json({ error: message, timestamp: new Date().toISOString() });
  }
});
