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
    if (!String(r.nomeArquivo).includes('310131')) continue;
    const texto = typeof r.textoExtraido === 'string' ? r.textoExtraido : Buffer.isBuffer(r.textoExtraido) ? r.textoExtraido.toString('utf8') : String(r.textoExtraido || '');
    const linhas = texto.split('\n').map(l => l.trim());
    // Mostrar linhas 7-45
    for (let i = 7; i <= 45; i++) {
      console.log(`[${i}] ${linhas[i] || ''}`);
    }
  }
  process.exit(0);
}
main().catch(e => { console.error(e); process.exit(1); });
