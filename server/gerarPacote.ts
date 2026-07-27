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
  const m = label.trim().match(/^([a-záéíóúâêôãõç]+)[\/\-](\d{4})$/i);
  if (!m) return null;
  const mes = meses[m[1].toLowerCase().slice(0, 3)];
  if (!mes) return null;
  return `${m[2]}-${mes}`;
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
          mes1Label = ext.moraEspecifica.trim();
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
 * 
 * Pré-requisitos:
 *   1. Node.js instalado (https://nodejs.org)
 *   2. Executar no terminal: npm install xlsx
 *
 * Uso:
 *   node gerar.js
 *
 * O script lê dados.json, substitui os placeholders nos modelos .xlsx
 * e salva as planilhas geradas na pasta "saida/".
 */

const XLSX = require('xlsx');
const fs = require('fs');
const path = require('path');

// ─── Carregar dados ────────────────────────────────────────────────────────────
const dados = JSON.parse(fs.readFileSync('dados.json', 'utf8'));
const { devedores, lote, ultimoIndice } = dados;

// Criar pasta de saída
const saidaDir = path.join(__dirname, 'saida');
if (!fs.existsSync(saidaDir)) fs.mkdirSync(saidaDir);

console.log('\\n=== GERADOR DE PLANILHAS DE CÁLCULO ===');
console.log('Lote:', lote.nome);
console.log('Índice de referência:', ultimoIndice.label);
console.log('Total de devedores:', devedores.length);
console.log('');

let gerados = 0;
let erros = 0;

// ─── Processar cada devedor ────────────────────────────────────────────────────
for (const devedor of devedores) {
  try {
    const modeloPath = path.join(__dirname, 'modelos', devedor.categoria + ' ' + devedor.qtdContratos + '.xlsx');
    
    if (!fs.existsSync(modeloPath)) {
      console.error('  [ERRO] Modelo não encontrado:', modeloPath);
      erros++;
      continue;
    }

    // Carregar o workbook modelo
    const wb = XLSX.readFile(modeloPath, { cellFormula: true, cellStyles: true });
    const sheetName = wb.SheetNames[0];
    const ws = wb.Sheets[sheetName];

    // Substituir placeholders célula a célula
    substituirPlaceholders(ws, devedor);

    // Salvar o arquivo gerado
    const nomeArquivo = devedor.nomeArquivo + '.xlsx';
    const saidaPath = path.join(saidaDir, nomeArquivo);
    XLSX.writeFile(wb, saidaPath, { bookType: 'xlsx', type: 'buffer' });

    console.log('  [OK]', nomeArquivo);
    gerados++;
  } catch (err) {
    console.error('  [ERRO]', devedor.nome, ':', (err as Error).message);
    erros++;
  }
}

console.log('');
console.log('=== CONCLUÍDO ===');
console.log('Gerados com sucesso:', gerados);
if (erros > 0) console.log('Com erro:', erros);
console.log('Arquivos salvos em:', saidaDir);

if (dados.avisos && dados.avisos.length > 0) {
  console.log('\\nAVISOS:');
  dados.avisos.forEach(a => console.log(' -', a));
}

// ─── Função de substituição de placeholders ────────────────────────────────────
function substituirPlaceholders(ws, devedor) {
  const contratos = devedor.contratos;
  let contratoIdx = 0;

  // Iterar por todas as células
  const range = XLSX.utils.decode_range(ws['!ref'] || 'A1:Z100');
  
  for (let R = range.s.r; R <= range.e.r; R++) {
    for (let C = range.s.c; C <= range.e.c; C++) {
      const addr = XLSX.utils.encode_cell({ r: R, c: C });
      const cell = ws[addr];
      if (!cell) continue;

      // Verificar se é uma célula com placeholder
      const val = String(cell.v ?? cell.f ?? '');
      if (!val.includes('{')) continue;

      // Detectar qual contrato (baseado no índice do placeholder numérico)
      // Placeholders com número: {dadoPlanilha01_1}, {dadoPlanilha01_2}, etc.
      // Placeholders sem número: {dadoPlanilha01} (contrato atual na sequência)
      
      const numMatch = val.match(/\\{[^}]+_(\\d+)\\}/);
      const idx = numMatch ? parseInt(numMatch[1]) - 1 : contratoIdx;
      const contrato = contratos[idx] ?? contratos[contratos.length - 1] ?? {};

      let novoVal = val;
      
      // Substituições simples
      novoVal = novoVal.replace(/\\{dadoPlanilha01\\}/g, contrato.dadoPlanilha01 ?? '');
      novoVal = novoVal.replace(/\\{dadoPlanilha02\\}/g, contrato.dadoPlanilha02 ?? '');
      novoVal = novoVal.replace(/\\{dadoPlanilha03\\}/g, contrato.dadoPlanilha03 ?? '');
      novoVal = novoVal.replace(/\\{dadoPlanilha04\\}/g, contrato.dadoPlanilha04 ?? '');
      novoVal = novoVal.replace(/\\{mes1\\}/g, contrato.mes1 ?? '');
      novoVal = novoVal.replace(/\\{mes2\\}/g, contrato.mes2 ?? '');
      novoVal = novoVal.replace(/\\{indice1\\}/g, contrato.indice1 ?? '');
      novoVal = novoVal.replace(/\\{indice2\\}/g, contrato.indice2 ?? '');
      novoVal = novoVal.replace(/\\{honorarios\\}/g, devedor.honorarios ?? '0');

      // Substituição especial: {multa} → fórmula Excel
      if (novoVal.includes('{multa}')) {
        // Célula imediatamente à esquerda
        const celulaEsquerda = C > 0 ? XLSX.utils.encode_cell({ r: R, c: C - 1 }) : null;
        const refEsquerda = celulaEsquerda ?? 'A1';
        const pct = contrato.multa === '2%' ? '2%' : '0%';
        novoVal = novoVal.replace(/\\{multa\\}/g, '');
        cell.f = refEsquerda + '*' + pct;
        cell.v = 0;
        cell.t = 'n';
        continue;
      }

      // Substituição especial: {juros} → fórmula Excel
      if (novoVal.includes('{juros}')) {
        const celulaEsquerda = C > 0 ? XLSX.utils.encode_cell({ r: R, c: C - 1 }) : null;
        const refEsquerda = celulaEsquerda ?? 'A1';
        const pct = contrato.pctJuros ?? '1%';
        novoVal = novoVal.replace(/\\{juros\\}/g, '');
        cell.f = refEsquerda + '*' + pct;
        cell.v = 0;
        cell.t = 'n';
        continue;
      }

      // Atualizar célula
      if (novoVal !== val) {
        // Verificar se o resultado é numérico
        const num = parseFloat(novoVal.replace(',', '.'));
        if (!isNaN(num) && novoVal.trim() !== '') {
          cell.v = num;
          cell.t = 'n';
        } else {
          cell.v = novoVal;
          cell.t = 's';
        }
        delete cell.f; // remover fórmula se havia
      }

      // Avançar índice de contrato quando encontrar dadoPlanilha01 sem número
      if (val.includes('{dadoPlanilha01}') && !numMatch) {
        contratoIdx++;
      }
    }
  }
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
   npm install xlsx

4. Execute o script:
   node gerar.js

5. As planilhas geradas serão salvas na pasta "saida/" dentro desta pasta.

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
