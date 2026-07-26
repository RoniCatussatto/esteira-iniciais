import { getDb } from './server/db.ts';
import { documentos } from './drizzle/schema.ts';
import { eq } from 'drizzle-orm';

async function main() {
  const db = await getDb();
  if (!db) { console.log('DB não disponível'); return; }
  
  // Buscar todos os documentos do devedor que tem o contrato 6565472 no lote 420001
  const docs = await db.select({ id: documentos.id, nomeArquivo: documentos.nomeArquivo, devedorId: documentos.devedorId, loteId: documentos.loteId })
    .from(documentos)
    .where(eq(documentos.loteId, 420001));
  
  // Encontrar o devedor que tem 6565472
  const fatura6565472 = docs.find(d => d.nomeArquivo.includes('6565472'));
  if (!fatura6565472) { console.log('Não encontrado'); process.exit(0); }
  
  console.log('Devedor ID:', fatura6565472.devedorId);
  
  // Listar todos os documentos desse devedor
  const docsDevedor = docs.filter(d => d.devedorId === fatura6565472.devedorId);
  console.log('Documentos do devedor:');
  for (const d of docsDevedor) {
    console.log(`  ${d.nomeArquivo}`);
  }
  
  process.exit(0);
}
main().catch(e => { console.error(e); process.exit(1); });
