/**
 * Módulo de extração automática de dados de documentos.
 *
 * Fluxo com Script de Triagem:
 * 1. TRIAGEM: Para cada documento do devedor, verifica pelo NOME do arquivo
 *    se existe uma docConfig que o identifica (sem baixar o arquivo).
 * 2. EXTRAÇÃO: Apenas os documentos identificados na triagem são baixados e
 *    processados para extração de dados.
 * 3. ATUALIZAÇÃO: Os campos extraídos são gravados nas extrações do devedor.
 */

import { getDb } from "./db";
import { clientes, docConfigs, extracoes, devedores } from "../drizzle/schema";
import { eq, and } from "drizzle-orm";
import { ENV } from "./_core/env";

// ─── Tipos ────────────────────────────────────────────────────────────────────

interface RegrasIdentificacao {
  palavrasChaveNomeArquivo?: string[];
  palavrasChaveConteudo?: string[];
  descricao?: string;
}

interface CampoExtracao {
  campo: string;
  descricao?: string;
  localizacao?: string;
  regex?: string;
  transformacao?: string;
}

interface MapeamentoCampos {
  dadoPlanilha01?: string;
  dadoPlanilha02?: string;
  dadoPlanilha03?: string;
  dadoPlanilha04?: string;
  multa2pct?: string;
  moraEspecifica?: string;
}

interface ConfigJson {
  regrasIdentificacao?: RegrasIdentificacao;
  camposExtracao?: CampoExtracao[];
  mapeamentoCampos?: MapeamentoCampos;
}

interface DocConfigComRegras {
  id: number;
  nomeDocumento: string;
  regrasIdentificacao: RegrasIdentificacao | null;
  camposExtracao: CampoExtracao[];
  mapeamentoCampos: MapeamentoCampos | null;
}

export interface CamposExtraidos {
  dadoPlanilha01?: string | null;
  dadoPlanilha02?: string | null;
  dadoPlanilha03?: string | null;
  dadoPlanilha04?: string | null;
  multa2pct?: "sim" | "nao" | "branco";
  moraEspecifica?: string | null;
  docConfigId?: number;
  nomeDocumento?: string;
}

/** Item do resultado da triagem: um documento e a regra que o identificou */
export interface ItemTriagem {
  fileKey: string;
  nomeArquivo: string;
  mimeType: string | null;
  docConfig: DocConfigComRegras;
}

/** Resultado completo da triagem de um devedor */
export interface ResultadoTriagem {
  identificados: ItemTriagem[];
  naoIdentificados: string[]; // nomes dos arquivos sem regra
}

// ─── Utilitários ──────────────────────────────────────────────────────────────

/** Normaliza string para comparação: minúsculas, sem acentos. */
function normStr(s: string): string {
  return s
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .trim();
}

/**
 * Verifica se o nome do arquivo contém alguma das palavras-chave (substring, case-insensitive, sem acentos).
 * Regra: basta CONTER a palavra-chave, não precisa ser o título completo.
 */
function identificarPeloNome(nomeArquivo: string, regras: RegrasIdentificacao): boolean {
  const nomeNorm = normStr(nomeArquivo);
  const palavras = regras.palavrasChaveNomeArquivo ?? [];
  if (palavras.length === 0) return false;
  return palavras.some((p) => nomeNorm.includes(normStr(p)));
}

/** Verifica se o conteúdo do documento contém alguma das palavras-chave. */
function identificarPorConteudo(texto: string, regras: RegrasIdentificacao): boolean {
  const textoNorm = normStr(texto);
  const palavras = regras.palavrasChaveConteudo ?? [];
  if (palavras.length === 0) return false;
  return palavras.some((p) => textoNorm.includes(normStr(p)));
}

/** Aplica uma regex ao texto e retorna o primeiro grupo capturado. */
function aplicarRegex(texto: string, regexStr: string): string | null {
  try {
    const regex = new RegExp(regexStr, "i");
    const match = texto.match(regex);
    return match?.[1]?.trim() ?? null;
  } catch {
    return null;
  }
}

/** Aplica transformações básicas ao valor extraído. */
function aplicarTransformacao(valor: string, transformacao?: string): string {
  if (!transformacao) return valor;
  const t = transformacao.toLowerCase();
  let resultado = valor;
  if (t.includes("remover r$") || t.includes("r$")) {
    resultado = resultado.replace(/R\$\s*/gi, "").trim();
  }
  if (t.includes("ponto de milhar") || t.includes("milhar")) {
    resultado = resultado.replace(/\./g, "");
  }
  return resultado.trim();
}

/** Extrai texto de um PDF a partir do buffer. */
async function extrairTextoPDF(buffer: Buffer): Promise<string | null> {
  try {
    const { PDFParse } = await import("pdf-parse");
    const parser = new PDFParse({ data: new Uint8Array(buffer) });
    const result = await parser.getText();
    return result.text ?? null;
  } catch (err) {
    console.error("[Extractor] Erro ao extrair texto do PDF:", err);
    return null;
  }
}

