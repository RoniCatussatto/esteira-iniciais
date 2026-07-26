/**
 * Módulo de extração automática de dados de documentos.
 *
 * Fluxo:
 * 1. Recebe o buffer do arquivo e o nome do arquivo
 * 2. Busca o cliente pelo nome da cooperativa do lote
 * 3. Encontra as docConfigs configuradas para esse cliente
 * 4. Identifica o tipo de documento pelo nome do arquivo (palavrasChaveNomeArquivo)
 * 5. Extrai o texto do PDF usando pdf-parse
 * 6. Aplica as regras de extração (regex) para preencher os campos
 * 7. Retorna os campos extraídos
 */

import { getDb } from "./db";
import { clientes, docConfigs, extracoes, devedores } from "../drizzle/schema";
import { eq, and } from "drizzle-orm";
import { ENV } from "./_core/env";

// Tipos para as regras de configuração
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

/**
 * Normaliza string para comparação: minúsculas, sem acentos.
 */
function normStr(s: string): string {
  return s
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .trim();
}

/**
 * Verifica se o nome do arquivo corresponde às palavras-chave de identificação.
 */
function identificarDocumento(nomeArquivo: string, regras: RegrasIdentificacao): boolean {
  const nomeNorm = normStr(nomeArquivo);
  const palavras = regras.palavrasChaveNomeArquivo ?? [];
  if (palavras.length === 0) return false;
  return palavras.some((p) => nomeNorm.includes(normStr(p)));
}

/**
 * Verifica se o conteúdo do documento corresponde às palavras-chave de identificação.
 */
function identificarPorConteudo(texto: string, regras: RegrasIdentificacao): boolean {
  const textoNorm = normStr(texto);
  const palavras = regras.palavrasChaveConteudo ?? [];
  if (palavras.length === 0) return false;
  return palavras.some((p) => textoNorm.includes(normStr(p)));
}

/**
 * Aplica uma regex ao texto e retorna o primeiro grupo capturado.
 */
function aplicarRegex(texto: string, regexStr: string): string | null {
  try {
    const regex = new RegExp(regexStr, "i");
    const match = texto.match(regex);
    return match?.[1]?.trim() ?? null;
  } catch {
    return null;
  }
}

/**
 * Aplica transformações básicas ao valor extraído.
 */
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

/**
 * Extrai texto de um PDF a partir do buffer.
 * Retorna o texto completo ou null em caso de erro.
 */
