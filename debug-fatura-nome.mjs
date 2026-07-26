import { getDb } from './server/db.ts';
import { docConfigs } from './drizzle/schema.ts';
import { like } from 'drizzle-orm';

async function main() {
  const db = await getDb();
  if (!db) { console.log('DB não disponível'); return; }
  const rows = await db.select({ id: docConfigs.id, nomeDocumento: docConfigs.nomeDocumento })
    .from(docConfigs);
  for (const r of rows) {
    console.log('ID:', r.id, '| Nome:', JSON.stringify(r.nomeDocumento));
  }
  process.exit(0);
}
main().catch(e => { console.error(e); process.exit(1); });
