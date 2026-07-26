import { getDb } from './server/db.ts';
import { extracoes, documentos, docConfigs } from './drizzle/schema.ts';
import { eq, and } from 'drizzle-orm';
import { triarDocumentos, processarItemTriagemComTexto } from './server/extractor.ts';

async function main() {
  const db = await getDb();
  if (!db) { console.log('DB não disponível'); return; }
  
  const LOTE_ID = 420001;
  
  // Buscar todos os documentos do lote que são Faturas
  const docs = await db.select().from(documentos).where(eq(documentos.loteId, LOTE_ID));
  const faturas = docs.filter(d => d.nomeArquivo.toUpperCase().includes('FATURA') && d.textoExtraido);
  
  console.log(`Faturas com texto: ${faturas.length}`);
  
  for (const fatura of faturas) {
    // Extrair número do contrato do nome da fatura: FATURA - 330525.pdf
    const match = fatura.nomeArquivo.match(/FATURA\s*-\s*(\d+)/i);
    if (!match) { console.log(`Não encontrou contrato em: ${fatura.nomeArquivo}`); continue; }
    const contrato = match[1];
    
    // Buscar extração atual
    const extRows = await db.select().from(extracoes)
      .where(and(eq(extracoes.loteId, LOTE_ID), eq(extracoes.numeroContrato, contrato)));
    
    if (extRows.length === 0) { console.log(`Contrato ${contrato} não encontrado nas extrações`); continue; }
    const ext = extRows[0];
    
    console.log(`\nContrato ${contrato}:`);
    console.log(`  dp01 atual: ${ext.dadoPlanilha01}`);
    console.log(`  dp02 atual: ${ext.dadoPlanilha02}`);
    
    // Verificar se dp01 parece ser número de conta cartão (começa com 756449...)
    if (ext.dadoPlanilha01?.startsWith('756449')) {
      console.log(`  → dp01 já está correto (conta cartão)`);
      continue;
    }
    
    // Extrair dados da fatura usando o texto já salvo
    const textoStr = typeof fatura.textoExtraido === 'string' ? fatura.textoExtraido : 
      Buffer.isBuffer(fatura.textoExtraido) ? fatura.textoExtraido.toString('utf8') : String(fatura.textoExtraido);
    
    // Regex da Fatura: dp01 = número de conta cartão (75644XXXXXXXX), dp02 = contrato do nome
    const regexConta = /75644\d{8}/;
    const matchConta = textoStr.match(regexConta);
    const numeroConta = matchConta ? matchConta[0] : null;
    
    console.log(`  Número de conta encontrado: ${numeroConta}`);
    
    if (numeroConta) {
      await db.update(extracoes).set({
        dadoPlanilha01: numeroConta,
        dadoPlanilha02: contrato,
      }).where(eq(extracoes.id, ext.id));
      console.log(`  → Corrigido: dp01=${numeroConta}, dp02=${contrato}`);
    } else {
      console.log(`  → Número de conta não encontrado no texto da fatura`);
    }
  }
  
  process.exit(0);
}
main().catch(e => { console.error(e); process.exit(1); });
