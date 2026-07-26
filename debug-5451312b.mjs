import { getDb } from './server/db.ts';
import { documentos, extracoes } from './drizzle/schema.ts';
import { eq, and, like } from 'drizzle-orm';

async function main() {
  const db = await getDb();
  if (!db) { console.log('DB não disponível'); return; }
  
  // Verificar os documentos do devedor com 5451312
  const docs = await db.select({ id: documentos.id, nomeArquivo: documentos.nomeArquivo, devedorId: documentos.devedorId, loteId: documentos.loteId })
    .from(documentos)
    .where(eq(documentos.loteId, 420001));
  
  const doc5451312 = docs.find(d => d.nomeArquivo.includes('5451312'));
  if (!doc5451312) { console.log('Não encontrado'); process.exit(0); }
  
  const docsDevedor = docs.filter(d => d.devedorId === doc5451312.devedorId);
  console.log('Documentos do devedor 5451312:');
  for (const d of docsDevedor) {
    console.log(`  ${d.nomeArquivo}`);
  }
  
  // Verificar o texto da fatura 5451312
  const fatura = await db.select().from(documentos)
    .where(and(eq(documentos.loteId, 420001), like(documentos.nomeArquivo, 'FATURA%5451312%')));
  
  if (fatura.length > 0 && fatura[0].textoExtraido) {
    const texto = typeof fatura[0].textoExtraido === 'string' ? fatura[0].textoExtraido :
      Buffer.isBuffer(fatura[0].textoExtraido) ? fatura[0].textoExtraido.toString('utf8') : String(fatura[0].textoExtraido);
    console.log('\nTexto da fatura (primeiras 300 chars):', texto.substring(0, 300));
  } else {
    console.log('\nFatura não encontrada ou sem texto');
  }
  
  process.exit(0);
}
main().catch(e => { console.error(e); process.exit(1); });
