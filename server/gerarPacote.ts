/**
 * gerarPacote.ts
 * Serviço responsável por montar o pacote ZIP para geração local de planilhas.
 * O pacote contém:
 *   - dados.json: todos os devedores com contratos e cálculos já resolvidos
 *   - modelos/: arquivos .xlsx modelo baixados do S3
 *   - gerar.js: script Node.js para execução local no Windows
 *   - README.txt: instruções de uso
 */
import { Router } from "express";
import AdmZip from "adm-zip";
import { storageGetSignedUrl } from "./storage";
import {
  getLoteById,
  getDevedoresByLote,
  getExtracoesByLote,
  getIndicesCorrecao,
  getUltimoIndice,
  getModeloInicialByNome,
  getModeloCalculoByCategoriaQtd,
  getAllModelosCalculo,
  getAllClientes,
} from "./db";
import { baixarArquivo } from "./extractor";
import { CATEGORIAS_PLANILHA } from "../drizzle/schema";

export const gerarPacoteRouter = Router();

// ─── Helpers ─────────────────────────────────────────────────────────────────

/** Converte "Mai/2026" → "2026-05" para busca no índice */
function labelToMesAno(label: string): string | null {
  const meses: Record<string, string> = {
    jan: "01", fev: "02", mar: "03", abr: "04", mai: "05", jun: "06",
    jul: "07", ago: "08", set: "09", out: "10", nov: "11", dez: "12",
  };
  const s = label.trim();
  // Formato "Mmm/YYYY" ou "Mmm-YYYY" (ex: "Jan/2026")
  const mNome = s.match(/^([a-záéíóúâêôãõç]+)[\/\-](\d{4})$/i);
  if (mNome) {
    const mes = meses[mNome[1].toLowerCase().slice(0, 3)];
    if (!mes) return null;
    return `${mNome[2]}-${mes}`;
  }
  // Formato "DD/MM/YYYY" (ex: "10/01/2026") — extrair mês e ano
  const mData = s.match(/^(\d{1,2})\/(\d{2})\/(\d{4})$/);
  if (mData) {
    const mes = mData[2].padStart(2, "0");
    return `${mData[3]}-${mes}`;
  }
  return null;
}

/** Converte "YYYY-MM" → "Mmm/YYYY" (ex: "2026-05" → "Mai/2026") */
function mesAnoToLabel(mesAno: string): string {
  const labels = ["Jan", "Fev", "Mar", "Abr", "Mai", "Jun", "Jul", "Ago", "Set", "Out", "Nov", "Dez"];
  const [ano, mes] = mesAno.split("-");
  return `${labels[parseInt(mes) - 1]}/${ano}`;
}

/** Conta meses entre dois "YYYY-MM" inclusive (mes1 conta) */
function contarMeses(mesAno1: string, mesAno2: string): number {
  const [a1, m1] = mesAno1.split("-").map(Number);
  const [a2, m2] = mesAno2.split("-").map(Number);
  return (a2 - a1) * 12 + (m2 - m1) + 1;
}

/** Determina o tipo de contrato a partir dos dados da extração */
function tipoContrato(extracao: { moraEspecifica?: string | null; dadoPlanilha01?: string | null }): "cartao" | "cheque" | "emprestimo" {
  if (extracao.moraEspecifica && extracao.moraEspecifica.trim() !== "") return "cartao";
  if (!extracao.dadoPlanilha01 || extracao.dadoPlanilha01.trim() === "") return "cheque";
  return "emprestimo";
}

