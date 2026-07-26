import { getDb } from './server/db.ts';
import { extracoes, documentos } from './drizzle/schema.ts';
import { eq, and, like } from 'drizzle-orm';

async function main() {
  const db = await getDb();
  if (!db) { console.log('DB não disponível'); return; }
  
  const LOTE_ID = 420001;
  
  // Corrigir Cheque Especial 310131
  const rows310131 = await db.select().from(extracoes)
    .where(and(eq(extracoes.loteId, LOTE_ID), eq(extracoes.numeroContrato, '310131')));
  
  if (rows310131.length > 0) {
    const ext = rows310131[0];
    console.log('Antes:', { dp01: ext.dadoPlanilha01, dp02: ext.dadoPlanilha02, dp03: ext.dadoPlanilha03, dp04: ext.dadoPlanilha04 });
    
    // Buscar o texto do Extrato de Cheque Especial
    const docs = await db.select().from(documentos)
      .where(and(eq(documentos.loteId, LOTE_ID), like(documentos.nomeArquivo, '%CHEQUE ESPECIAL%310131%')));
    
    const doc = docs.find(d => d.textoExtraido);
    if (!doc) { console.log('Documento sem texto'); process.exit(0); }
    
    const texto = typeof doc.textoExtraido === 'string' ? doc.textoExtraido :
      Buffer.isBuffer(doc.textoExtraido) ? doc.textoExtraido.toString('utf8') : String(doc.textoExtraido);
    
    const linhas = texto.split('\n').map(l => l.trim());
    const dp02 = linhas[12] ?? null; // Conta Corrente
    const dp03 = linhas[31] ?? null; // Saldo Devedor
    const dp04 = linhas[43] ?? null; // Total dívida
    
    console.log('Novos valores:', { dp02, dp03, dp04 });
    
    await db.update(extracoes).set({
      dadoPlanilha02: dp02,
      dadoPlanilha03: dp03,
      dadoPlanilha04: dp04,
      multa2pct: 'nao',
    }).where(eq(extracoes.id, ext.id));
    
    console.log('Corrigido!');
  }
  
  // Verificar estado final de todos os contratos do lote 420001
  console.log('\n=== Estado final do lote 420001 ===');
  const todos = await db.select().from(extracoes).where(eq(extracoes.loteId, LOTE_ID));
  for (const r of todos) {
    console.log(`  ${r.numeroContrato}: dp01=${r.dadoPlanilha01} | dp02=${r.dadoPlanilha02} | dp03=${r.dadoPlanilha03} | dp04=${r.dadoPlanilha04} | multa=${r.multa2pct}`);
  }
  
  process.exit(0);
}
main().catch(e => { console.error(e); process.exit(1); });