/**
 * Baixa o arquivo do S3 via Forge API (URL assinada fresca a cada chamada).
 * Evita o problema de URLs assinadas expiradas.
 */
async function baixarArquivo(fileKey: string): Promise<Buffer | null> {
  try {
    const forgeUrl = (ENV.forgeApiUrl ?? "").replace(/\/+$/, "");
    const forgeKey = ENV.forgeApiKey ?? "";
    if (!forgeUrl || !forgeKey) {
      console.error("[Extractor] Forge API não configurada");
      return null;
    }
    const normalizedKey = fileKey.replace(/^\/+/, "");
    const presignUrl = `${forgeUrl}/v1/storage/presign/get?path=${encodeURIComponent(normalizedKey)}`;
    const presignResp = await fetch(presignUrl, {
      headers: { Authorization: `Bearer ${forgeKey}` },
    });
    if (!presignResp.ok) {
      console.error(`[Extractor] Falha ao obter URL assinada para "${fileKey}": ${presignResp.status} ${presignResp.statusText}`);
      return null;
    }
    const { url } = (await presignResp.json()) as { url?: string };
    if (!url) {
      console.error("[Extractor] URL assinada vazia para:", fileKey);
      return null;
    }
    const resp = await fetch(url);
    if (!resp.ok) {
      console.error(`[Extractor] Erro ao baixar arquivo "${fileKey}": ${resp.status} ${resp.statusText}`);
      return null;
    }
    const arrayBuffer = await resp.arrayBuffer();
    return Buffer.from(arrayBuffer);
  } catch (err) {
    console.error("[Extractor] Exceção ao baixar arquivo:", err);
    return null;
  }
}

// ─── Busca de configurações ────────────────────────────────────────────────────

/**
 * Busca as docConfigs de um cliente pelo nome da cooperativa.
 * Faz matching fuzzy entre o nome da cooperativa e o nomeFantasia dos clientes.
 */
async function buscarDocConfigsDoCliente(cooperativa: string): Promise<DocConfigComRegras[]> {
  const db = await getDb();
  if (!db) return [];

  const todosClientes = await db.select().from(clientes);
  const cooperativaNorm = normStr(cooperativa);

  let clienteMatch = todosClientes.find((c) => normStr(c.nomeFantasia) === cooperativaNorm);
  if (!clienteMatch) {
    clienteMatch = todosClientes.find((c) => {
      const cn = normStr(c.nomeFantasia);
      return cn.includes(cooperativaNorm) || cooperativaNorm.includes(cn);
    });
  }

  if (!clienteMatch) {
    console.log(`[Extractor] Nenhum cliente encontrado para cooperativa: "${cooperativa}"`);
    return [];
  }
  console.log(`[Extractor] Cliente: "${clienteMatch.nomeFantasia}" (id=${clienteMatch.id})`);

  const configs = await db.select().from(docConfigs)
    .where(and(eq(docConfigs.clienteId, clienteMatch.id), eq(docConfigs.ativo, 1)));
  console.log(`[Extractor] ${configs.length} docConfig(s) para cliente ${clienteMatch.id}`);

  return configs
    .filter((c) => c.configJson || c.regrasIdentificacao)
    .map((c) => {
      let regrasId: RegrasIdentificacao | null = null;
      let camposExt: CampoExtracao[] = [];
      let mapeamento: MapeamentoCampos | null = null;

      if (c.configJson) {
        try {
          const cfg = JSON.parse(c.configJson) as ConfigJson;
          regrasId = cfg.regrasIdentificacao ?? null;
          camposExt = cfg.camposExtracao ?? [];
          mapeamento = cfg.mapeamentoCampos ?? null;
        } catch { /* ignorar */ }
      }
      if (!regrasId && c.regrasIdentificacao) {
        try { regrasId = JSON.parse(c.regrasIdentificacao) as RegrasIdentificacao; } catch { /* ignorar */ }
      }

      return {
        id: c.id,
        nomeDocumento: c.nomeDocumento,
        regrasIdentificacao: regrasId,
        camposExtracao: camposExt,
        mapeamentoCampos: mapeamento,
      };
    })
    .filter((c) => c.regrasIdentificacao !== null);
}

// ─── Script de Triagem ────────────────────────────────────────────────────────

/**
 * SCRIPT DE TRIAGEM: Mapeia cada documento para a regra de extração correspondente
 * usando APENAS o nome do arquivo (sem baixar nem ler o conteúdo).
 *
 * Retorna a lista de documentos identificados (com a docConfig associada)
 * e a lista de documentos não identificados.
 */
