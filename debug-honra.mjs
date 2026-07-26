import mysql from 'mysql2/promise';
const conn = await mysql.createConnection(process.env.DATABASE_URL);
const [rows] = await conn.execute(
  "SELECT id, nomeArquivo FROM documentos WHERE nomeArquivo LIKE '%EXTRATO%' AND textoExtraido LIKE '%HONRA%' LIMIT 3"
);
await conn.end();
console.log('Documentos HONRA:', JSON.stringify(rows));
