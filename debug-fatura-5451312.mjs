import { getDb } from './server/db.ts';
import { documentos } from './drizzle/schema.ts';
import { eq, like } from 'drizzle-orm';

async function main() {
  const db = await getDb();
  if (!db) { console.log('DB não disponível'); return; }
  
  const docs = await db.select().from(documentos)
    .where(like(documentos.nomeArquivo, '%5451312%'));
  
  for (const doc of docs) {
    console.log('Nome:', doc.nomeArquivo, '| Lote:', doc.loteId);
    if (doc.textoExtraido) {
      const texto = typeof doc.textoExtraido === 'string' ? doc.textoExtraido :
        Buffer.isBuffer(doc.textoExtraido) ? doc.textoExtraido.toString('utf8') : String(doc.textoExtraido);
      console.log('Texto (primeiros 500 chars):', texto.substring(0, 500));
      console.log('Linhas 0-20:');
      texto.split('\n').slice(0, 20).forEach((l, i) => console.log(`  ${i}: ${JSON.stringify(l)}`));
    } else {
      console.log('Texto: NULL');
    }
  }
  
  process.exit(0);
}
main().catch(e => { console.error(e); process.exit(1); });
