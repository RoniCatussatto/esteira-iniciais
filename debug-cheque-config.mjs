import { getDb } from './server/db.ts';
import { docConfigs } from './drizzle/schema.ts';
import { eq } from 'drizzle-orm';

async function main() {
  const db = await getDb();
  if (!db) { console.log('DB não disponível'); return; }
  
  const rows = await db.select().from(docConfigs).where(eq(docConfigs.id, 300001));
  for (const r of rows) {
    console.log('Nome:', r.nomeDocumento);
    const cfg = JSON.parse(r.configJson || '{}');
    console.log('camposExtracao:', JSON.stringify(cfg.camposExtracao, null, 2));
    console.log('mapeamentoCampos:', JSON.stringify(cfg.mapeamentoCampos, null, 2));
  }
  
  process.exit(0);
}
main().catch(e => { console.error(e); process.exit(1); });