export async function triarDocumentos(
  documentos: Array<{ fileKey: string; nomeArquivo: string; mimeType: string | null }>,
  cooperativa: string
): Promise<ResultadoTriagem> {
  const docConfigsCliente = await buscarDocConfigsDoCliente(cooperativa);

  const identificados: ItemTriagem[] = [];
  const naoIdentificados: string[] = [];

  for (const doc of documentos) {
    let docConfigMatch: DocConfigComRegras | null = null;

    // Identificação pelo nome do arquivo (substring, case-insensitive)
    for (const cfg of docConfigsCliente) {
      if (cfg.regrasIdentificacao && identificarPeloNome(doc.nomeArquivo, cfg.regrasIdentificacao)) {
        docConfigMatch = cfg;
        break;
      }
    }

    if (docConfigMatch) {
      console.log(`[Triagem] ✓ "${doc.nomeArquivo}" → ${docConfigMatch.nomeDocumento}`);
      identificados.push({ ...doc, docConfig: docConfigMatch });
    } else {
      console.log(`[Triagem] ✗ "${doc.nomeArquivo}" — sem regra correspondente`);
      naoIdentificados.push(doc.nomeArquivo);
    }
  }

  console.log(`[Triagem] Resultado: ${identificados.length} identificado(s), ${naoIdentificados.length} sem regra`);
  return { identificados, naoIdentificados };
}

// ─── Extração de campos ───────────────────────────────────────────────────────

/**
 * Extrai os campos de um documento já identificado na triagem.
 * Recebe o buffer do arquivo e a docConfig associada.
 */
async function extrairCamposDeDocumentoIdentificado(
  nomeArquivo: string,
  buffer: Buffer,
  mimeType: string | null,
  docConfig: DocConfigComRegras
): Promise<CamposExtraidos> {
  const resultado: CamposExtraidos = {
    docConfigId: docConfig.id,
    nomeDocumento: docConfig.nomeDocumento,
  };

  // Extrair texto do PDF
  const isPdf = mimeType?.includes("pdf") || nomeArquivo.toLowerCase().endsWith(".pdf");
  if (!isPdf) {
    console.log(`[Extractor] Documento não é PDF, pulando extração de texto: "${nomeArquivo}"`);
    return resultado;
  }

  const textoPDF = await extrairTextoPDF(buffer);
  if (!textoPDF) {
    console.log(`[Extractor] Não foi possível extrair texto de: "${nomeArquivo}"`);
    return resultado;
  }

  // Verificação adicional por conteúdo (se configurada)
  const regras = docConfig.regrasIdentificacao;
  if (regras?.palavrasChaveConteudo && regras.palavrasChaveConteudo.length > 0) {
    if (!identificarPorConteudo(textoPDF, regras)) {
      console.log(`[Extractor] Documento "${nomeArquivo}" não confirmado pelo conteúdo — pulando extração`);
      return resultado;
    }
  }

  // Aplicar regras de extração
  for (const campo of docConfig.camposExtracao) {
    if (!campo.regex || !campo.campo) continue;

    const valorExtraido = aplicarRegex(textoPDF, campo.regex);
    if (!valorExtraido) continue;

    const valorFinal = aplicarTransformacao(valorExtraido, campo.transformacao);
    const campoNorm = campo.campo.toLowerCase().replace(/[_\s]/g, "");

    if (campoNorm === "dadoplanilha01" || campoNorm === "dado01") {
      resultado.dadoPlanilha01 = valorFinal;
    } else if (campoNorm === "dadoplanilha02" || campoNorm === "dado02") {
      resultado.dadoPlanilha02 = valorFinal;
    } else if (campoNorm === "dadoplanilha03" || campoNorm === "dado03") {
      resultado.dadoPlanilha03 = valorFinal;
    } else if (campoNorm === "dadoplanilha04" || campoNorm === "dado04") {
      resultado.dadoPlanilha04 = valorFinal;
    } else if (campoNorm === "multa2pct" || campoNorm === "multa2%" || campoNorm === "multa") {
      const vNorm = normStr(valorFinal);
      resultado.multa2pct =
        vNorm.includes("sim") || vNorm === "1" || vNorm === "true" ? "sim" :
        vNorm.includes("nao") || vNorm.includes("não") || vNorm === "0" ? "nao" :
        "branco";
    } else if (campoNorm === "moraespecifica" || campoNorm === "mora") {
      resultado.moraEspecifica = valorFinal;
    }
  }

  console.log(`[Extractor] Campos extraídos de "${nomeArquivo}":`, JSON.stringify(resultado));
  return resultado;
}

// ─── Gravação no banco ────────────────────────────────────────────────────────

