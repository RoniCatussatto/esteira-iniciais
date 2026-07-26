import mysql from 'mysql2/promise';
const conn = await mysql.createConnection(process.env.DATABASE_URL);
const [rows] = await conn.execute(
  "SELECT id, loteId, nomeArquivo, CHAR_LENGTH(textoExtraido) as len FROM documentos WHERE nomeArquivo LIKE '%EXTRATO%' AND (textoExtraido IS NULL OR CHAR_LENGTH(textoExtraido) <= 5) ORDER BY loteId, id LIMIT 20"
);
await conn.end();
console.log('Documentos EXTRATO sem texto:', rows.length);
rows.forEach(r => console.log(`  id=${r.id} lote=${r.loteId} len=${r.len} nome=${r.nomeArquivo}`));
