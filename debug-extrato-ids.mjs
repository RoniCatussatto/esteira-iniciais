import mysql from 'mysql2/promise';
const conn = await mysql.createConnection(process.env.DATABASE_URL);
const [rows] = await conn.execute(
  "SELECT id, nomeArquivo, CHAR_LENGTH(textoExtraido) as len FROM documentos WHERE nomeArquivo LIKE '%EXTRATO%' AND textoExtraido IS NOT NULL AND CHAR_LENGTH(textoExtraido) > 5 ORDER BY len DESC LIMIT 5"
);
await conn.end();
console.log(JSON.stringify(rows, null, 2));