/** Determina a categoria da planilha com base nos tipos de contrato do devedor */
function determinarCategoria(
  modeloInicial: string,
  extracoes: Array<{ moraEspecifica?: string | null; dadoPlanilha01?: string | null; indiceCorrecao?: string | null }>
): string {
  const tipos = extracoes.map(tipoContrato);
  const temCartao = tipos.includes("cartao");
  const temCheque = tipos.includes("cheque");
  const temEmprestimo = tipos.includes("emprestimo");

  // Categorias mistas
  if (temEmprestimo && temCheque && temCartao) return "Emprestimo com CE e Cartao";
  if (temEmprestimo && temCartao && !temCheque) return "Emprestimo com Cartao";
  if (temEmprestimo && temCheque && !temCartao) return "Emprestimo com CE";
  if (temCheque && temCartao && !temEmprestimo) return "CE e Cartao";

  // Categorias simples
  if (temCartao) return "Cartao";
  if (temCheque) return "CE";

  // Empréstimos puros — baseado no índice predominante
  const usaSelic = extracoes.some(e => e.indiceCorrecao === "selic");
  const usaIpca = extracoes.some(e => e.indiceCorrecao === "ipca");

  // Verificar se o modelo contém palavras-chave de categoria
  const modeloUpper = modeloInicial.toUpperCase();
  if (modeloUpper.includes("CONFISSAO") || modeloUpper.includes("CONFISSÃO")) return "Confissao";
  if (modeloUpper.includes("SANTA CASA")) return "Santa Casa";
  if (modeloUpper.includes("COLEGIO") || modeloUpper.includes("COLÉGIO")) return "Colegio";
  if (modeloUpper.includes("CHEQUE")) return "Cheque";
  if (modeloUpper.includes("CAC") || modeloUpper.includes("CCB")) return "CAC e CCB";

  if (usaSelic && !usaIpca) return "Geral SELIC";
  return "Geral IPCA";
}

/** Ordena as extrações: empréstimos primeiro, depois cheque especial, depois cartão */
function ordenarExtracoes<T extends { moraEspecifica?: string | null; dadoPlanilha01?: string | null }>(extracoes: T[]): T[] {
  return [...extracoes].sort((a, b) => {
    const ordemTipo = { emprestimo: 0, cheque: 1, cartao: 2 };
    return ordemTipo[tipoContrato(a)] - ordemTipo[tipoContrato(b)];
  });
}

// ─── Endpoint principal ───────────────────────────────────────────────────────

/**
 * GET /api/gerar-pacote/:loteId
 * Gera e retorna o pacote ZIP para download.
 */
