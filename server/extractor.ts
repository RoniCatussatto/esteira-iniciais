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
  palavrasExclusaoNomeArquivo?: string[];
}

interface CampoExtracao {
  campo: string;
  descricao?: string;
  localizacao?: string;
  regex?: string;
  transformacao?: string;
  identificaContrato?: boolean; // se true, o valor extraído é o número do contrato
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
  prioridade?: number; // 0 = alta prioridade (Fatura), 1 = normal (Extrato), etc.
}

interface DocConfigComRegras {
  id: number;
  nomeDocumento: string;
  regrasIdentificacao: RegrasIdentificacao | null;
  camposExtracao: CampoExtracao[];
  mapeamentoCampos: MapeamentoCampos | null;
  prioridade?: number;
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
  numeroContratoIdentificado?: string | null; // contrato identificado no nome do arquivo
  prioridade?: number; // quanto menor, maior a prioridade (0 = Fatura, 1 = Extrato, etc.)
}

/** Item do resultado da triagem: um documento e a regra que o identificou */
export interface ItemTriagem {
  fileKey: string;
  nomeArquivo: string;
  mimeType: string | null;
  docConfig: DocConfigComRegras;
  numeroContratoNoNome?: string | null; // número do contrato extraído do nome do arquivo
}

/** Resultado completo da triagem de um devedor */
export interface ResultadoTriagem {
  identificados: ItemTriagem[];
  naoIdentificados: string[]; // nomes dos arquivos sem regra
}

// ─── Utilitários ──────────────────────────────────────────────────────────────

/** Normaliza string para comparação: minúsculas, sem acentos. */
function normStr(s: string): string {
  const str = typeof s === "string" ? s : Buffer.isBuffer(s) ? (s as Buffer).toString("utf8") : String(s);
  return str
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
  const contemPalavraChave = palavras.some((p) => nomeNorm.includes(normStr(p)));
  if (!contemPalavraChave) return false;
  // Verificar palavras de exclusão: se o nome contiver alguma, não identificar
  const exclusoes = regras.palavrasExclusaoNomeArquivo ?? [];
  if (exclusoes.some((e) => nomeNorm.includes(normStr(e)))) return false;
  return true;
}

/** Verifica se o conteúdo do documento contém alguma das palavras-chave. */
function identificarPorConteudo(texto: string, regras: RegrasIdentificacao): boolean {
  const textoNorm = normStr(texto);
  const palavras = regras.palavrasChaveConteudo ?? [];
  if (palavras.length === 0) return false;
  return palavras.some((p) => textoNorm.includes(normStr(p)));
}

/**
 * Tenta extrair o número do contrato do nome do arquivo.
 * Estratégias (em ordem de prioridade):
 * 1. Regex configurada na docConfig (campo com identificaContrato=true)
 * 2. Padrão genérico: sequência de 5+ dígitos após hífen ou espaço no nome
 */
function extrairContratoDoNome(nomeArquivo: string, camposExtracao: CampoExtracao[]): string | null {
  // Estratégia 1: usar regex de campo marcado como identificaContrato
  const campoContrato = camposExtracao.find((c) => c.identificaContrato);
  if (campoContrato?.regex) {
    try {
      const match = nomeArquivo.match(new RegExp(campoContrato.regex, "i"));
      if (match?.[1]) return match[1].trim();
    } catch { /* ignorar regex inválida */ }
  }

  // Estratégia 2: padrão genérico — sequência de 5+ dígitos após " - ", "- ", " -" ou espaço
  // Exemplo: "FATURA - 330525.pdf" → "330525"
  //          "FATURA - 6655480.pdf" → "6655480"
  const semExtensao = nomeArquivo.replace(/\.[^.]+$/, "");
  const matchGenerico = semExtensao.match(/[-\s]+([0-9]{5,})\s*$/);
  if (matchGenerico?.[1]) return matchGenerico[1].trim();

  // Estratégia 3: qualquer sequência de 5+ dígitos no nome
  const matchQualquer = semExtensao.match(/([0-9]{5,})/);
  if (matchQualquer?.[1]) return matchQualquer[1].trim();

  return null;
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
  if (t === "removerpontomilhar" || t.includes("removerponto")) {
    resultado = resultado.replace(/\./g, "");
  }
  return resultado.trim();
}