async function gravarExtracoes(devedorId: number, loteId: number, campos: CamposExtraidos): Promise<void> {
  const db = await getDb();
  if (!db) return;

  const extracoesDev = await db.select().from(extracoes).where(eq(extracoes.devedorId, devedorId));

  if (extracoesDev.length === 0) {
    // Inicializar extrações a partir dos contratos do devedor
    const devResult = await db.select().from(devedores).where(eq(devedores.id, devedorId)).limit(1);
    const contratosStr = devResult[0]?.contratos;
    if (contratosStr) {
      const contratos = contratosStr.split(/\s*\/\s*/).map((c) => c.trim()).filter(Boolean);
      if (contratos.length > 0) {
        await db.insert(extracoes).values(contratos.map((c) => ({
          devedorId,
          loteId,
          numeroContrato: c,
          dadoPlanilha01: campos.dadoPlanilha01 ?? null,
          dadoPlanilha02: campos.dadoPlanilha02 ?? null,
          dadoPlanilha03: campos.dadoPlanilha03 ?? null,
          dadoPlanilha04: campos.dadoPlanilha04 ?? null,
          multa2pct: campos.multa2pct ?? "branco",
          moraEspecifica: campos.moraEspecifica ?? null,
        })));
        console.log(`[Extractor] Extrações inicializadas: devedor ${devedorId}, ${contratos.length} contrato(s)`);
      }
    }
  } else {
    // Atualizar apenas os campos que foram extraídos
    const updateData: Record<string, unknown> = {};
    if (campos.dadoPlanilha01 !== undefined) updateData.dadoPlanilha01 = campos.dadoPlanilha01;
    if (campos.dadoPlanilha02 !== undefined) updateData.dadoPlanilha02 = campos.dadoPlanilha02;
    if (campos.dadoPlanilha03 !== undefined) updateData.dadoPlanilha03 = campos.dadoPlanilha03;
    if (campos.dadoPlanilha04 !== undefined) updateData.dadoPlanilha04 = campos.dadoPlanilha04;
    if (campos.multa2pct !== undefined) updateData.multa2pct = campos.multa2pct;
    if (campos.moraEspecifica !== undefined) updateData.moraEspecifica = campos.moraEspecifica;

    if (Object.keys(updateData).length > 0) {
      for (const ext of extracoesDev) {
        await db.update(extracoes).set(updateData).where(eq(extracoes.id, ext.id));
      }
      console.log(`[Extractor] Extrações atualizadas: devedor ${devedorId}, ${extracoesDev.length} contrato(s)`);
    }
  }
}

// ─── API pública ──────────────────────────────────────────────────────────────

/**
 * Processa um documento já identificado na triagem:
 * baixa o arquivo, extrai os campos e grava no banco.
 *
 * @param item - Item da triagem (documento + docConfig associada)
 * @param devedorId - ID do devedor
 * @param loteId - ID do lote
 * @param buffer - Buffer do arquivo (se disponível, evita download do S3)
 */
export async function processarItemTriagem(
  item: ItemTriagem,
  devedorId: number,
  loteId: number,
  buffer?: Buffer
): Promise<CamposExtraidos | null> {
  try {
    // Obter buffer do arquivo
    const buf = buffer ?? await baixarArquivo(item.fileKey);
    if (!buf) {
      console.error(`[Extractor] Não foi possível obter buffer para: "${item.nomeArquivo}"`);
      return null;
    }

    // Extrair campos
    const campos = await extrairCamposDeDocumentoIdentificado(
      item.nomeArquivo, buf, item.mimeType, item.docConfig
    );

    // Gravar no banco
    await gravarExtracoes(devedorId, loteId, campos);

    return campos;
  } catch (err) {
    console.error(`[Extractor] Erro ao processar "${item.nomeArquivo}":`, err);
    return null;
  }
}

/**
 * Processa todos os documentos de um devedor:
 * 1. Triagem pelo nome do arquivo
 * 2. Download e extração apenas dos identificados
 * 3. Gravação no banco
 *
 * Compatibilidade: mantém a assinatura anterior para não quebrar chamadas existentes.
 */
export async function processarDocumentoUploadado(params: {
  fileKey: string;
  nomeArquivo: string;
  mimeType: string | null;
  buffer?: Buffer;
  devedorId: number;
  loteId: number;
  cooperativa: string;
}): Promise<CamposExtraidos | null> {
  const { fileKey, nomeArquivo, mimeType, devedorId, loteId, cooperativa } = params;

  try {
    // Triagem: verificar se este documento tem uma regra configurada
    const triagem = await triarDocumentos(
      [{ fileKey, nomeArquivo, mimeType }],
      cooperativa
    );

    if (triagem.identificados.length === 0) {
      console.log(`[Extractor] Documento não identificado na triagem: "${nomeArquivo}"`);
      return null;
    }

    const item = triagem.identificados[0];
    return await processarItemTriagem(item, devedorId, loteId, params.buffer);
  } catch (err) {
    console.error("[Extractor] Erro ao processar documento:", err);
    return null;
  }
}