gerarPacoteRouter.get("/:loteId", async (req, res) => {
  const loteId = parseInt(req.params.loteId);
  if (isNaN(loteId)) {
    res.status(400).json({ error: "loteId inválido" });
    return;
  }

  try {
    // Estender timeout do response para 120s (evita 504 em lotes grandes)
    req.socket.setTimeout(120_000);

    console.log(`[GerarPacote] Iniciando loteId=${loteId}`);
    // 1. Carregar dados do lote
    const lote = await getLoteById(loteId);
    if (!lote) {
      res.status(404).json({ error: "Lote não encontrado" });
      return;
    }

    console.log(`[GerarPacote] Banco: carregando dados...`);
    const [devedores, todasExtracoes, todosIndices, ultimoIndice, clientes] = await Promise.all([
      getDevedoresByLote(loteId),
      getExtracoesByLote(loteId),
      getIndicesCorrecao(),
      getUltimoIndice(),
      getAllClientes(),
    ]);
    console.log(`[GerarPacote] Banco: ${devedores.length} devedores, ${todasExtracoes.length} extracoes, ${todosIndices.length} indices`);

    if (!ultimoIndice) {
      res.status(400).json({ error: "Nenhum índice de correção cadastrado." });
      return;
    }

    // Montar mapa de índices por mesAno para acesso rápido
    const indiceMap = new Map(todosIndices.map(i => [i.mesAno, i]));

    // Encontrar nome fantasia da cooperativa do lote
    const normStr = (s: string) => s.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().trim();
    const coopNorm = normStr(lote.cooperativa ?? "");
    const clienteLote = clientes.find(c => {
      const cn = normStr(c.nomeFantasia);
      return cn === coopNorm || cn.includes(coopNorm) || coopNorm.includes(cn);
    });
    const nomeFantasiaCliente = clienteLote?.nomeFantasia ?? lote.cooperativa ?? "COOPERATIVA";

    // 2. Montar dados.json com todos os cálculos
    const dadosDevedores = [];
    const modelosNecessarios: Map<string, { categoria: string; qtd: number; fileKey: string; fileUrl: string }> = new Map();
    const avisos: string[] = [];

    for (const devedor of devedores) {
      const extracoes = todasExtracoes.filter(e => e.devedorId === devedor.id);

      if (extracoes.length === 0) {
        avisos.push(`Devedor "${devedor.contrarioNome}" sem contratos — ignorado.`);
        continue;
      }

      const modeloInicial = devedor.modeloInicial ?? "";
      if (!modeloInicial) {
        avisos.push(`Devedor "${devedor.contrarioNome}" sem modelo de inicial definido — incluído sem modelo.`);
      }

      // Determinar categoria da planilha
      const categoria = determinarCategoria(modeloInicial, extracoes);

      // Ordenar extrações (empréstimos → cheque → cartão)
      const extracoesOrdenadas = ordenarExtracoes(extracoes);

      // Verificar se o modelo contém "EXEC" para honorários
      const honorarios = modeloInicial.toUpperCase().includes("EXEC") ? "10" : "0";

      // Calcular dados por contrato
      const contratos = extracoesOrdenadas.map((ext) => {
        const tipo = tipoContrato(ext);
        const indice = ext.indiceCorrecao ?? (tipo === "emprestimo" ? "ipca" : "selic");

        // Determinar mes1 (mês de mora)
        let mes1Label: string;
        if (ext.moraEspecifica && ext.moraEspecifica.trim() !== "") {
          // moraEspecifica pode ser "DD/MM/YYYY" (data de vencimento de fatura)
          // Converter para "Mmm/YYYY" para exibição na planilha
          const mora = ext.moraEspecifica.trim();
          const mData = mora.match(/^(\d{1,2})\/(\d{2})\/(\d{4})$/);
          if (mData) {
            const mesIdx = parseInt(mData[2]) - 1;
            const labelsM = ["Jan", "Fev", "Mar", "Abr", "Mai", "Jun", "Jul", "Ago", "Set", "Out", "Nov", "Dez"];
            mes1Label = `${labelsM[mesIdx]}/${mData[3]}`;
          } else {
            mes1Label = mora;
          }
        } else if (devedor.vencBordero) {
          // Converter data "DD/MM/YYYY" para "Mmm/YYYY"
          const parts = devedor.vencBordero.split("/");
          if (parts.length === 3) {
            const mesIdx = parseInt(parts[1]) - 1;
            const labels = ["Jan", "Fev", "Mar", "Abr", "Mai", "Jun", "Jul", "Ago", "Set", "Out", "Nov", "Dez"];
            mes1Label = `${labels[mesIdx]}/${parts[2]}`;
          } else {
            mes1Label = devedor.vencBordero;
          }
        } else {
          mes1Label = mesAnoToLabel(ultimoIndice.mesAno);
        }

        const mes1MesAno = labelToMesAno(mes1Label);
        const mes2MesAno = ultimoIndice.mesAno;
        const mes2Label = mesAnoToLabel(mes2MesAno);

        // Buscar índices
        const indice1Obj = mes1MesAno ? indiceMap.get(mes1MesAno) : null;
        const indice2Obj = indiceMap.get(mes2MesAno);

        const indice1Val = indice1Obj
          ? (indice === "ipca" ? String(indice1Obj.ipca) : String(indice1Obj.selic))
          : null;
        const indice2Val = indice2Obj
          ? (indice === "ipca" ? String(indice2Obj.ipca) : String(indice2Obj.selic))
          : null;

        // Calcular quantidade de meses para juros
        const qtdMeses = (mes1MesAno && mes2MesAno) ? contarMeses(mes1MesAno, mes2MesAno) : 1;
        const pctJuros = `${qtdMeses}%`;

        // Multa
        const multa = ext.multa2pct === "sim" ? "2%" : "0%";

        return {
          dadoPlanilha01: ext.dadoPlanilha01 ?? "",
          dadoPlanilha02: ext.dadoPlanilha02 ?? "",
          dadoPlanilha03: ext.dadoPlanilha03 ?? "",
          dadoPlanilha04: ext.dadoPlanilha04 ?? "",
          multa,
          mes1: mes1Label,
          mes2: mes2Label,
          indice1: indice1Val ?? "",
          indice2: indice2Val ?? "",
          pctJuros,
          indiceCorrecao: indice,
          tipo,
        };
      });

      const qtdContratos = contratos.length;
      const modeloKey = `${categoria}__${qtdContratos}`;

      // Registrar modelo necessário
      if (!modelosNecessarios.has(modeloKey)) {
        const modeloDB = await getModeloCalculoByCategoriaQtd(categoria, qtdContratos);
        if (modeloDB) {
          modelosNecessarios.set(modeloKey, {
            categoria,
            qtd: qtdContratos,
            fileKey: modeloDB.fileKey,
            fileUrl: modeloDB.fileUrl,
          });
        } else {
          avisos.push(`Modelo de planilha não encontrado: categoria "${categoria}", ${qtdContratos} contrato(s).`);
        }
      }

      // Nome do arquivo gerado
      const nomeArquivo = `PLANILHA ${nomeFantasiaCliente} - ${devedor.contrarioNome ?? "DEVEDOR"}`;

      dadosDevedores.push({
        id: devedor.id,
        nome: devedor.contrarioNome ?? "",
        cpf: devedor.contrarioCpf ?? "",
        modeloInicial,
        categoria,
        qtdContratos,
        honorarios,
        nomeArquivo,
        modeloKey,
        contratos,
      });
    }

    console.log(`[GerarPacote] Baixando ${modelosNecessarios.size} modelo(s)...`);
    // 3. Baixar os modelos .xlsx necessários
    // Baixar todos os modelos em paralelo usando fileUrl diretamente (sem presign)
    const modelosBuffers: Map<string, Buffer> = new Map();
    await Promise.all(
      Array.from(modelosNecessarios.entries()).map(async ([key, info]) => {
        try {
          // Extrair a chave do path relativo /manus-storage/<key>
          const fileKey = info.fileUrl.replace(/^\/manus-storage\//, "");
          console.log(`[GerarPacote] Obtendo URL presignada para: ${info.categoria} ${info.qtd} | key: ${fileKey.substring(0, 60)}`);
          const signedUrl = await storageGetSignedUrl(fileKey);
          const controller = new AbortController();
          const timer = setTimeout(() => controller.abort(), 20_000);
          const resp = await fetch(signedUrl, { signal: controller.signal });
          clearTimeout(timer);
          if (!resp.ok) {
            avisos.push(`Erro ao baixar modelo "${info.categoria} ${info.qtd}": HTTP ${resp.status}`);
            console.error(`[GerarPacote] Erro HTTP ${resp.status} ao baixar ${info.categoria} ${info.qtd}`);
            return;
          }
          const buf = Buffer.from(await resp.arrayBuffer());
          modelosBuffers.set(key, buf);
          console.log(`[GerarPacote] OK: ${info.categoria} ${info.qtd} (${buf.length} bytes)`);
        } catch (err: any) {
          avisos.push(`Timeout/erro ao baixar modelo "${info.categoria} ${info.qtd}": ${err?.message ?? err}`);
          console.error(`[GerarPacote] ERRO: ${info.categoria} ${info.qtd}:`, err?.message);
        }
      })
    );

    // 4. Montar o script gerar.js
    const gerarJs = gerarScript();

    // 5. Montar README.txt
    const readme = montarReadme(avisos);

    // 6. Montar dados.json
    const dadosJson = JSON.stringify({
      lote: {
        id: lote.id,
        nome: lote.nome,
        cooperativa: lote.cooperativa,
        nomeFantasiaCliente,
      },
      ultimoIndice: {
        mesAno: ultimoIndice.mesAno,
        label: mesAnoToLabel(ultimoIndice.mesAno),
      },
      devedores: dadosDevedores,
      avisos,
    }, null, 2);

    // 7. Criar o ZIP e enviar como download
    const nomeLote = (lote.nome ?? "lote").replace(/[^a-zA-Z0-9_\- ]/g, "_");

    // Criar ZIP em memória com adm-zip
    const zip = new AdmZip();
    zip.addFile("dados.json", Buffer.from(dadosJson, "utf8"));
    zip.addFile("gerar.js", Buffer.from(gerarJs, "utf8"));
    zip.addFile("README.txt", Buffer.from(readme, "utf8"));

    // Adicionar modelos .xlsx
    for (const [key, buf] of Array.from(modelosBuffers.entries())) {
      const info = modelosNecessarios.get(key)!;
      const nomeModelo = `modelos/${info.categoria} ${info.qtd}.xlsx`;
      zip.addFile(nomeModelo, buf);
    }

    const zipBuffer = zip.toBuffer();
    console.log(`[GerarPacote] ZIP gerado: ${zipBuffer.length} bytes.`);

    res.setHeader("Content-Type", "application/zip");
    res.setHeader("Content-Disposition", `attachment; filename="Pacote_${nomeLote}.zip"`);
    res.setHeader("Content-Length", String(zipBuffer.length));
    res.end(zipBuffer);
    console.log(`[GerarPacote] ZIP enviado com sucesso.`);
  } catch (err) {
    console.error("[GerarPacote] Erro:", err);
    if (!res.headersSent) {
      res.status(500).json({ error: "Erro interno ao gerar pacote." });
    }
  }
});

// ─── Script gerar.js ──────────────────────────────────────────────────────────

function gerarScript(): string {
  return `/**
 * gerar.js — Script de geração de planilhas de cálculo
 */

const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');

const dados = JSON.parse(fs.readFileSync('dados.json', 'utf8'));
const { devedores, lote, ultimoIndice } = dados;

const saidaDir = path.join(__dirname, 'saida');
if (!fs.existsSync(saidaDir)) fs.mkdirSync(saidaDir, { recursive: true });

console.log('\\n=== GERADOR DE PLANILHAS DE CÁLCULO ===');
console.log('Lote:', lote.nome);
console.log('Total de devedores:', devedores.length);
console.log('');

let AdmZip;
try {
  AdmZip = require('adm-zip');
} catch (e) {
  console.error('[ERRO] adm-zip não encontrado. Execute: npm install adm-zip');
  process.exit(1);
}

// Verificar se LibreOffice está disponível para PDF
let libreofficePath = null;
const libreofficeLocais = [
  'soffice',
  'libreoffice',
  'C:\\\\\\\\Program Files\\\\\\\\LibreOffice\\\\\\\\program\\\\\\\\soffice.exe',
  'C:\\\\\\\\Program Files (x86)\\\\\\\\LibreOffice\\\\\\\\program\\\\\\\\soffice.exe',
];
for (const loc of libreofficeLocais) {
  try {
    const r = spawnSync(loc, ['--version'], { timeout: 5000, encoding: 'utf8' });
    if (r.status === 0) { libreofficePath = loc; break; }
  } catch (_) {}
}
if (libreofficePath) {
  console.log('LibreOffice encontrado:', libreofficePath);
  console.log('PDFs serão gerados automaticamente.\\n');
} else {
  console.log('LibreOffice NÃO encontrado — apenas .xlsx será gerado.');
  console.log('Para gerar PDF, instale em: https://www.libreoffice.org\\n');
}

let pdfsGerados = 0;
let gerados = 0;
let erros = 0;

for (const devedor of devedores) {
  try {
    const modeloPath = path.join(__dirname, 'modelos', devedor.categoria + ' ' + devedor.qtdContratos + '.xlsx');
    if (!fs.existsSync(modeloPath)) {
      console.error('  [ERRO] Modelo não encontrado:', modeloPath);
      erros++;
      continue;
    }
    const nomeArquivo = devedor.nomeArquivo + '.xlsx';
    const saidaPath = path.join(saidaDir, nomeArquivo);
    gerarXlsx(modeloPath, saidaPath, devedor, AdmZip);
    console.log('  [OK]', nomeArquivo);
    gerados++;
    // Gerar PDF via LibreOffice
    if (libreofficePath) {
      try {
        const r = spawnSync(libreofficePath, [
          '--headless', '--convert-to', 'pdf', '--outdir', saidaDir, saidaPath
        ], { timeout: 30000, encoding: 'utf8' });
        if (r.status === 0) {
          console.log('  [PDF]', devedor.nomeArquivo + '.pdf');
          pdfsGerados++;
        } else {
          console.error('  [ERRO PDF]', devedor.nome, ':', r.stderr);
        }
      } catch (pdfErr) {
        console.error('  [ERRO PDF]', devedor.nome, ':', pdfErr?.message ?? String(pdfErr));
      }
    }
  } catch (err) {
    console.error('  [ERRO]', devedor.nome, ':', err?.message ?? String(err));
    erros++;
  }
}

console.log('\\n=== CONCLUÍDO ===');
console.log('Planilhas geradas:', gerados);
if (libreofficePath) console.log('PDFs gerados:', pdfsGerados);
if (erros > 0) console.log('Com erro:', erros);
console.log('Arquivos salvos em:', saidaDir);

function gerarXlsx(modeloPath, saidaPath, devedor, AdmZip) {
  const contratos = devedor.contratos;
  const zip = new AdmZip(modeloPath);

  let ssXml = zip.readAsText('xl/sharedStrings.xml');

  // Extrair shared strings
  const ssMapNovo = [];
  const siRegex = /<si>([\\s\\S]*?)<\\/si>/g;
  let siMatch;
  while ((siMatch = siRegex.exec(ssXml)) !== null) {
    const texts = [];
    const tRegex = /<t[^>]*>([\\s\\S]*?)<\\/t>/g;
    let tMatch;
    while ((tMatch = tRegex.exec(siMatch[1])) !== null) {
      texts.push(tMatch[1]);
    }
    ssMapNovo.push(texts.join(''));
  }

  // Substituições globais
  const c0 = contratos[0] ?? {};
  const globalSubs = {
    '{mes1}': c0.mes1 ?? '',
    '{mes2}': c0.mes2 ?? '',
    '{honorarios}': devedor.honorarios ?? '0',
  };

  let ssXmlNovo = ssXml;
  for (const [ph, val] of Object.entries(globalSubs)) {
    const valXml = escapeXml(val);
    ssXmlNovo = ssXmlNovo.split('<t>' + ph + '</t>').join('<t>' + valXml + '</t>');
    ssXmlNovo = ssXmlNovo.split('<t xml:space="preserve">' + ph + '</t>').join('<t xml:space="preserve">' + valXml + '</t>');
    ssXmlNovo = ssXmlNovo.split(ph).join(valXml);
  }

  // Reler mapa atualizado
  const ssMapAtual = [];
  const siRegex2 = /<si>([\\s\\S]*?)<\\/si>/g;
  let siMatch2;
  while ((siMatch2 = siRegex2.exec(ssXmlNovo)) !== null) {
    const texts = [];
    const tRegex2 = /<t[^>]*>([\\s\\S]*?)<\\/t>/g;
    let tMatch2;
    while ((tMatch2 = tRegex2.exec(siMatch2[1])) !== null) {
      texts.push(tMatch2[1]);
    }
    ssMapAtual.push(texts.join(''));
  }

  const idxDp01 = ssMapAtual.indexOf('{dadosPlanilha01}');
  const idxDp02 = ssMapAtual.indexOf('{dadosPlanilha02}');
  const idxDp03 = ssMapAtual.indexOf('{dadosPlanilha03}');
  const idxDp04 = ssMapAtual.indexOf('{dadosPlanilha04}');
  const idxMulta = ssMapAtual.indexOf('{multa}');
  const idxJuros = ssMapAtual.indexOf('{juros}');
  const idxIndice1 = ssMapAtual.indexOf('{indice1}');
  const idxIndice2 = ssMapAtual.indexOf('{indice2}');


  // Criar novos shared strings por contrato
  const novosStrings = [];
  const baseIdx = ssMapAtual.length;
  const contratoIdxMap = [];

  for (let ci = 0; ci < contratos.length; ci++) {
    const c = contratos[ci];
    const dp01Idx = baseIdx + novosStrings.length; novosStrings.push(c.dadoPlanilha01 ?? '');
    const dp02Idx = baseIdx + novosStrings.length; novosStrings.push(c.dadoPlanilha02 ?? '');
    const dp03Idx = baseIdx + novosStrings.length; novosStrings.push(c.dadoPlanilha03 ?? '');
    const dp04Idx = baseIdx + novosStrings.length; novosStrings.push(c.dadoPlanilha04 ?? '');
    const ind1Idx = baseIdx + novosStrings.length; novosStrings.push(c.indice1 ?? '');
    const ind2Idx = baseIdx + novosStrings.length; novosStrings.push(c.indice2 ?? '');
    contratoIdxMap.push({ dp01Idx, dp02Idx, dp03Idx, dp04Idx, ind1Idx, ind2Idx });
  }

  const novasEntradas = novosStrings.map(s => '<si><t>' + escapeXml(s) + '</t></si>').join('');
  ssXmlNovo = ssXmlNovo.replace('</sst>', novasEntradas + '</sst>');
  const totalStrings = ssMapAtual.length + novosStrings.length;
  ssXmlNovo = ssXmlNovo.replace(/(<sst[^>]*\\s)count="\\d+"/, '$1count="' + totalStrings + '"');
  ssXmlNovo = ssXmlNovo.replace(/(<sst[^>]*\\s)uniqueCount="\\d+"/, '$1uniqueCount="' + totalStrings + '"');

  // Processar sheet1.xml
  let sheetXml = zip.readAsText('xl/worksheets/sheet1.xml');
  let contratoLinhaIdx = 0;

  sheetXml = sheetXml.replace(/<row([^>]*)>([\\s\\S]*?)<\\/row>/g, (rowMatch, rowAttrs, rowContent) => {
    const temDp01 = idxDp01 >= 0 && rowContent.includes('<v>' + idxDp01 + '</v>');
    if (!temDp01) return rowMatch;

    const ci = contratoLinhaIdx++;
    const c = contratos[ci] ?? contratos[contratos.length - 1] ?? {};
    const idxMap = contratoIdxMap[ci] ?? contratoIdxMap[contratoIdxMap.length - 1];
    if (!idxMap) return rowMatch;

    let novoContent = rowContent;
    if (idxDp01 >= 0) novoContent = novoContent.split('<v>' + idxDp01 + '</v>').join('<v>' + idxMap.dp01Idx + '</v>');
    if (idxDp02 >= 0) novoContent = novoContent.split('<v>' + idxDp02 + '</v>').join('<v>' + idxMap.dp02Idx + '</v>');
    if (idxDp03 >= 0) novoContent = novoContent.split('<v>' + idxDp03 + '</v>').join('<v>' + idxMap.dp03Idx + '</v>');
    if (idxDp04 >= 0) novoContent = novoContent.split('<v>' + idxDp04 + '</v>').join('<v>' + idxMap.dp04Idx + '</v>');
    if (idxIndice1 >= 0) novoContent = novoContent.split('<v>' + idxIndice1 + '</v>').join('<v>' + idxMap.ind1Idx + '</v>');
    if (idxIndice2 >= 0) novoContent = novoContent.split('<v>' + idxIndice2 + '</v>').join('<v>' + idxMap.ind2Idx + '</v>');

    // Substituir {multa} → fórmula
    if (idxMulta >= 0 && novoContent.includes('<v>' + idxMulta + '</v>')) {
      const rowNumMatch = rowAttrs.match(/\\br="(\\d+)"/);
      const rowNum = rowNumMatch ? rowNumMatch[1] : '0';
      const pct = c.multa === '2%' ? '2' : '0';
      novoContent = novoContent.replace(
        new RegExp('<c([^>]*)t="s"([^>]*)><v>' + idxMulta + '<\\\\/v><\\\\/c>'),
        '<c$1$2><f>D' + rowNum + '*' + pct + '%</f><v>0</v></c>'
      );
    }

    // Substituir {juros} → fórmula
    if (idxJuros >= 0 && novoContent.includes('<v>' + idxJuros + '</v>')) {
      const rowNumMatch = rowAttrs.match(/\\br="(\\d+)"/);
      const rowNum = rowNumMatch ? rowNumMatch[1] : '0';
      const pct = c.pctJuros ? c.pctJuros.replace('%', '') : '1';
      novoContent = novoContent.replace(
        new RegExp('<c([^>]*)t="s"([^>]*)><v>' + idxJuros + '<\\\\/v><\\\\/c>'),
        '<c$1$2><f>E' + rowNum + '*' + pct + '%</f><v>0</v></c>'
      );
    }

    return '<row' + rowAttrs + '>' + novoContent + '</row>';
  });

  // Linhas com indice1/indice2 mas sem dp01 (cartão/cheque)
  sheetXml = sheetXml.replace(/<row([^>]*)>([\\s\\S]*?)<\\/row>/g, (rowMatch, rowAttrs, rowContent) => {
    const temIndice = idxIndice1 >= 0 && rowContent.includes('<v>' + idxIndice1 + '</v>');
    const temDp01 = idxDp01 >= 0 && rowContent.includes('<v>' + idxDp01 + '</v>');
    if (!temIndice || temDp01) return rowMatch;

    const contratoSemDp01 = contratos.find(c => !c.dadoPlanilha01 || c.dadoPlanilha01.trim() === '');
    const ci = contratoSemDp01 ? contratos.indexOf(contratoSemDp01) : contratos.length - 1;
    const idxMap = contratoIdxMap[ci];
    if (!idxMap) return rowMatch;

    let novoContent = rowContent;
    if (idxIndice1 >= 0) novoContent = novoContent.split('<v>' + idxIndice1 + '</v>').join('<v>' + idxMap.ind1Idx + '</v>');
    if (idxIndice2 >= 0) novoContent = novoContent.split('<v>' + idxIndice2 + '</v>').join('<v>' + idxMap.ind2Idx + '</v>');

    return '<row' + rowAttrs + '>' + novoContent + '</row>';
  });

  zip.updateFile('xl/sharedStrings.xml', Buffer.from(ssXmlNovo, 'utf8'));
  zip.updateFile('xl/worksheets/sheet1.xml', Buffer.from(sheetXml, 'utf8'));
  zip.writeZip(saidaPath);
}

function escapeXml(str) {
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}
`;
}

// ─── README.txt ───────────────────────────────────────────────────────────────

function montarReadme(avisos: string[]): string {
  const linhasAvisos = avisos.length > 0
    ? `\nAVISOS:\n${avisos.map(a => `  - ${a}`).join("\n")}\n`
    : "";

  return `=== PACOTE DE GERAÇÃO DE PLANILHAS ===

INSTRUÇÕES DE USO:

1. Certifique-se de ter o Node.js instalado no computador.
   Download: https://nodejs.org (versão LTS recomendada)

2. Abra o terminal (Prompt de Comando ou PowerShell) nesta pasta.

3. Instale a dependência necessária (apenas na primeira vez):
   npm install adm-zip

4. Execute o script:
   node gerar.js

5. As planilhas geradas serão salvas na pasta "saida/" dentro desta pasta.

GERAÇÃO DE PDF (opcional):
   Para gerar PDF automaticamente, instale o LibreOffice:
   https://www.libreoffice.org
   O script detecta automaticamente se o LibreOffice está instalado.

ESTRUTURA DO PACOTE:
  dados.json    — Dados calculados de todos os devedores
  gerar.js      — Script de geração
  modelos/      — Modelos de planilha (.xlsx)
  saida/        — Planilhas geradas (criada ao executar o script)
  README.txt    — Este arquivo
${linhasAvisos}
Gerado pelo sistema Iniciais Calc.
`;
}
