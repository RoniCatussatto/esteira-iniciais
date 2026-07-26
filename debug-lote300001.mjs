import mysql from 'mysql2/promise';
const conn = await mysql.createConnection(process.env.DATABASE_URL);
const [rows] = await conn.execute(
  "SELECT id, loteId, nomeArquivo, CHAR_LENGTH(textoExtraido) as len FROM documentos WHERE loteId = 300001 AND nomeArquivo LIKE '%EXTRATO%' ORDER BY id LIMIT 10"
);
await conn.end();
console.log('Documentos EXTRATO do lote 300001:', rows.length);
rows.forEach(r => console.log(`  id=${r.id} len=${r.len} nome=${r.nomeArquivo}`));
