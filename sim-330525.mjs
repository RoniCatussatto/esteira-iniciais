import { getDb } from './server/db.ts';
import { extracoes, devedores } from './drizzle/schema.ts';
import { eq } from 'drizzle-orm';

async function main() {
  const db = await getDb();
  if (!db) { console.log('DB não disponível'); return; }
  
  // Buscar o registro do contrato 330525 no lote 420001
  const rows = await db.select().from(extracoes)
    .where(eq(extracoes.loteId, 420001));
  
  const r330525 = rows.find(r => r.numeroContrato === '330525');
  if (!r330525) { console.log('Contrato 330525 não encontrado no lote 420001'); process.exit(0); }
  
  console.log('Estado atual do contrato 330525 no lote 420001:');
  console.log('  dp01:', JSON.stringify(r330525.dadoPlanilha01));
  console.log('  dp02:', JSON.stringify(r330525.dadoPlanilha02));
  console.log('  dp03:', JSON.stringify(r330525.dadoPlanilha03));
  console.log('  dp04:', JSON.stringify(r330525.dadoPlanilha04));
  console.log('  multa:', JSON.stringify(r330525.multa2pct));
  
  // Verificar se dp01 e dp02 são falsy
  console.log('\nVerificação falsy:');
  console.log('  !dp01:', !r330525.dadoPlanilha01);
  console.log('  !dp02:', !r330525.dadoPlanilha02);
  console.log('  dp01 === null:', r330525.dadoPlanilha01 === null);
  console.log('  dp01 === undefined:', r330525.dadoPlanilha01 === undefined);
  console.log('  dp01 === "":', r330525.dadoPlanilha01 === '');
  
  process.exit(0);
}
main().catch(e => { console.error(e); process.exit(1); });