async function extrairTextoPDF(buffer: Buffer): Promise<string | null> {
  try {
    // Importação dinâmica para evitar problemas de inicialização
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
 * Baixa o arquivo do S3 e retorna o buffer.
 * Usa o proxy interno do Forge para evitar problemas com URLs assinadas expiradas.
 */
async function baixarArquivo(fileKey: string): Promise<Buffer | null> {
  try {
    // Usar a URL de presign via Forge API (server-side, não expira durante o download)
    const forgeUrl = ENV.forgeApiUrl?.replace(/\/+$/, "");
    const forgeKey = ENV.forgeApiKey;
    if (!forgeUrl || !forgeKey) {
      console.error("[Extractor] Forge API não configurada");
      return null;
    }
    const normalizedKey = fileKey.replace(/^\/+/, "");
    const presignUrl = new URL("v1/storage/presign/get", forgeUrl + "/");
    presignUrl.searchParams.set("path", normalizedKey);
    const presignResp = await fetch(presignUrl, {
      headers: { Authorization: `Bearer ${forgeKey}` },
    });
    if (!presignResp.ok) {
      console.error("[Extractor] Falha ao obter URL assinada:", presignResp.status);
      return null;
    }
    const { url } = (await presignResp.json()) as { url: string };
    if (!url) { console.error("[Extractor] URL assinada vazia"); return null; }
    const resp = await fetch(url);
    if (!resp.ok) {
      console.error("[Extractor] Erro ao baixar arquivo:", resp.status, resp.statusText);
      return null;
    }
    const arrayBuffer = await resp.arrayBuffer();
    return Buffer.from(arrayBuffer);
  } catch (err) {
    console.error("[Extractor] Erro ao baixar arquivo do S3:", err);
    return null;
  }
}

/**
 * Busca as docConfigs de um cliente pelo nome da cooperativa.
 * Faz matching fuzzy entre o nome da cooperativa e o nomeFantasia dos clientes.
 */
async function buscarDocConfigsDoCliente(cooperativa: string): Promise<DocConfigComRegras[]> {
  const db = await getDb();
  if (!db) return [];

  // Buscar todos os clientes e fazer matching pelo nomeFantasia
  const todosClientes = await db.select().from(clientes);
  const cooperativaNorm = normStr(cooperativa);

  // Tentar match exato primeiro, depois parcial
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
  console.log(`[Extractor] Cliente encontrado: "${clienteMatch.nomeFantasia}" (id=${clienteMatch.id}) para cooperativa "${cooperativa}"`);

  // Buscar docConfigs configuradas para esse cliente
  const configs = await db.select().from(docConfigs)
    .where(and(eq(docConfigs.clienteId, clienteMatch.id), eq(docConfigs.ativo, 1)));
  console.log(`[Extractor] ${configs.length} docConfig(s) encontrada(s) para cliente ${clienteMatch.id}`);

  return configs
    .filter((c) => c.configJson || c.regrasIdentificacao)
    .map((c) => {
      let regrasId: RegrasIdentificacao | null = null;
      let camposExt: CampoExtracao[] = [];
      let mapeamento: MapeamentoCampos | null = null;

      // Tentar parsear configJson primeiro (tem tudo)
      if (c.configJson) {
        try {
          const cfg = JSON.parse(c.configJson) as ConfigJson;
          regrasId = cfg.regrasIdentificacao ?? null;
          camposExt = cfg.camposExtracao ?? [];
          mapeamento = cfg.mapeamentoCampos ?? null;
          console.log(`[Extractor] DocConfig ${c.id} (${c.nomeDocumento}): regrasId=${JSON.stringify(regrasId)}, campos=${camposExt.length}`);
        } catch { /* ignorar */ }
      }

      // Fallback: regrasIdentificacao salvo separadamente
      if (!regrasId && c.regrasIdentificacao) {
        try { regrasId = JSON.parse(c.regrasIdentificacao) as RegrasIdentificacao; } catch { /* ignorar */ }
        if (regrasId) console.log(`[Extractor] DocConfig ${c.id} (${c.nomeDocumento}): regrasId via fallback=${JSON.stringify(regrasId)}`);
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

/**
 * Extrai campos de um documento usando as regras configuradas.
 * Retorna os campos extraídos ou null se o documento não for identificado.
 */
async function extrairCamposDeDocumento(
  nomeArquivo: string,
  buffer: Buffer,
  mimeType: string | null,
  docConfigsCliente: DocConfigComRegras[]
): Promise<CamposExtraidos | null> {
  if (docConfigsCliente.length === 0) return null;

  // 1. Identificar o tipo de documento pelo nome do arquivo
  let docConfigIdentificada: DocConfigComRegras | null = null;
  for (const cfg of docConfigsCliente) {
    if (cfg.regrasIdentificacao && identificarDocumento(nomeArquivo, cfg.regrasIdentificacao)) {
      docConfigIdentificada = cfg;
      break;
    }
  }
  if (!docConfigIdentificada) {
    console.log(`[Extractor] Nenhuma docConfig identificou pelo nome "${nomeArquivo}". Palavras testadas:`,
      docConfigsCliente.map(c => ({ doc: c.nomeDocumento, palavras: c.regrasIdentificacao?.palavrasChaveNomeArquivo }))
    );
  }

  // 2. Se não identificou pelo nome, tentar pelo conteúdo (apenas PDFs)
  let textoPDF: string | null = null;
  if (!docConfigIdentificada && (mimeType?.includes("pdf") || nomeArquivo.toLowerCase().endsWith(".pdf"))) {
    textoPDF = await extrairTextoPDF(buffer);
    if (textoPDF) {
      for (const cfg of docConfigsCliente) {
        if (cfg.regrasIdentificacao && identificarPorConteudo(textoPDF, cfg.regrasIdentificacao)) {
          docConfigIdentificada = cfg;
          break;
        }
      }
    }
  }

  if (!docConfigIdentificada) {
    console.log(`[Extractor] Documento não identificado: "${nomeArquivo}"`);
    return null;
  }

  console.log(`[Extractor] Documento identificado: "${nomeArquivo}" → ${docConfigIdentificada.nomeDocumento}`);

  // 3. Extrair texto do PDF se ainda não foi feito
  if (!textoPDF && (mimeType?.includes("pdf") || nomeArquivo.toLowerCase().endsWith(".pdf"))) {
    textoPDF = await extrairTextoPDF(buffer);
  }

  if (!textoPDF) {
    console.log(`[Extractor] Não foi possível extrair texto do documento: "${nomeArquivo}"`);
    return { docConfigId: docConfigIdentificada.id, nomeDocumento: docConfigIdentificada.nomeDocumento };
  }

  // 4. Aplicar as regras de extração
  const resultado: CamposExtraidos = {
    docConfigId: docConfigIdentificada.id,
    nomeDocumento: docConfigIdentificada.nomeDocumento,
  };

  for (const campo of docConfigIdentificada.camposExtracao) {
    if (!campo.regex || !campo.campo) continue;

    const valorExtraido = aplicarRegex(textoPDF, campo.regex);
    if (!valorExtraido) continue;

    const valorFinal = aplicarTransformacao(valorExtraido, campo.transformacao);

    // Mapear para o campo correto
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
      if (vNorm.includes("sim") || vNorm.includes("s") || vNorm === "1" || vNorm === "true") {
        resultado.multa2pct = "sim";
      } else if (vNorm.includes("nao") || vNorm.includes("não") || vNorm === "0" || vNorm === "false") {
        resultado.multa2pct = "nao";
      } else {
        resultado.multa2pct = "branco";
      }
    } else if (campoNorm === "moraespecifica" || campoNorm === "mora") {
      resultado.moraEspecifica = valorFinal;
    }
  }

  return resultado;
}

/**
 * Processa um documento recém-uploadado: identifica o tipo, extrai dados e
 * atualiza as extrações do devedor no banco.
 *
 * @param params.fileKey - Chave do arquivo no S3
 * @param params.nomeArquivo - Nome original do arquivo
 * @param params.mimeType - MIME type do arquivo
 * @param params.buffer - Buffer do arquivo (se disponível, evita download do S3)
 * @param params.devedorId - ID do devedor
 * @param params.loteId - ID do lote
 * @param params.cooperativa - Nome da cooperativa/cliente
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
    // 1. Buscar docConfigs do cliente
    const docConfigsCliente = await buscarDocConfigsDoCliente(cooperativa);
    if (docConfigsCliente.length === 0) {
      console.log(`[Extractor] Nenhuma docConfig configurada para cooperativa: "${cooperativa}"`);
      return null;
    }

    // 2. Obter o buffer do arquivo
    let buffer = params.buffer;
    if (!buffer) {
      buffer = await baixarArquivo(fileKey) ?? undefined;
      if (!buffer) return null;
    }

    // 3. Extrair campos do documento
    const campos = await extrairCamposDeDocumento(nomeArquivo, buffer, mimeType, docConfigsCliente);
    if (!campos) return null;

    // 4. Atualizar as extrações no banco (todos os contratos do devedor)
    const db = await getDb();
    if (!db) return campos;

    // Buscar extrações existentes do devedor
    const extracoesDev = await db.select().from(extracoes)
      .where(eq(extracoes.devedorId, devedorId));

    if (extracoesDev.length === 0) {
      // Inicializar extrações a partir dos contratos do devedor
      const devedor = await db.select().from(devedores).where(eq(devedores.id, devedorId)).limit(1);
      const contratosStr = devedor[0]?.contratos;
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
          console.log(`[Extractor] Extrações inicializadas para devedor ${devedorId}: ${contratos.length} contrato(s)`);
        }
      }
    } else {
      // Atualizar extrações existentes (apenas campos que foram extraídos)
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
        console.log(`[Extractor] Extrações atualizadas para devedor ${devedorId}: ${extracoesDev.length} contrato(s)`);
      }
    }

    return campos;
  } catch (err) {
    console.error("[Extractor] Erro ao processar documento:", err);
    return null;
  }
}
