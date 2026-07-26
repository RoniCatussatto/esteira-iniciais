import { getDb } from './server/db.ts';
import { documentos, docConfigs } from './drizzle/schema.ts';
import { eq, like } from 'drizzle-orm';

function normStr(s) {
  return s.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().trim();
}

async function main() {
  const db = await getDb();
  if (!db) { console.log('DB não disponível'); return; }
  
  // Buscar o EXTRATO DE CHEQUE ESPECIAL do lote 420001
  const docs = await db.select().from(documentos)
    .where(like(documentos.nomeArquivo, '%CHEQUE ESPECIAL%310131%'));
  
  const doc = docs.find(d => d.loteId === 420001 && d.textoExtraido);
  if (!doc) { console.log('Documento não encontrado'); process.exit(0); }
  
  const texto = typeof doc.textoExtraido === 'string' ? doc.textoExtraido :
    Buffer.isBuffer(doc.textoExtraido) ? doc.textoExtraido.toString('utf8') : String(doc.textoExtraido);
  
  const linhas = texto.split('\n').map(l => l.trim());
  
  // Simular a extração por linhaIndice
  const camposIntermedios = {};
  
  // dadoPlanilha02 = linha 12
  const val12 = linhas[12] ?? '';
  if (val12) {
    const chave = normStr('dadoPlanilha02').replace(/[_\s]/g, '');
    camposIntermedios[chave] = val12;
    console.log(`Campo intermediário "dadoPlanilha02" (linha 12) = "${val12}"`);
    console.log(`  chave normalizada: "${chave}"`);
  }
  
  // dadoPlanilha03 = linha 31
  const val31 = linhas[31] ?? '';
  if (val31) {
    const chave = normStr('dadoPlanilha03').replace(/[_\s]/g, '');
    camposIntermedios[chave] = val31;
    console.log(`Campo intermediário "dadoPlanilha03" (linha 31) = "${val31}"`);
  }
  
  // dadoPlanilha04 = linha 43
  const val43 = linhas[43] ?? '';
  if (val43) {
    const chave = normStr('dadoPlanilha04').replace(/[_\s]/g, '');
    camposIntermedios[chave] = val43;
    console.log(`Campo intermediário "dadoPlanilha04" (linha 43) = "${val43}"`);
  }
  
  console.log('\ncamposIntermedios:', camposIntermedios);
  
  // Simular o mapeamentoCampos
  const mapeamento = {
    "dadoPlanilha02": "dadoPlanilha02",
    "dadoPlanilha03": "dadoPlanilha03",
    "dadoPlanilha04": "dadoPlanilha04",
    "multa2pct": "nao"
  };
  
  console.log('\nMapeamento:');
  for (const [campoFinal, valorMapeamento] of Object.entries(mapeamento)) {
    const chaveRef = normStr(valorMapeamento).replace(/[_\s]/g, '');
    const valorResolvido = camposIntermedios[chaveRef] !== undefined ? camposIntermedios[chaveRef] : valorMapeamento;
    console.log(`  ${campoFinal} → ref="${valorMapeamento}" chaveRef="${chaveRef}" → "${valorResolvido}"`);
  }
  
  process.exit(0);
}
main().catch(e => { console.error(e); process.exit(1); });
