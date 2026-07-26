import mysql from 'mysql2/promise';
const conn = await mysql.createConnection(process.env.DATABASE_URL);
const [rows] = await conn.execute(
  "SELECT id, nomeArquivo, textoExtraido FROM documentos WHERE id = 330049 LIMIT 1"
);
await conn.end();
const row = rows[0];
const raw = row.textoExtraido;
const texto = Buffer.isBuffer(raw) ? raw.toString('utf8') : String(raw ?? '');
const linhas = texto.split('\n').map(l => l.trim());
console.log('Nome:', row.nomeArquivo, '| Total de linhas:', linhas.length);
linhas.forEach((l, i) => { if (i <= 45) console.log(`[${i}] ${l}`); });
