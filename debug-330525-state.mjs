import { getDb } from './server/db.ts';
import { extracoes, devedores } from './drizzle/schema.ts';
import { eq, like } from 'drizzle-orm';

async function main() {
  const db = await getDb();
  if (!db) { console.log('DB não disponível'); return; }
  
  // Buscar extrações do contrato 330525
  const rows = await db.select().from(extracoes).where(eq(extracoes.numeroContrato, '330525'));
  console.log('Extrações do contrato 330525:');
  for (const r of rows) {
    console.log(JSON.stringify({ id: r.id, devedorId: r.devedorId, loteId: r.loteId, dp01: r.dadoPlanilha01, dp02: r.dadoPlanilha02, dp03: r.dadoPlanilha03, dp04: r.dadoPlanilha04, multa: r.multa2pct }, null, 2));
  }
  process.exit(0);
}
main().catch(e => { console.error(e); process.exit(1); });
