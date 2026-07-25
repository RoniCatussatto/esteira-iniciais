import multer from "multer";
import * as XLSX from "xlsx";
import { Router } from "express";
import { createLote, createDevedores, updateLoteStatus } from "./db";
import type { InsertDevedor } from "../drizzle/schema";

const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 20 * 1024 * 1024 } });

export const uploadRouter = Router();

/**
 * Normaliza um valor de célula: converte "." para null, remove espaços extras.
 */
function normalizeCell(value: unknown): string | null {
  if (value === null || value === undefined) return null;
  const str = String(value).trim();
  if (str === "" || str === ".") return null;
  return str;
}

/**
 * POST /api/upload/bd
 * Recebe um arquivo XLSX (planilha BD), extrai os dados e salva no banco.
 */
uploadRouter.post("/bd", upload.single("file"), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: "Nenhum arquivo enviado." });
    }

    // Parse do arquivo Excel
    const workbook = XLSX.read(req.file.buffer, { type: "buffer" });

    // Usar a primeira planilha
    const sheetName = workbook.SheetNames[0];
    if (!sheetName) {
      return res.status(400).json({ error: "Planilha vazia ou inválida." });
    }

    const sheet = workbook.Sheets[sheetName];
    // Converter para array de objetos usando a primeira linha como cabeçalho
    const rows = XLSX.utils.sheet_to_json<Record<string, unknown>>(sheet, { defval: null });

    if (rows.length === 0) {
      return res.status(400).json({ error: "Nenhum dado encontrado na planilha." });
    }

    // Extrair metadados do lote a partir da primeira linha
    const firstRow = rows[0];
    const cooperativa = normalizeCell(firstRow["cooperativa"]) ?? "Sem cooperativa";
    const dataBordero = normalizeCell(firstRow["dataBordero"]);
    const nomeLote = `${cooperativa} - ${dataBordero ?? new Date().toLocaleDateString("pt-BR")}`;

    // Criar o lote
    const loteResult = await createLote({
      nome: nomeLote,
      dataBordero: dataBordero ?? undefined,
      cooperativa: cooperativa,
      totalDevedores: rows.length,
    });

    // @ts-ignore - insertId está disponível no resultado do mysql2
    const loteId: number = (loteResult as any)[0].insertId;

    // Mapear cada linha para um devedor
    const devedoresData: InsertDevedor[] = rows.map((row) => ({
      loteId,
      cooperativa: normalizeCell(row["cooperativa"]),
      dataBordero: normalizeCell(row["dataBordero"]),
      contratos: normalizeCell(row["contratos"]),
      valorBordero: normalizeCell(row["valorBordero"]),
      contrarioNome: normalizeCell(row["contrario_nome"]),
      contrarioCpf: normalizeCell(row["contrario_cpf"]),
      vencBordero: normalizeCell(row["vencBordero"]),
      contrarioEndereco: normalizeCell(row["contrario_endereco"]),
      foro: normalizeCell(row["foro"]),
      veiculoModelo: normalizeCell(row["veiculo_modelo"]),
      veiculoAno: normalizeCell(row["veiculo_ano"]),
      veiculoPlaca: normalizeCell(row["veiculo_placa"]),
      veiculoRenavam: normalizeCell(row["veiculo_renavam"]),
      veiculoChassis: normalizeCell(row["veiculo_chassis"]),
      status: "pendente",
    }));

    await createDevedores(devedoresData);

    // Atualizar status do lote para "aguardando" (dados importados, aguardando próximas etapas)
    // O status permanece "aguardando" pois as etapas seguintes (planilha + inicial) ainda não foram executadas

    return res.json({
      success: true,
      loteId,
      nomeLote,
      totalDevedores: rows.length,
    });
  } catch (err: unknown) {
    console.error("[Upload BD] Erro:", err);
    const message = err instanceof Error ? err.message : "Erro interno";
    return res.status(500).json({ error: message });
  }
});
