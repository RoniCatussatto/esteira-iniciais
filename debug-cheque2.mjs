import { getDb } from './server/db.ts';
import { docConfigs } from './drizzle/schema.ts';
import { like } from 'drizzle-orm';

async function main() {
  const db = await getDb();
  if (!db) { console.log('DB não disponível'); return; }
  const rows = await db.select({ id: docConfigs.id, nomeDocumento: docConfigs.nomeDocumento, configJson: docConfigs.configJson })
    .from(docConfigs)
    .where(like(docConfigs.nomeDocumento, '%Cheque%'));
  for (const r of rows) {
    console.log('ID:', r.id, '| Nome:', r.nomeDocumento);
    if (r.configJson) {
      try {
        const cfg = JSON.parse(r.configJson);
        console.log('camposExtracao:', JSON.stringify(cfg.camposExtracao, null, 2));
        console.log('mapeamentoCampos:', JSON.stringify(cfg.mapeamentoCampos, null, 2));
      } catch(e) { console.log('configJson raw:', String(r.configJson).substring(0, 500)); }
    }
  }
  process.exit(0);
}
main().catch(e => { console.error(e); process.exit(1); });
