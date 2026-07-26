import mysql from 'mysql2/promise';

const url = process.env.DATABASE_URL;
const conn = await mysql.createConnection(url);
const [rows] = await conn.execute(
  "SELECT id, nomeArquivo, fileKey, fileUrl, CHAR_LENGTH(textoExtraido) as textoLen FROM documentos WHERE id = 49"
);
await conn.end();

if (!rows.length) { console.log('Não encontrado'); process.exit(0); }
const row = rows[0];
console.log('ID:', row.id, '| Nome:', row.nomeArquivo, '| textoLen:', row.textoLen);
console.log('fileKey:', row.fileKey);
console.log('fileUrl:', row.fileUrl);
