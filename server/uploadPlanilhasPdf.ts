import multer from "multer";
import { Router } from "express";
import { execSync } from "child_process";
import { writeFileSync, unlinkSync } from "fs";
import { tmpdir } from "os";
import { join } from "path";
import { getDb } from "./db";
import { devedores } from "../drizzle/schema";
import { eq } from "drizzle-orm";

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 50 * 1024 * 1024 }, // 50MB por arquivo
  fileFilter: (_req, file, cb) => {
    if (file.mimetype === "application/pdf" || file.originalname.toLowerCase().endsWith(".pdf")) {
      cb(null, true);
    } else {
      cb(new Error("Apenas arquivos PDF são aceitos"));
    }
  },
});

export const uploadPlanilhasPdfRouter = Router();

/**
 * Extrai o valor do Total Geral de um PDF de planilha de cálculo.
 * Busca pelo último "Total Geral" no texto e pega o primeiro "R$ X.XXX,XX" após ele.
 * Retorna o valor em formato BR (ex: "12.148,74") ou null se não encontrar.
 */
function extrairTotalGeral(pdfBuffer: Buffer): string | null {
  const tmpPath = join(tmpdir(), `planilha_${Date.now()}_${Math.random().toString(36).slice(2)}.pdf`);
  try {
    writeFileSync(tmpPath, pdfBuffer);
    const text = execSync(`pdftotext ${JSON.stringify(tmpPath)} -`, { encoding: "utf8", timeout: 15000 });
    const idx = text.lastIndexOf("Total Geral");
    if (idx < 0) return null;
    const after = text.slice(idx);
    // Pegar o primeiro valor monetário após "Total Geral"
    const m = after.match(/R\$\s*([\d,\.]+)/);
    if (!m) return null;
    // O pdftotext do LibreOffice pode gerar formato US (12,148.74) ou BR (12.148,74)
    // Normalizar para formato BR com vírgula decimal
    const raw = m[1]; // ex: "12,148.74" (US) ou "12.148,74" (BR)
    return normalizarValorBR(raw);
  } catch {
    return null;
  } finally {
    try { unlinkSync(tmpPath); } catch { /* ignorar */ }
  }
}

/**
 * Normaliza um valor monetário para o formato BR (ex: "12.148,74").
 * Aceita tanto formato US (12,148.74) quanto BR (12.148,74).
 */
function normalizarValorBR(raw: string): string {
  // Detectar se é formato US: tem vírgula como separador de milhar e ponto como decimal
  // Ex: "12,148.74" → ponto é o último separador → formato US
  const lastDot = raw.lastIndexOf(".");
  const lastComma = raw.lastIndexOf(",");
  if (lastDot > lastComma) {
    // Formato US: "12,148.74" → trocar vírgula por nada, ponto por vírgula
    return raw.replace(/,/g, "").replace(".", ",");
  } else {
    // Formato BR: "12.148,74" → já está correto
    return raw;
  }
}

/**
 * Tenta identificar o devedorId a partir do nome do arquivo PDF.
 * O nome do arquivo segue o padrão: "PLANILHA {COOPERATIVA} - {NOME_DEVEDOR}.pdf"
 * Busca no banco pelo contrarioNome mais próximo.
 */
async function identificarDevedorPorNomeArquivo(
  nomeArquivo: string,
  loteId: number
): Promise<number | null> {
  // Extrair o nome do devedor do nome do arquivo
  // Padrão: "PLANILHA SICOOB COOPEREMB - JOAO VITOR SANTOS DA SILVA.pdf"
  const semExtensao = nomeArquivo.replace(/\.pdf$/i, "");
  const dashIdx = semExtensao.indexOf(" - ");
  if (dashIdx < 0) return null;
  const nomeDevedor = semExtensao.slice(dashIdx + 3).trim().toUpperCase();

  // Buscar devedores do lote
  const db = await getDb();
  if (!db) return null;
  const devsLote = await db
    .select({ id: devedores.id, contrarioNome: devedores.contrarioNome })
    .from(devedores)
    .where(eq(devedores.loteId, loteId));

  // Busca exata primeiro
  const exato = devsLote.find(
    (d: { id: number; contrarioNome: string | null }) => (d.contrarioNome ?? "").toUpperCase() === nomeDevedor
  );
  if (exato) return exato.id;

  // Busca parcial: nome do arquivo contém o nome do devedor
  const parcial = devsLote.find(
    (d: { id: number; contrarioNome: string | null }) => nomeDevedor.includes((d.contrarioNome ?? "").toUpperCase())
  );
  if (parcial) return parcial.id;

  return null;
}

/**
 * POST /api/upload-planilhas-pdf/:loteId
 * Recebe múltiplos PDFs de planilhas de cálculo, extrai o Total Geral de cada um,
 * e retorna os resultados para revisão pelo usuário.
 * Não salva no banco — apenas extrai e retorna.
 */
uploadPlanilhasPdfRouter.post(
  "/:loteId/extrair",
  upload.array("pdfs", 100),
  async (req, res) => {
    try {
      const loteId = parseInt(req.params.loteId ?? "0");
      if (!loteId) return res.status(400).json({ error: "loteId inválido" });

      const files = req.files as Express.Multer.File[];
      if (!files || files.length === 0) {
        return res.status(400).json({ error: "Nenhum arquivo enviado" });
      }

      const resultados = await Promise.all(
        files.map(async (file) => {
          const nomeArquivo = Buffer.from(file.originalname, "latin1").toString("utf8");
          const valorExtraido = extrairTotalGeral(file.buffer);
          const devedorId = await identificarDevedorPorNomeArquivo(nomeArquivo, loteId);
          return {
            nomeArquivo,
            devedorId,
            valorExtraido,
            sucesso: valorExtraido !== null && devedorId !== null,
          };
        })
      );

      return res.json({ resultados });
    } catch (err) {
      console.error("[uploadPlanilhasPdf] Erro:", err);
      return res.status(500).json({ error: "Erro ao processar PDFs" });
    }
  }
);

/**
 * POST /api/upload-planilhas-pdf/:loteId/salvar
 * Salva os valores da causa confirmados pelo usuário no banco.
 * Body: { valores: [{ devedorId: number, valorCausa: string }] }
 */
uploadPlanilhasPdfRouter.post("/:loteId/salvar", async (req, res) => {
  try {
    const loteId = parseInt(req.params.loteId ?? "0");
    if (!loteId) return res.status(400).json({ error: "loteId inválido" });

    const { valores } = req.body as {
      valores: Array<{ devedorId: number; valorCausa: string }>;
    };
    if (!Array.isArray(valores) || valores.length === 0) {
      return res.status(400).json({ error: "Nenhum valor enviado" });
    }

    const db = await getDb();
    if (!db) return res.status(500).json({ error: "Banco de dados indisponível" });

    await Promise.all(
      valores.map(({ devedorId, valorCausa }) =>
        db
          .update(devedores)
          .set({ valorCausa: valorCausa || null })
          .where(eq(devedores.id, devedorId))
      )
    );

    return res.json({ ok: true, salvos: valores.length });
  } catch (err) {
    console.error("[uploadPlanilhasPdf] Erro ao salvar:", err);
    return res.status(500).json({ error: "Erro ao salvar valores" });
  }
});
