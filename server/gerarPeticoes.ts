/**
 * gerarPeticoes.ts
 * Serviço responsável por gerar petições iniciais (.docx e .pdf) a partir de
 * modelos .docx armazenados no S3, substituindo placeholders com dados dos devedores.
 */
import fs from "fs";
import os from "os";
import path from "path";
import PizZip from "pizzip";
import Docxtemplater from "docxtemplater";
import AdmZip from "adm-zip";
import extenso from "extenso";
import {
  getDevedoresByLote,
  getModeloInicialByNome,
  getAllClientes,
} from "./db";
import { getExtracoesByDevedor } from "./db";
import { storageGetSignedUrl, storagePut } from "./storage";

// ─── Helpers ─────────────────────────────────────────────────────────────────

/** Normaliza string para comparação: minúsculas, sem acentos. */
function normStr(s: string): string {
  const str = typeof s === "string" ? s : String(s);
  return str.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().trim();
}

/** Converte valor monetário BR para float. Ex: "13.128,59" → 13128.59 */
function parseBRFloat(valor: string | null | undefined): number {
  if (!valor) return 0;
  return parseFloat(String(valor).replace(/R\$\s*/g, '').replace(/\./g, '').replace(',', '.')) || 0;
}

/** Formata número para string BR. Ex: 13128.59 → "13.128,59" */
function formatBR(val: number): string {
  return val.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

/** Converte valor para formato por extenso com prefixo R$. */
export function valorPorExtenso(valorStr: string | number | null | undefined): string {
  let val: number;
  if (typeof valorStr === 'number') {
    val = valorStr;
  } else {
    val = parseBRFloat(valorStr);
  }
  if (isNaN(val) || val === 0) return '';

  const formatado = formatBR(val);

  // Gerar por extenso
  let ext = (extenso as any)(val, { mode: 'currency', currency: { type: 'BRL' } }) as string;

  // Remover vírgula desnecessária: "mil, reais" → "mil reais"
  ext = ext.replace(/\bmil,\s+(reais|e\s+reais)/g, 'mil $1');

  // Adicionar vírgula após "mil" quando seguido de número por extenso (sem vírgula)
  // "treze mil cento" → "treze mil, cento"
  ext = ext.replace(/\bmil\s+(?!reais|e\s+reais|,)([a-záéíóúâêôãõç])/gi, 'mil, $1');

  return `R$ ${formatado} (${ext})`;
}

/** Converte lista de contratos separados por "/" em texto: "X, Y e Z" */
function formatarContratos(contratos: string | null | undefined): string {
  if (!contratos) return '';
  const partes = contratos.split('/').map(s => s.trim()).filter(Boolean);
  if (partes.length === 0) return '';
  if (partes.length === 1) return partes[0];
  if (partes.length === 2) return `${partes[0]} e ${partes[1]}`;
  return partes.slice(0, -1).join(', ') + ' e ' + partes[partes.length - 1];
}

/** Mapa de estados brasileiros: sigla → nome por extenso com artigo */
const ESTADOS_BR: Record<string, string> = {
  AC: 'DO ACRE', AL: 'DE ALAGOAS', AP: 'DO AMAPÁ', AM: 'DO AMAZONAS',
  BA: 'DA BAHIA', CE: 'DO CEARÁ', DF: 'DO DISTRITO FEDERAL', ES: 'DO ESPÍRITO SANTO',
  GO: 'DE GOIÁS', MA: 'DO MARANHÃO', MT: 'DE MATO GROSSO', MS: 'DE MATO GROSSO DO SUL',
  MG: 'DE MINAS GERAIS', PA: 'DO PARÁ', PB: 'DA PARAÍBA', PR: 'DO PARANÁ',
  PE: 'DE PERNAMBUCO', PI: 'DO PIAUÍ', RJ: 'DO RIO DE JANEIRO', RN: 'DO RIO GRANDE DO NORTE',
  RS: 'DO RIO GRANDE DO SUL', RO: 'DE RONDÔNIA', RR: 'DE RORAIMA', SC: 'DE SANTA CATARINA',
  SP: 'DE SÃO PAULO', SE: 'DE SERGIPE', TO: 'DO TOCANTINS',
};

/** Mapa cidade → sigla do estado para capitais e cidades mais comuns */
const CIDADE_ESTADO: Record<string, string> = {
  'MANAUS': 'AM', 'BELO HORIZONTE': 'MG', 'CURITIBA': 'PR', 'FORTALEZA': 'CE',
  'RECIFE': 'PE', 'PORTO ALEGRE': 'RS', 'SALVADOR': 'BA', 'BELÉM': 'PA',
  'GOIÂNIA': 'GO', 'FLORIANÓPOLIS': 'SC', 'SÃO LUÍS': 'MA', 'MACEIÓ': 'AL',
  'NATAL': 'RN', 'TERESINA': 'PI', 'CAMPO GRANDE': 'MS', 'JOÃO PESSOA': 'PB',
  'ARACAJU': 'SE', 'CUIABÁ': 'MT', 'MACAPÁ': 'AP', 'PORTO VELHO': 'RO',
  'BOA VISTA': 'RR', 'PALMAS': 'TO', 'RIO BRANCO': 'AC', 'VITÓRIA': 'ES',
  'RIO DE JANEIRO': 'RJ', 'SÃO PAULO': 'SP', 'BRASÍLIA': 'DF',
  'CAMPINAS': 'SP', 'SANTOS': 'SP', 'RIBEIRÃO PRETO': 'SP', 'SÃO BERNARDO DO CAMPO': 'SP',
  'OSASCO': 'SP', 'GUARULHOS': 'SP', 'SOROCABA': 'SP', 'SÃO JOSÉ DOS CAMPOS': 'SP',
  'LONDRINA': 'PR', 'MARINGÁ': 'PR', 'JOINVILLE': 'SC', 'UBERLÂNDIA': 'MG',
  'CONTAGEM': 'MG', 'JUIZ DE FORA': 'MG', 'NITERÓI': 'RJ', 'DUQUE DE CAXIAS': 'RJ',
  'NOVA IGUAÇU': 'RJ', 'CARUARU': 'PE', 'FEIRA DE SANTANA': 'BA', 'CAUCAIA': 'CE',
};

/** Foros regionais da capital de SP */
const FOROS_REGIONAIS_SP: Record<string, string> = {
  'CENTRAL': 'CENTRAL',
  'SANTO AMARO': 'SANTO AMARO',
  'PINHEIROS': 'PINHEIROS',
  'SANTANA': 'SANTANA',
  'N. SRA. DO O': 'NOSSA SENHORA DO Ó',
  'NOSSA SENHORA DO O': 'NOSSA SENHORA DO Ó',
  'NOSSA SENHORA DO Ó': 'NOSSA SENHORA DO Ó',
  'N. SRA. DO Ó': 'NOSSA SENHORA DO Ó',
  'LAPA': 'LAPA',
  'BUTANTÃ': 'BUTANTÃ',
  'BUTANTA': 'BUTANTÃ',
  'SÃO MIGUEL PAULISTA': 'SÃO MIGUEL PAULISTA',
  'SAO MIGUEL PAULISTA': 'SÃO MIGUEL PAULISTA',
  'PENHA': 'PENHA DE FRANÇA',
  'PENHA DE FRANCA': 'PENHA DE FRANÇA',
  'PENHA DE FRANÇA': 'PENHA DE FRANÇA',
  'ITAQUERA': 'ITAQUERA',
  'TATUAPÉ': 'TATUAPÉ',
  'TATUAPE': 'TATUAPÉ',
  'VILA PRUDENTE': 'VILA PRUDENTE',
  'JABAQUARA': 'JABAQUARA',
  'IPIRANGA': 'IPIRANGA',
};


/**
 * Extrai a sigla do estado (UF) de um endereço no formato "..., CIDADE/UF - CEP: ..."
 * Ex: "RUA WASHINGTON LUIZ, 678, IBATÉ/SP - CEP: 14817046" → "SP"
 */
export function extrairUFDoEndereco(endereco: string | null | undefined): string | null {
  if (!endereco) return null;
  const match = endereco.match(/\/([A-Z]{2})(?:\s*[-\u2013]|\s*$|\s*,)/);
  if (match) return match[1];
  const match2 = endereco.match(/\b([A-Z]{2})\s*[-\u2013]\s*CEP/);
  if (match2) return match2[1];
  return null;
}

/**
 * Formata o valor do campo FORO para o formato adequado na petição:
 * - Foros regionais de SP → "FORO REGIONAL {NOME} - CAPITAL, ESTADO DE SÃO PAULO,"
 * - Outras cidades → "{CIDADE}, ESTADO {DE/DO/DA} {ESTADO},"
 */
export function formatarForo(foro: string | null | undefined, enderecoDevedor?: string | null): string {
  if (!foro) return '';
  const foroUpper = foro.trim().toUpperCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
  const foroOriginal = foro.trim().toUpperCase();

  // Verificar se é foro regional de SP (comparação sem acento)
  for (const [chave, nomeCompleto] of Object.entries(FOROS_REGIONAIS_SP)) {
    const chaveNorm = chave.toUpperCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
    if (foroUpper === chaveNorm || foroUpper.includes(chaveNorm)) {
      return `FORO REGIONAL ${nomeCompleto} - CAPITAL, ESTADO DE SÃO PAULO,`;
    }
  }

  // Tentar extrair UF do endereço do devedor (ex: CIDADE/SP)
  const ufDoEndereco = extrairUFDoEndereco(enderecoDevedor);
  if (ufDoEndereco && ESTADOS_BR[ufDoEndereco]) {
    return `${foroOriginal}, ESTADO ${ESTADOS_BR[ufDoEndereco]},`;
  }
  // Tentar identificar o estado pela cidade
  const cidadeNorm = foroOriginal;
  for (const [cidade, sigla] of Object.entries(CIDADE_ESTADO)) {
    const cidadeKey = cidade.toUpperCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
    if (foroUpper === cidadeKey || foroUpper.startsWith(cidadeKey)) {
      const estadoArtigo = ESTADOS_BR[sigla] ?? `DO ${sigla}`;
      return `${cidadeNorm}, ESTADO ${estadoArtigo},`;
    }
  }

  // Fallback: retornar a cidade como está, sem estado (usuário pode editar)
  return `${foroOriginal},`;
}

/** Extrai placeholders {NOME} de um buffer .docx */
export function extrairPlaceholders(docxBuffer: Buffer): string[] {

  try {
    const zip = new PizZip(docxBuffer);
    // Ler o document.xml
    const xmlContent = zip.file("word/document.xml")?.asText() ?? "";
    // O Word fragmenta o texto em múltiplos <w:r> (runs), então "{VEICULO}" pode aparecer
    // como "{VEIC" num run e "ULO}" em outro. Precisamos extrair o texto puro de cada
    // parágrafo (<w:p>) antes de aplicar o regex.
    //
    // Estratégia 1: extrair texto de cada <w:p> concatenando todos os <w:t> dentro dele
    const paragraphTexts: string[] = [];
    const paraRegex = /<w:p[\s>][\s\S]*?<\/w:p>/g;
    let paraMatch: RegExpExecArray | null;
    while ((paraMatch = paraRegex.exec(xmlContent)) !== null) {
      const paraXml = paraMatch[0];
      // Extrair todos os <w:t> e concatenar
      const textParts: string[] = [];
      const tRegex = /<w:t(?:\s[^>]*)?>([^<]*)<\/w:t>/g;
      let tMatch: RegExpExecArray | null;
      while ((tMatch = tRegex.exec(paraXml)) !== null) {
        textParts.push(tMatch[1]);
      }
      paragraphTexts.push(textParts.join(''));
    }
    // Estratégia 2: também buscar no XML bruto (para placeholders não fragmentados)
    const fullText = paragraphTexts.join('\n');
    const allText = fullText + '\n' + xmlContent;
    // Buscar todos os {PLACEHOLDER} — letras maiúsculas, underscores, números
    const matches = allText.match(/\{([A-Za-z0-9_]+)\}/g) ?? [];
    // Remover duplicatas e retornar apenas o nome sem chaves
    const unique = Array.from(new Set(matches.map(m => m.slice(1, -1))));
    return unique;
  } catch {
    return [];
  }
}

/** Busca o cliente correspondente à cooperativa do devedor (matching fuzzy) */
async function getClienteByCooperativa(cooperativa: string | null | undefined) {
  if (!cooperativa) return null;
  const todosClientes = await getAllClientes();
  const coopNorm = normStr(cooperativa);
  let match = todosClientes.find((c) => normStr(c.nomeFantasia) === coopNorm);
  if (!match) {
    match = todosClientes.find((c) => {
      const cn = normStr(c.nomeFantasia);
      return cn.includes(coopNorm) || coopNorm.includes(cn);
    });
  }
  return match ?? null;
}

/** Baixa um arquivo do S3 e retorna como Buffer */
async function baixarDoS3(fileKey: string): Promise<Buffer> {
  const signedUrl = await storageGetSignedUrl(fileKey);
  const resp = await fetch(signedUrl);
  if (!resp.ok) throw new Error(`Falha ao baixar arquivo do S3: ${resp.status}`);
  const arrayBuffer = await resp.arrayBuffer();
  return Buffer.from(arrayBuffer);
}

// ─── Tipos ───────────────────────────────────────────────────────────────────

export interface DadosPeticaoDevedor {
  devedorId: number;
  contrarioNome: string;
  contrarioCpf: string | null;
  contrarioEndereco: string | null;
  cooperativa: string | null;
  foro: string | null;
  contratos: string | null;
  valorCausa: string | null;
  vencBordero: string | null;
  valorBordero: string | null;
  dataBordero: string | null;
  veiculoModelo: string | null;
  veiculoAno: string | null;
  veiculoPlaca: string | null;
  veiculoRenavam: string | null;
  veiculoChassis: string | null;
  modeloInicial: string | null;
  // Dados do cliente
  clienteNomeCompleto: string | null;
  clienteDoc: string | null;
  clienteEnderecoCoop: string | null;
  clienteParagrafaInicial: string | null;
  // Extrações (contratos)
  extracoes: Array<{
    id: number;
    numeroContrato: string;
    dadoPlanilha01: string | null;
    dadoPlanilha02: string | null;
    dadoPlanilha03: string | null;
    dadoPlanilha04: string | null;
    multa2pct: string | null;
    moraEspecifica: string | null;
    indiceCorrecao: string | null;
    tipoContrato: string | null;
  }>;
  // Placeholders do modelo
  placeholders: string[];
  // Valores preenchidos pelo usuário (mapa placeholder → valor)
  valoresPlaceholders: Record<string, string>;
}

// ─── Funções principais ───────────────────────────────────────────────────────

/**
 * Retorna os dados necessários para a página de geração de petições.
 * Para cada devedor do lote, retorna dados + placeholders do modelo.
 */
export async function getDadosPeticoes(loteId: number): Promise<DadosPeticaoDevedor[]> {
  const devedores = await getDevedoresByLote(loteId);
  const resultado: DadosPeticaoDevedor[] = [];

  // Cache de modelos já baixados (evita baixar o mesmo modelo várias vezes)
  const modeloCache = new Map<string, { buffer: Buffer; placeholders: string[] }>();

  for (const dev of devedores) {
    // Buscar cliente correspondente
    const cliente = await getClienteByCooperativa(dev.cooperativa);

    // Buscar extrações (contratos) do devedor
    const extracoesDev = await getExtracoesByDevedor(dev.id);

    // Buscar modelo de petição
    let placeholders: string[] = [];
    const modeloNome = dev.modeloInicial;
    if (modeloNome) {
      if (modeloCache.has(modeloNome)) {
        placeholders = modeloCache.get(modeloNome)!.placeholders;
      } else {
        try {
          const modelo = await getModeloInicialByNome(modeloNome);
          if (modelo?.fileKey) {
            const buffer = await baixarDoS3(modelo.fileKey);
            placeholders = extrairPlaceholders(buffer);
            modeloCache.set(modeloNome, { buffer, placeholders });
          }
        } catch (err) {
          console.error(`Erro ao baixar modelo "${modeloNome}":`, err);
        }
      }
    }

    // Calcular valor por extenso
    const valorCausaExtenso = valorPorExtenso(dev.valorCausa);

    // Pré-preencher valores dos placeholders com dados disponíveis
    const valoresPlaceholders: Record<string, string> = {};
    for (const ph of placeholders) {
      valoresPlaceholders[ph] = '';
    }
    // Pré-preencher com dados conhecidos
    if (valoresPlaceholders.hasOwnProperty('FORO')) valoresPlaceholders['FORO'] = formatarForo(dev.foro, dev.contrarioEndereco);
    if (valoresPlaceholders.hasOwnProperty('COOPERATIVA')) valoresPlaceholders['COOPERATIVA'] = dev.cooperativa ?? '';
    if (valoresPlaceholders.hasOwnProperty('NOME_COOP')) valoresPlaceholders['NOME_COOP'] = cliente?.nomeCompleto ?? '';
    if (valoresPlaceholders.hasOwnProperty('DOC_COOP')) valoresPlaceholders['DOC_COOP'] = cliente?.doc ?? '';
    if (valoresPlaceholders.hasOwnProperty('ENDERECO_COOP')) valoresPlaceholders['ENDERECO_COOP'] = cliente?.enderecoCoop ?? '';
    if (valoresPlaceholders.hasOwnProperty('DEVEDOR_NOME_1')) valoresPlaceholders['DEVEDOR_NOME_1'] = dev.contrarioNome ?? '';
    if (valoresPlaceholders.hasOwnProperty('DEVEDOR_CPF_1')) valoresPlaceholders['DEVEDOR_CPF_1'] = dev.contrarioCpf ?? '';
    if (valoresPlaceholders.hasOwnProperty('DEVEDOR_ENDERECO_1')) valoresPlaceholders['DEVEDOR_ENDERECO_1'] = dev.contrarioEndereco ?? '';
    if (valoresPlaceholders.hasOwnProperty('CONTRATO')) valoresPlaceholders['CONTRATO'] = formatarContratos(dev.contratos);
    if (valoresPlaceholders.hasOwnProperty('VALOR_CAUSA')) valoresPlaceholders['VALOR_CAUSA'] = valorCausaExtenso;
    if (valoresPlaceholders.hasOwnProperty('PARAGRAFO_INICIAL')) valoresPlaceholders['PARAGRAFO_INICIAL'] = cliente?.paragrafaInicial ?? '';
    if (valoresPlaceholders.hasOwnProperty('PLANILHA')) valoresPlaceholders['PLANILHA'] = '';
    // VENC_INICIAL = dadoPlanilha02 e VENC_FINAL = dadoPlanilha03 do contrato de empréstimo
    const extracaoEmprestimo = extracoesDev.find(e => e.tipoContrato === 'emprestimo') ?? extracoesDev[0] ?? null;
    if (valoresPlaceholders.hasOwnProperty('VENC_INICIAL')) valoresPlaceholders['VENC_INICIAL'] = extracaoEmprestimo?.dadoPlanilha02 ?? '';
    if (valoresPlaceholders.hasOwnProperty('VENC_FINAL')) valoresPlaceholders['VENC_FINAL'] = extracaoEmprestimo?.dadoPlanilha03 ?? '';
    // Placeholders específicos de Cartão (tipoContrato = 'cartao')
    const extracaoCartao = extracoesDev.find(e => e.tipoContrato === 'cartao') ?? null;
    if (valoresPlaceholders.hasOwnProperty('dadoPlanilha01_Cartao')) valoresPlaceholders['dadoPlanilha01_Cartao'] = extracaoCartao?.dadoPlanilha01 ?? '';
    if (valoresPlaceholders.hasOwnProperty('dadoPlanilha02_Cartao')) valoresPlaceholders['dadoPlanilha02_Cartao'] = extracaoCartao?.dadoPlanilha02 ?? '';
    if (valoresPlaceholders.hasOwnProperty('dadoPlanilha03_Cartao')) valoresPlaceholders['dadoPlanilha03_Cartao'] = extracaoCartao?.dadoPlanilha03 ?? '';
    // Placeholders específicos de Cheque Especial/CE (tipoContrato = 'cheque')
    const extracaoCE = extracoesDev.find(e => e.tipoContrato === 'cheque') ?? null;
    if (valoresPlaceholders.hasOwnProperty('dadoPlanilha01_CE')) valoresPlaceholders['dadoPlanilha01_CE'] = extracaoCE?.dadoPlanilha01 ?? '';
    if (valoresPlaceholders.hasOwnProperty('dadoPlanilha02_CE')) valoresPlaceholders['dadoPlanilha02_CE'] = extracaoCE?.dadoPlanilha02 ?? '';
    if (valoresPlaceholders.hasOwnProperty('VALOR')) valoresPlaceholders['VALOR'] = dev.valorBordero ?? '';
    if (valoresPlaceholders.hasOwnProperty('VEICULO')) valoresPlaceholders['VEICULO'] = dev.veiculoModelo ?? '';
    if (valoresPlaceholders.hasOwnProperty('PLACA')) valoresPlaceholders['PLACA'] = dev.veiculoPlaca ?? '';
    if (valoresPlaceholders.hasOwnProperty('ANO')) valoresPlaceholders['ANO'] = dev.veiculoAno ?? '';
    if (valoresPlaceholders.hasOwnProperty('RENAVAM')) valoresPlaceholders['RENAVAM'] = dev.veiculoRenavam ?? '';
    if (valoresPlaceholders.hasOwnProperty('CHASSIS')) valoresPlaceholders['CHASSIS'] = dev.veiculoChassis ?? '';
    if (valoresPlaceholders.hasOwnProperty('MORA')) valoresPlaceholders['MORA'] = dev.dataBordero ?? '';

    resultado.push({
      devedorId: dev.id,
      contrarioNome: dev.contrarioNome ?? '',
      contrarioCpf: dev.contrarioCpf,
      contrarioEndereco: dev.contrarioEndereco,
      cooperativa: dev.cooperativa,
      foro: dev.foro,
      contratos: dev.contratos,
      valorCausa: dev.valorCausa,
      vencBordero: dev.vencBordero,
      valorBordero: dev.valorBordero,
      dataBordero: dev.dataBordero,
      veiculoModelo: dev.veiculoModelo,
      veiculoAno: dev.veiculoAno,
      veiculoPlaca: dev.veiculoPlaca,
      veiculoRenavam: dev.veiculoRenavam,
      veiculoChassis: dev.veiculoChassis,
      modeloInicial: dev.modeloInicial,
      clienteNomeCompleto: cliente?.nomeCompleto ?? null,
      clienteDoc: cliente?.doc ?? null,
      clienteEnderecoCoop: cliente?.enderecoCoop ?? null,
      clienteParagrafaInicial: cliente?.paragrafaInicial ?? null,
      extracoes: extracoesDev.map(e => ({
        id: e.id,
        numeroContrato: e.numeroContrato,
        dadoPlanilha01: e.dadoPlanilha01,
        dadoPlanilha02: e.dadoPlanilha02,
        dadoPlanilha03: e.dadoPlanilha03,
        dadoPlanilha04: e.dadoPlanilha04,
        multa2pct: e.multa2pct,
        moraEspecifica: e.moraEspecifica,
        indiceCorrecao: e.indiceCorrecao,
        tipoContrato: e.tipoContrato,
      })),
      placeholders,
      valoresPlaceholders,
    });
  }

  return resultado;
}

export interface GerarPeticoesInput {
  loteId: number;
  dadosPorDevedor: Array<{
    devedorId: number;
    modeloInicial: string;
    cooperativa: string;
    contrarioNome: string;
    valoresPlaceholders: Record<string, string>;
  }>;
}

export interface GerarPeticoesResult {
  zipKey: string;
  zipUrl: string;
  totalGerados: number;
  erros: Array<{ devedorId: number; nome: string; erro: string }>;
}

/**
 * Gera petições (.docx e .pdf) para todos os devedores do lote.
 * Retorna um ZIP com todos os arquivos gerados, salvo no S3.
 */
export async function gerarPeticoes(input: GerarPeticoesInput): Promise<GerarPeticoesResult> {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'peticoes-'));
  const erros: Array<{ devedorId: number; nome: string; erro: string }> = [];
  let totalGerados = 0;

  // Cache de modelos
  const modeloCache = new Map<string, Buffer>();

  try {
    for (const dadosDevedor of input.dadosPorDevedor) {
      const { devedorId, modeloInicial, cooperativa, contrarioNome, valoresPlaceholders } = dadosDevedor;

      try {
        // Baixar modelo do S3
        let modeloBuffer: Buffer;
        if (modeloCache.has(modeloInicial)) {
          modeloBuffer = modeloCache.get(modeloInicial)!;
        } else {
          const modelo = await getModeloInicialByNome(modeloInicial);
          if (!modelo?.fileKey) {
            throw new Error(`Modelo "${modeloInicial}" não encontrado no banco.`);
          }
          modeloBuffer = await baixarDoS3(modelo.fileKey);
          modeloCache.set(modeloInicial, modeloBuffer);
        }

        // Substituir placeholders com docxtemplater
        const zip = new PizZip(modeloBuffer);
        const doc = new (Docxtemplater as any)(zip, {
          paragraphLoop: true,
          linebreaks: true,
          nullGetter: () => '',
          data: valoresPlaceholders,
        });

        doc.render();

        const docxBuffer: Buffer = doc.getZip().generate({ type: 'nodebuffer' });

        // Nome do arquivo
        const nomeArquivo = `PETIÇÃO ${modeloInicial} ${cooperativa} - ${contrarioNome}`;
        const docxPath = path.join(tmpDir, `${nomeArquivo}.docx`);
        fs.writeFileSync(docxPath, docxBuffer);


        totalGerados++;
      } catch (err: any) {
        erros.push({
          devedorId,
          nome: contrarioNome,
          erro: err?.message ?? String(err),
        });
      }
    }

    // Criar ZIP com todos os arquivos gerados
    const admZip = new AdmZip();
    const arquivos = fs.readdirSync(tmpDir);
    for (const arquivo of arquivos) {
      const filePath = path.join(tmpDir, arquivo);
      admZip.addLocalFile(filePath);
    }

    const zipBuffer = admZip.toBuffer();
    const zipKey = `peticoes/lote-${input.loteId}-${Date.now()}.zip`;
    const { key, url } = await storagePut(zipKey, zipBuffer, 'application/zip');

    return { zipKey: key, zipUrl: url, totalGerados, erros };
  } finally {
    // Limpar arquivos temporários
    try {
      fs.rmSync(tmpDir, { recursive: true, force: true });
    } catch {}
  }
}