/** Extrai texto de um PDF a partir do buffer. */
export async function extrairTextoPDF(buffer: Buffer): Promise<string | null> {
  try {
    const { PDFParse } = await import("pdf-parse");
    const parser = new PDFParse({ data: new Uint8Array(buffer) });
    const result = await parser.getText();
    const texto = result.text ?? null;
    if (texto) {
      const linhas = texto.split('\n').length;
      console.log(`[Extractor] PDF parseado: ${texto.length} chars, ${linhas} linhas`);
    } else {
      console.warn("[Extractor] PDF parseado mas texto vazio/null");
    }
    return texto;
  } catch (err) {
    console.error("[Extractor] Erro ao extrair texto do PDF:", err);
    return null;
  }
}

/**
 * Exporta a função baixarArquivo para uso externo (ex: re-extração de texto).
 */
export { baixarArquivo };

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
      let prioridade: number | undefined = undefined;

      if (c.configJson) {
        try {
          const cfg = JSON.parse(c.configJson) as ConfigJson;
          regrasId = cfg.regrasIdentificacao ?? null;
          camposExt = cfg.camposExtracao ?? [];
          mapeamento = cfg.mapeamentoCampos ?? null;
          prioridade = cfg.prioridade;
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
        prioridade,
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
      const numeroContratoNoNome = extrairContratoDoNome(doc.nomeArquivo, docConfigMatch.camposExtracao);
      console.log(`[Triagem]   Contrato no nome: ${numeroContratoNoNome ?? "(não identificado)"}`);
      identificados.push({ ...doc, docConfig: docConfigMatch, numeroContratoNoNome });
    } else {
      console.log(`[Triagem] ✗ "${doc.nomeArquivo}" — sem regra correspondente`);
      naoIdentificados.push(doc.nomeArquivo);
    }
  }

  console.log(`[Triagem] Resultado: ${identificados.length} identificado(s), ${naoIdentificados.length} sem regra`);
  return { identificados, naoIdentificados };
}

// ─── Extração de campos ───────────────────────────────────────────────────────

/** Atribui um valor extraído ao campo correto do resultado. */
function atribuirCampo(resultado: CamposExtraidos, campoNorm: string, valorFinal: string): void {
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
  return _extrairCamposComTexto(nomeArquivo, textoPDF, docConfig, resultado);
}

/**
 * Extrai os campos de um documento usando texto já extraído (sem buffer).
 * Usado para re-extração de documentos cujo texto foi salvo no banco.
 */
async function extrairCamposDeDocumentoIdentificadoComTexto(
  nomeArquivo: string,
  textoExtraido: string,
  docConfig: DocConfigComRegras
): Promise<CamposExtraidos> {
  const resultado: CamposExtraidos = {
    docConfigId: docConfig.id,
    nomeDocumento: docConfig.nomeDocumento,
  };
  return _extrairCamposComTexto(nomeArquivo, textoExtraido, docConfig, resultado);
}

