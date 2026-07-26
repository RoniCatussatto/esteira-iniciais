import mysql from 'mysql2/promise';

const url = process.env.DATABASE_URL;
const conn = await mysql.createConnection(url);
const [rows] = await conn.execute(
  "SELECT id, nomeArquivo, textoExtraido FROM documentos WHERE nomeArquivo LIKE '%1540401%' AND nomeArquivo LIKE '%EXTRATO%' LIMIT 1"
// Buscar o EXTRATO 330525 (tem texto extraído)
);
await conn.end();

if (!rows.length) { console.log('Não encontrado'); process.exit(0); }
const row = rows[0];
console.log('ID:', row.id, '| Nome:', row.nomeArquivo);
const raw = row.textoExtraido;
const texto = Buffer.isBuffer(raw) ? raw.toString('utf8') : String(raw ?? '');
const linhas = texto.split('\n').map(l => l.trim());
console.log(`Total de linhas: ${linhas.length}`);
linhas.forEach((l, i) => { if (i <= 70) console.log(`[${i}] ${l}`); });
