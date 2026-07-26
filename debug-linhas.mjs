import mysql from 'mysql2/promise';
const conn = await mysql.createConnection(process.env.DATABASE_URL);
const [rows] = await conn.execute(
  "SELECT id, nomeArquivo, textoExtraido FROM documentos WHERE id = 330039 LIMIT 1"
);
await conn.end();
if (!rows.length) { console.log('Não encontrado'); process.exit(0); }
const row = rows[0];
console.log('ID:', row.id, '| Nome:', row.nomeArquivo);
const raw = row.textoExtraido;
const texto = Buffer.isBuffer(raw) ? raw.toString('utf8') : String(raw ?? '');
const linhas = texto.split('\n').map(l => l.trim());
console.log('Total de linhas:', linhas.length);
linhas.forEach((l, i) => { if (i <= 55) console.log(`[${i}] ${l}`); });
