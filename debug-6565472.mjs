import { getDb } from './server/db.ts';
import { documentos } from './drizzle/schema.ts';
import { eq, like } from 'drizzle-orm';

async function main() {
  const db = await getDb();
  if (!db) { console.log('DB não disponível'); return; }
  
  const docs = await db.select({ id: documentos.id, nomeArquivo: documentos.nomeArquivo, loteId: documentos.loteId, textoLen: documentos.textoExtraido })
    .from(documentos)
    .where(like(documentos.nomeArquivo, '%6565472%'));
  
  for (const doc of docs) {
    const textoLen = doc.textoLen ? (typeof doc.textoLen === 'string' ? doc.textoLen.length : Buffer.isBuffer(doc.textoLen) ? doc.textoLen.length : 0) : 0;
    console.log(`Lote ${doc.loteId} | ${doc.nomeArquivo} | textoLen=${textoLen}`);
  }
  
  process.exit(0);
}
main().catch(e => { console.error(e); process.exit(1); });
