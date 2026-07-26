import mysql from 'mysql2/promise';
const conn = await mysql.createConnection(process.env.DATABASE_URL);
const [rows] = await conn.execute(
  "SELECT id, nomeArquivo, textoExtraido FROM documentos WHERE id = 390041 LIMIT 1"
);
await conn.end();
const row = rows[0];
const raw = row.textoExtraido;
const texto = Buffer.isBuffer(raw) ? raw.toString('utf8') : String(raw ?? '');
const linhas = texto.split('\n').map(l => l.trim());
console.log('Total de linhas:', linhas.length);
// Mostrar linhas 25-50
linhas.forEach((l, i) => { if (i >= 25 && i <= 55) console.log(`[${i}] ${l}`); });
