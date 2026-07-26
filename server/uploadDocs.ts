import { Router } from "express";
import multer from "multer";
import { getDevedoresByLote, createDocumento } from "./db";
import { storagePut } from "./storage";
import { getLoteById } from "./db";
import { triarDocumentos, processarItemTriagem } from "./extractor";

const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 50 * 1024 * 1024 } });

export const uploadDocsRouter = Router();

/**
 * Normaliza uma string para comparação: remove acentos, pontuação, espaços extras
 * e converte para minúsculas.
 */
function normalizeStr(s: string): string {
  return s
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")  // remove acentos
    .replace(/[^a-z0-9\s]/gi, " ")    // substitui pontuação por espaço
    .replace(/\s+/g, " ")             // colapsa espaços múltiplos
    .trim()
    .toLowerCase();
}

/**
 * Calcula a similaridade entre dois nomes usando o coeficiente de Dice sobre bigramas.
 * Retorna um valor entre 0 (nenhuma similaridade) e 1 (idênticos).
 */
function diceSimilarity(a: string, b: string): number {
  const bigrams = (s: string) => {
    const set = new Set<string>();
    for (let i = 0; i < s.length - 1; i++) set.add(s.slice(i, i + 2));
    return set;
  };
  const ba = bigrams(a);
  const bb = bigrams(b);
  if (ba.size === 0 || bb.size === 0) return 0;
  let intersection = 0;
  ba.forEach((bg) => { if (bb.has(bg)) intersection++; });
  return (2 * intersection) / (ba.size + bb.size);
}

/**
 * Verifica se todos os tokens do nome do devedor estão contidos no nome da pasta.
 * Útil para casos onde a pasta tem informações extras além do nome.
 */
function allTokensContained(devedorNorm: string, pastaNorm: string): boolean {
  const tokens = devedorNorm.split(" ").filter((t) => t.length > 2);
  return tokens.length > 0 && tokens.every((t) => pastaNorm.includes(t));
}

/**
 * Encontra o melhor devedor para um dado nome de pasta.
 * Retorna o devedor e o score de confiança, ou null se abaixo do limiar.
 */
function matchDevedorPorPasta(
  nomePasta: string,
  devedores: Array<{ id: number; contrarioNome: string | null }>
): { devedorId: number; score: number } | null {
  const pastaNorm = normalizeStr(nomePasta);
  let melhorScore = 0;
  let melhorId: number | null = null;

  for (const dev of devedores) {
    if (!dev.contrarioNome) continue;
    const devNorm = normalizeStr(dev.contrarioNome);

    // 1. Similaridade Dice entre os nomes normalizados
    const dice = diceSimilarity(devNorm, pastaNorm);

    // 2. Bônus se todos os tokens do nome do devedor estão na pasta
    const bonus = allTokensContained(devNorm, pastaNorm) ? 0.2 : 0;

    const score = Math.min(1, dice + bonus);
    if (score > melhorScore) {
      melhorScore = score;
      melhorId = dev.id;
    }
  }

  // Limiar mínimo de 0.35 para aceitar o vínculo
  if (melhorId !== null && melhorScore >= 0.35) {
    return { devedorId: melhorId, score: melhorScore };
  }
  return null;
}

/**
 * POST /api/upload/docs/:loteId
 * Recebe múltiplos arquivos com o campo `nomePasta` para cada arquivo.
 * Vincula cada arquivo ao devedor correto via fuzzy matching.
 *
 * Body (multipart/form-data):
 *   files[]: arquivo(s)
 *   nomePasta[]: nome da pasta correspondente a cada arquivo (mesma ordem)
 */
/**
 * POST /api/upload/docs/:loteId/devedor/:devedorId
 * Upload direto para um devedor específico — sem fuzzy matching.
 */
uploadDocsRouter.post("/single-file", upload.single("file"), async (req, res) => {
  const file = req.file;
  if (!file) {
    return res.status(400).json({ error: "Nenhum arquivo enviado" });
  }
  try {
    const ext = file.originalname.split(".").pop() || "bin";
    const key = `modelos/${Date.now()}-${Math.random().toString(36).slice(2)}.${ext}`;
    const { url } = await storagePut(key, file.buffer, file.mimetype || "application/octet-stream");
    return res.json({ url, key, nome: file.originalname, mimeType: file.mimetype });
  } catch (err: unknown) {
    console.error("[UploadDocs/single-file] Erro:", err);
    const message = err instanceof Error ? err.message : "Erro interno";
    return res.status(500).json({ error: message });
  }
});