/** Lógica compartilhada de extração de campos a partir do texto do PDF. */
function _extrairCamposComTexto(
  nomeArquivo: string,
  textoPDF: string,
  docConfig: DocConfigComRegras,
  resultado: CamposExtraidos
): CamposExtraidos {
  // Propagar prioridade da configuração para o resultado
  if (docConfig.prioridade !== undefined) resultado.prioridade = docConfig.prioridade;

  // Verificação adicional por conteúdo (se configurada)
  const regras = docConfig.regrasIdentificacao;
  if (regras?.palavrasChaveConteudo && regras.palavrasChaveConteudo.length > 0) {
    if (!identificarPorConteudo(textoPDF, regras)) {
      console.log(`[Extractor] Documento "${nomeArquivo}" não confirmado pelo conteúdo — pulando extração`);
      return resultado;
    }
  }

  // ── Passo 1: Extrair todos os campos intermediários para um dicionário ──
  const camposIntermedios: Record<string, string> = {};

  // Adicionar número do contrato do nome do arquivo como campo especial
  const contratoDoNome = extrairContratoDoNome(nomeArquivo, docConfig.camposExtracao);
  if (contratoDoNome) {
    camposIntermedios["numerocontratoarquivo"] = contratoDoNome;
    camposIntermedios["numerocontrato"] = contratoDoNome;
    camposIntermedios["contrato"] = contratoDoNome;
  }

  for (const campo of docConfig.camposExtracao) {
    if (!campo.campo) continue;

    // Verificar se a extração é do nome do arquivo (não do conteúdo do PDF)
    const locNorm = normStr(campo.localizacao ?? "");
    const extrairDoNome = locNorm.includes("nome") || locNorm.includes("titulo") || locNorm.includes("arquivo");

    if (campo.regex) {
      const textoFonte = extrairDoNome ? nomeArquivo : textoPDF;
      const valorExtraido = aplicarRegex(textoFonte, campo.regex);
      if (valorExtraido) {
        const valorFinal = aplicarTransformacao(valorExtraido, campo.transformacao);
        if (valorFinal) {
          const chave = normStr(campo.campo).replace(/[_\s]/g, "");
          camposIntermedios[chave] = valorFinal;
          console.log(`[Extractor] Campo intermediário "${campo.campo}" = "${valorFinal}"`);
        }
      }
    }
  }
  // Suporte a extração por índice de linha (campo.linhaIndice ou campo.linhaCond)
  const linhas = textoPDF.split("\n").map((l: string) => l.trim());
  for (const campo of docConfig.camposExtracao) {
    if (!campo.campo) continue;
    const chave = normStr(campo.campo).replace(/[_\s]/g, "");
    // Já extraído por regex — pular
    if (camposIntermedios[chave] !== undefined) continue;

    // Extração por índice fixo: campo.linhaIndice (número)
    const linhaIdx = (campo as { linhaIndice?: number }).linhaIndice;
    if (typeof linhaIdx === "number") {
      const valorBruto = linhas[linhaIdx] ?? "";
      if (valorBruto) {
        const valorFinal = aplicarTransformacao(valorBruto, campo.transformacao) ?? valorBruto;
        camposIntermedios[chave] = valorFinal;
        console.log(`[Extractor] Campo intermediário (linha ${linhaIdx}) "${campo.campo}" = "${valorFinal}"`);
      }
    }

    // Extração condicional por índice: campo.linhaCond = { condicaoLinha, condicaoContem, linhaSeVerdadeiro, linhaSefalso }
    const linhaCond = (campo as { linhaCond?: { condicaoLinha: number; condicaoContem: string; linhaSeVerdadeiro: number; linhaSefalso: number } }).linhaCond;
    if (linhaCond) {
      const valorCondicao = linhas[linhaCond.condicaoLinha] ?? "";
      const condicaoAtendida = normStr(valorCondicao).includes(normStr(linhaCond.condicaoContem));
      const linhaAlvo = condicaoAtendida ? linhaCond.linhaSeVerdadeiro : linhaCond.linhaSefalso;
      const valorBruto = linhas[linhaAlvo] ?? "";
      if (valorBruto) {
        const valorFinal = aplicarTransformacao(valorBruto, campo.transformacao) ?? valorBruto;
        camposIntermedios[chave] = valorFinal;
        console.log(`[Extractor] Campo intermediário (linhaCond[${linhaAlvo}]) "${campo.campo}" = "${valorFinal}"`);
      }
    }

    // Extração especial: campo.linhaEspecial = "saldoQuitacao" (lógica do script original)
    const linhaEspecial = (campo as { linhaEspecial?: string }).linhaEspecial;
    if (linhaEspecial === "saldoQuitacao") {
      // Linha 43: "Valor Líquido" — começa com número quando há inadimplência
      // Ex: "8.503,49\tTaxa Juros Inad: % a.m.\t3,0100"
      // Quando não há inadimplência, linha 43 = "% a.m." → usa linha 29
      const val43 = linhas[43] ?? "";
      const match43 = val43.match(/^([\d.,]+)/);
      let saldo = match43 ? match43[1] : (linhas[29] ?? "");
      if (saldo) {
        const valorFinal = aplicarTransformacao(saldo, campo.transformacao) ?? saldo;
        camposIntermedios[chave] = valorFinal;
        console.log(`[Extractor] Campo intermediário (saldoQuitacao especial) "${campo.campo}" = "${valorFinal}"`);
      }
    }
  }

  // ── Passo 2: Aplicar mapeamentoCampos para preencher campos finais ──
  if (docConfig.mapeamentoCampos) {
    const mp = docConfig.mapeamentoCampos;

    for (const [campoFinal, valorMapeamento] of Object.entries(mp)) {
      if (!valorMapeamento) continue;

      let valorResolvido: string | null = null;

      if (typeof valorMapeamento === "string") {
        // Valor fixo (ex: "nao") ou referência a campo intermediário (ex: "modalidade")
        const chaveRef = normStr(valorMapeamento).replace(/[_\s]/g, "");
        if (camposIntermedios[chaveRef] !== undefined) {
          // É uma referência a campo intermediário
          valorResolvido = camposIntermedios[chaveRef];
        } else {
          // É um valor fixo
          valorResolvido = valorMapeamento;
        }
      } else if (typeof valorMapeamento === "object" && "condicional" in (valorMapeamento as object)) {
        // Mapeamento condicional: { condicional: { campo, contem, entao, senao } }
        const cond = (valorMapeamento as { condicional: { campo: string; contem: string; entao: string | null; senao: string | null } }).condicional;
        const campoCondNorm = normStr(cond.campo).replace(/[_\s]/g, "");
        const valorCampoCond = camposIntermedios[campoCondNorm] ?? "";
        const condicaoAtendida = normStr(valorCampoCond).includes(normStr(cond.contem));
        const refEscolhida = condicaoAtendida ? cond.entao : cond.senao;

        if (refEscolhida === null || refEscolhida === undefined) {
          // Condição resulta em null — não preencher este campo
          console.log(`[Extractor] Mapeamento condicional "${campoFinal}": condição=${condicaoAtendida}, resultado=null (não preencher)`);
          continue;
        }

        const refNorm = normStr(refEscolhida).replace(/[_\s]/g, "");
        if (camposIntermedios[refNorm] !== undefined) {
          valorResolvido = camposIntermedios[refNorm];
        } else {
          // Pode ser valor fixo
          valorResolvido = refEscolhida;
        }
        console.log(`[Extractor] Mapeamento condicional "${campoFinal}": campo="${cond.campo}"="${valorCampoCond}", contem="${cond.contem}"=${condicaoAtendida}, ref="${refEscolhida}" → "${valorResolvido}"`);
      }

      if (valorResolvido !== null) {
        const campoFinalNorm = normStr(campoFinal).replace(/[_\s]/g, "");
        atribuirCampo(resultado, campoFinalNorm, valorResolvido);
      }
    }
  }

  console.log(`[Extractor] Campos extraídos de "${nomeArquivo}":`, JSON.stringify(resultado));
  return resultado;
}

