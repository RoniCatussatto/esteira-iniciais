import { getDb } from './server/db.ts';
import { extracoes } from './drizzle/schema.ts';
import { eq } from 'drizzle-orm';

async function main() {
  const db = await getDb();
  if (!db) { console.log('DB não disponível'); return; }
  
  const rows = await db.select().from(extracoes)
    .where(eq(extracoes.numeroContrato, '310131'));
  
  for (const r of rows) {
    console.log(`Lote ${r.loteId} | Contrato ${r.numeroContrato}:`);
    console.log(`  dp01: ${r.dadoPlanilha01}`);
    console.log(`  dp02: ${r.dadoPlanilha02}`);
    console.log(`  dp03: ${r.dadoPlanilha03}`);
    console.log(`  dp04: ${r.dadoPlanilha04}`);
    console.log(`  multa: ${r.multa2pct}`);
  }
  
  process.exit(0);
}
main().catch(e => { console.error(e); process.exit(1); });