uploadDocsRouter.post("/:loteId/devedor/:devedorId", upload.array("files", 100), async (req, res) => {
  try {
    const loteId = parseInt(req.params.loteId);
    const devedorId = parseInt(req.params.devedorId);
    if (isNaN(loteId) || isNaN(devedorId)) return res.status(400).json({ error: "Parâmetros inválidos" });

    const files = req.files as Express.Multer.File[];
    if (!files || files.length === 0) return res.status(400).json({ error: "Nenhum arquivo enviado" });

    const adicionados: string[] = [];
    const lote = await getLoteById(loteId);
    const cooperativa = lote?.cooperativa ?? null;

    // Triagem por nome antes de fazer upload
    const triagem = cooperativa
      ? await triarDocumentos(
          files.map(f => ({ fileKey: "", nomeArquivo: f.originalname, mimeType: f.mimetype })),
          cooperativa
        )
      : null;

    for (let i = 0; i < files.length; i++) {
      const file = files[i];
      const fileKey = `lote-${loteId}/docs/${Date.now()}-${i}-${file.originalname.replace(/[^a-zA-Z0-9._-]/g, "_")}`;
      const { url } = await storagePut(fileKey, file.buffer, file.mimetype);
      await createDocumento({
        loteId,
        devedorId,
        nomeArquivo: file.originalname,
        nomePasta: null,
        fileKey,
        fileUrl: url,
        mimeType: file.mimetype,
        tamanho: file.size,
      });
      adicionados.push(file.originalname);

      // Extração automática com buffer em memória (evita problema de 403 no S3)
      if (triagem) {
        const itemIdentificado = triagem.identificados.find(
          (item) => item.nomeArquivo === file.originalname
        );
        if (itemIdentificado) {
          // Atualizar fileKey no item (não estava disponível na triagem)
          const itemComKey = { ...itemIdentificado, fileKey };
          processarItemTriagem(itemComKey, devedorId, loteId, file.buffer).catch((err) => {
            console.error("[UploadDocs/Direto] Erro na extração:", err);
          });
        }
      }
    }
    return res.json({ success: true, adicionados });
  } catch (err: unknown) {
    console.error("[UploadDocs/Direto] Erro:", err);
    const message = err instanceof Error ? err.message : "Erro interno";
    return res.status(500).json({ error: message });
  }
});

uploadDocsRouter.post("/:loteId", upload.array("files", 500), async (req, res) => {
  try {
    const loteId = parseInt(req.params.loteId);
    if (isNaN(loteId)) return res.status(400).json({ error: "loteId inválido" });

    const files = req.files as Express.Multer.File[];
    if (!files || files.length === 0) return res.status(400).json({ error: "Nenhum arquivo enviado" });

    // nomePasta pode vir como array ou string única
    const nomesPasta: string[] = Array.isArray(req.body.nomePasta)
      ? req.body.nomePasta
      : files.map(() => req.body.nomePasta ?? "");

    // Buscar devedores do lote para fazer o matching
    const devedoresLote = await getDevedoresByLote(loteId);
    if (devedoresLote.length === 0) {
      return res.status(404).json({ error: "Lote não encontrado ou sem devedores" });
    }

    // Buscar lote para obter cooperativa (necessário para extração)
    const lote = await getLoteById(loteId);
    const cooperativa = lote?.cooperativa ?? null;

    const resultados: Array<{
      arquivo: string;
      pasta: string;
      devedorId: number | null;
      devedorNome: string | null;
      score: number;
      fileUrl: string;
    }> = [];

    const semVinculo: string[] = [];

    for (let i = 0; i < files.length; i++) {
      const file = files[i];
      const nomePasta = nomesPasta[i] ?? "";

      // Fazer upload para S3
      const fileKey = `lote-${loteId}/docs/${Date.now()}-${i}-${file.originalname.replace(/[^a-zA-Z0-9._-]/g, "_")}`;
      const { url } = await storagePut(fileKey, file.buffer, file.mimetype);

      // Tentar vincular ao devedor
      const match = matchDevedorPorPasta(nomePasta, devedoresLote);

      if (match) {
        const devedor = devedoresLote.find((d) => d.id === match.devedorId);
        await createDocumento({
          loteId,
          devedorId: match.devedorId,
          nomeArquivo: file.originalname,
          nomePasta,
          fileKey,
          fileUrl: url,
          mimeType: file.mimetype,
          tamanho: file.size,
        });
        resultados.push({
          arquivo: file.originalname,
          pasta: nomePasta,
          devedorId: match.devedorId,
          devedorNome: devedor?.contrarioNome ?? null,
          score: Math.round(match.score * 100),
          fileUrl: url,
        });
        // Extração automática com buffer em memória
        if (cooperativa && match.devedorId) {
          const triagem = await triarDocumentos(
            [{ fileKey, nomeArquivo: file.originalname, mimeType: file.mimetype }],
            cooperativa
          );
          if (triagem.identificados.length > 0) {
            processarItemTriagem(triagem.identificados[0], match.devedorId, loteId, file.buffer).catch((err) => {
              console.error("[UploadDocs/Batch] Erro na extração:", err);
            });
          }
        }
      } else {
        semVinculo.push(`${nomePasta}/${file.originalname}`);
        resultados.push({
          arquivo: file.originalname,
          pasta: nomePasta,
          devedorId: null,
          devedorNome: null,
          score: 0,
          fileUrl: url,
        });
      }
    }

    return res.json({
      success: true,
      totalArquivos: files.length,
      vinculados: resultados.filter((r) => r.devedorId !== null).length,
      semVinculo: semVinculo.length,
      resultados,
    });
  } catch (err: unknown) {
    console.error("[UploadDocs] Erro:", err);
    const message = err instanceof Error ? err.message : "Erro interno";
    return res.status(500).json({ error: message });
  }
});

/**
 * POST /api/upload/docs/single-file
 * Upload de um único arquivo (para arquivos modelo de configuração de extração).
 * Retorna { url, key }.
 */