// ─── Gravação no banco ────────────────────────────────────────────────────────

async function gravarExtracoes(devedorId: number, loteId: number, campos: CamposExtraidos): Promise<void> {
  const db = await getDb();
  if (!db) return;

  const extracoesDev = await db.select().from(extracoes).where(and(eq(extracoes.devedorId, devedorId), eq(extracoes.loteId, loteId)));

  // Determinar o contrato alvo: usar o número identificado no nome do arquivo
  const contratoAlvo = campos.numeroContratoIdentificado?.trim() ?? null;
  console.log(`[Extractor] Contrato alvo: ${contratoAlvo ?? "(todos)"}`);

  if (extracoesDev.length === 0) {
    // Inicializar extrações a partir dos contratos do devedor
    const devResult = await db.select().from(devedores).where(eq(devedores.id, devedorId)).limit(1);
    const contratosStr = devResult[0]?.contratos;
    if (contratosStr) {
      const contratos = contratosStr.split(/\s*\/\s*/).map((c) => c.trim()).filter(Boolean);
      if (contratos.length > 0) {
        // Se temos um contrato alvo, aplicar dados apenas nele; nos demais, inicializar em branco
        await db.insert(extracoes).values(contratos.map((c) => {
          const isAlvo = !contratoAlvo || c === contratoAlvo;
          return {
            devedorId,
            loteId,
            numeroContrato: c,
            dadoPlanilha01: isAlvo ? (campos.dadoPlanilha01 ?? null) : null,
            dadoPlanilha02: isAlvo ? (campos.dadoPlanilha02 ?? null) : null,
            dadoPlanilha03: isAlvo ? (campos.dadoPlanilha03 ?? null) : null,
            dadoPlanilha04: isAlvo ? (campos.dadoPlanilha04 ?? null) : null,
            multa2pct: isAlvo ? (campos.multa2pct ?? "branco") : "branco",
            moraEspecifica: isAlvo ? (campos.moraEspecifica ?? null) : null,
          };
        }));
        console.log(`[Extractor] Extrações inicializadas: devedor ${devedorId}, ${contratos.length} contrato(s)${contratoAlvo ? `, dados aplicados apenas em "${contratoAlvo}"` : ""}`);
      }
    }
  } else {
    // Atualizar apenas os campos que foram extraídos
    // Filtrar apenas o contrato alvo (se identificado); caso contrário, atualizar todos
    const extParaAtualizar = contratoAlvo
      ? extracoesDev.filter((e) => e.numeroContrato === contratoAlvo)
      : extracoesDev;

    if (extParaAtualizar.length === 0 && contratoAlvo) {
      // Contrato alvo não encontrado nas extrações existentes — inserir novo
      await db.insert(extracoes).values({
        devedorId,
        loteId,
        numeroContrato: contratoAlvo,
        dadoPlanilha01: campos.dadoPlanilha01 ?? null,
        dadoPlanilha02: campos.dadoPlanilha02 ?? null,
        dadoPlanilha03: campos.dadoPlanilha03 ?? null,
        dadoPlanilha04: campos.dadoPlanilha04 ?? null,
        multa2pct: campos.multa2pct ?? "branco",
        moraEspecifica: campos.moraEspecifica ?? null,
      });
      console.log(`[Extractor] Contrato "${contratoAlvo}" não encontrado — inserido novo registro`);
    } else {
      for (const ext of extParaAtualizar) {
        // Alta prioridade (ex: Fatura, prioridade=0): sempre sobrescreve dp01/dp02
        // Prioridade normal (ex: Extrato, prioridade=1 ou undefined): só preenche campos vazios
        const altaPrioridade = (campos.prioridade ?? 1) === 0;
        const updateDataPorExt: Record<string, unknown> = {};
        const dp01Atual = ext.dadoPlanilha01;
        const dp02Atual = ext.dadoPlanilha02;
        const dp03Atual = ext.dadoPlanilha03;
        const dp04Atual = ext.dadoPlanilha04;
        console.log(`[Extractor] Contrato ${ext.numeroContrato}: dp01="${dp01Atual}" dp02="${dp02Atual}" dp03="${dp03Atual}" dp04="${dp04Atual}"`);
        console.log(`[Extractor] Novos valores: dp01="${campos.dadoPlanilha01}" dp02="${campos.dadoPlanilha02}" dp03="${campos.dadoPlanilha03}" dp04="${campos.dadoPlanilha04}"`);
        if (campos.dadoPlanilha01 !== undefined && (altaPrioridade || !dp01Atual)) updateDataPorExt.dadoPlanilha01 = campos.dadoPlanilha01;
        if (campos.dadoPlanilha02 !== undefined && (altaPrioridade || !dp02Atual)) updateDataPorExt.dadoPlanilha02 = campos.dadoPlanilha02;
        if (campos.dadoPlanilha03 !== undefined && (altaPrioridade || !dp03Atual)) updateDataPorExt.dadoPlanilha03 = campos.dadoPlanilha03;
        if (campos.dadoPlanilha04 !== undefined && (altaPrioridade || !dp04Atual)) updateDataPorExt.dadoPlanilha04 = campos.dadoPlanilha04;
        console.log(`[Extractor] updateData para ${ext.numeroContrato}:`, JSON.stringify(updateDataPorExt));
        // multa2pct e moraEspecifica: sobrescreve apenas se ainda "branco"/nulo
        if (campos.multa2pct !== undefined && (!ext.multa2pct || ext.multa2pct === "branco")) updateDataPorExt.multa2pct = campos.multa2pct;
        if (campos.moraEspecifica !== undefined && !ext.moraEspecifica) updateDataPorExt.moraEspecifica = campos.moraEspecifica;
        if (Object.keys(updateDataPorExt).length > 0) {
          await db.update(extracoes).set(updateDataPorExt).where(eq(extracoes.id, ext.id));
        }
      }
      console.log(`[Extractor] Extrações atualizadas: devedor ${devedorId}, ${extParaAtualizar.length} contrato(s)${contratoAlvo ? ` (alvo: "${contratoAlvo}")` : " (todos)"}`);
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
    return await _finalizarExtracaoItem(item, devedorId, loteId, campos);
  } catch (err) {
    console.error(`[Extractor] Erro ao processar "${item.nomeArquivo}":`, err);
    return null;
  }
}

/**
 * Processa um documento já identificado na triagem usando texto pré-extraído (sem buffer).
 * Usado para re-extração de documentos já enviados cujo texto foi salvo no banco.
 */
export async function processarItemTriagemComTexto(
  item: ItemTriagem,
  devedorId: number,
  loteId: number,
  textoExtraido: string
): Promise<CamposExtraidos | null> {
  try {
    // Garantir que textoExtraido é string (MySQL pode retornar Buffer para TEXT longo)
    const textoStr = typeof textoExtraido === "string"
      ? textoExtraido
      : Buffer.isBuffer(textoExtraido)
        ? (textoExtraido as unknown as Buffer).toString("utf8")
        : String(textoExtraido);
    const campos = await extrairCamposDeDocumentoIdentificadoComTexto(
      item.nomeArquivo, textoStr, item.docConfig
    );
    return await _finalizarExtracaoItem(item, devedorId, loteId, campos);
  } catch (err) {
    console.error(`[Extractor] Erro ao processar (texto) "${item.nomeArquivo}":`, err);
    return null;
  }
}

/** Finaliza a extração: propaga contrato alvo, aplica fallbacks e grava no banco. */
async function _finalizarExtracaoItem(
  item: ItemTriagem,
  devedorId: number,
  loteId: number,
  campos: CamposExtraidos
): Promise<CamposExtraidos | null> {
    // Propagar o contrato identificado na triagem para a gravação
    campos.numeroContratoIdentificado = item.numeroContratoNoNome ?? null;
    console.log(`[Extractor] Contrato alvo para gravação: ${campos.numeroContratoIdentificado ?? "(todos)"}`);

    // Se dadoPlanilha02 não foi extraído mas há um campo marcado como identificaContrato,
    // usar o número do contrato do nome do arquivo como fallback
    const campoContrato = item.docConfig.camposExtracao.find((c) => c.identificaContrato);
    if (campoContrato && campos.numeroContratoIdentificado) {
      const campoNorm = campoContrato.campo.toLowerCase().replace(/[_\s]/g, "");
      if (campoNorm === "dadoplanilha01" && !campos.dadoPlanilha01) {
        campos.dadoPlanilha01 = campos.numeroContratoIdentificado;
        console.log(`[Extractor] dadoPlanilha01 preenchido com número do contrato (fallback): ${campos.dadoPlanilha01}`);
      } else if (campoNorm === "dadoplanilha02" && !campos.dadoPlanilha02) {
        campos.dadoPlanilha02 = campos.numeroContratoIdentificado;
        console.log(`[Extractor] dadoPlanilha02 preenchido com número do contrato (fallback): ${campos.dadoPlanilha02}`);
      } else if (campoNorm === "dadoplanilha03" && !campos.dadoPlanilha03) {
        campos.dadoPlanilha03 = campos.numeroContratoIdentificado;
        console.log(`[Extractor] dadoPlanilha03 preenchido com número do contrato (fallback): ${campos.dadoPlanilha03}`);
      } else if (campoNorm === "dadoplanilha04" && !campos.dadoPlanilha04) {
        campos.dadoPlanilha04 = campos.numeroContratoIdentificado;
        console.log(`[Extractor] dadoPlanilha04 preenchido com número do contrato (fallback): ${campos.dadoPlanilha04}`);
      }
    }

    // Gravar no banco
    await gravarExtracoes(devedorId, loteId, campos);

    return campos;
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
