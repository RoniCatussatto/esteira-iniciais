import { getDb } from './server/db.ts';
import { extracoes, documentos, devedores, docConfigs } from './drizzle/schema.ts';
import { eq, and, like } from 'drizzle-orm';

function normStr(s) {
  return s.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().trim();
}

async function main() {
  const db = await getDb();
  if (!db) { console.log('DB não disponível'); return; }
  
  const LOTE_ID = 420001;
  
  // Deletar todas as extrações do lote 420001 para recomeçar do zero
  const deleted = await db.delete(extracoes).where(eq(extracoes.loteId, LOTE_ID));
  console.log('Extrações deletadas do lote 420001');
  
  // Verificar que foram deletadas
  const check = await db.select().from(extracoes).where(eq(extracoes.loteId, LOTE_ID));
  console.log('Extrações restantes:', check.length);
  
  process.exit(0);
}
main().catch(e => { console.error(e); process.exit(1); });
