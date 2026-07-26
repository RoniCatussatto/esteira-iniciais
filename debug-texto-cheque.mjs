import { getDb } from './server/db.ts';
import { documentos } from './drizzle/schema.ts';
import { like } from 'drizzle-orm';

async function main() {
  const db = await getDb();
  if (!db) { console.log('DB não disponível'); return; }
  const rows = await db.select({ id: documentos.id, nomeArquivo: documentos.nomeArquivo, textoExtraido: documentos.textoExtraido })
    .from(documentos)
    .where(like(documentos.nomeArquivo, '%CHEQUE%'));
  for (const r of rows) {
    console.log('ID:', r.id, '| Nome:', r.nomeArquivo);
    const texto = typeof r.textoExtraido === 'string' ? r.textoExtraido : Buffer.isBuffer(r.textoExtraido) ? r.textoExtraido.toString('utf8') : String(r.textoExtraido || '');
    if (texto) {
      const linhas = texto.split('\n');
      console.log('Total linhas:', linhas.length);
      linhas.forEach((l, i) => { if (l.trim()) console.log(`  [${i}] ${l.trim()}`); });
    } else {
      console.log('  (sem texto extraído)');
    }
  }
  process.exit(0);
}
main().catch(e => { console.error(e); process.exit(1); });
