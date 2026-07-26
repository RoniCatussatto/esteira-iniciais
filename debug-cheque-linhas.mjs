import { getDb } from './server/db.ts';
import { documentos } from './drizzle/schema.ts';
import { eq, like } from 'drizzle-orm';

async function main() {
  const db = await getDb();
  if (!db) { console.log('DB não disponível'); return; }
  
  const docs = await db.select().from(documentos)
    .where(like(documentos.nomeArquivo, '%310131%'));
  
  for (const doc of docs) {
    if (!doc.textoExtraido) continue;
    const texto = typeof doc.textoExtraido === 'string' ? doc.textoExtraido :
      Buffer.isBuffer(doc.textoExtraido) ? doc.textoExtraido.toString('utf8') : String(doc.textoExtraido);
    
    // Verificar se é texto legível
    const linhas = texto.split('\n');
    if (linhas[0].includes('\u0000') || linhas[0].length < 3) continue;
    
    console.log(`\n=== ${doc.nomeArquivo} (lote ${doc.loteId}) ===`);
    console.log('Linhas 10-15:');
    linhas.slice(10, 16).forEach((l, i) => console.log(`  ${i+10}: ${JSON.stringify(l)}`));
    console.log('Linhas 29-35:');
    linhas.slice(29, 36).forEach((l, i) => console.log(`  ${i+29}: ${JSON.stringify(l)}`));
    console.log('Linhas 41-46:');
    linhas.slice(41, 47).forEach((l, i) => console.log(`  ${i+41}: ${JSON.stringify(l)}`));
  }
  
  process.exit(0);
}
main().catch(e => { console.error(e); process.exit(1); });
