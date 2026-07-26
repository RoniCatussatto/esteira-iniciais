import mysql from 'mysql2/promise';
const conn = await mysql.createConnection(process.env.DATABASE_URL);
// Verificar vários EXTRATOs do lote 300001
const [rows] = await conn.execute(
  "SELECT id, nomeArquivo, textoExtraido FROM documentos WHERE loteId = 300001 AND nomeArquivo LIKE '%EXTRATO%' AND textoExtraido IS NOT NULL AND CHAR_LENGTH(textoExtraido) > 100 LIMIT 8"
);
await conn.end();
for (const row of rows) {
  const raw = row.textoExtraido;
  const texto = Buffer.isBuffer(raw) ? raw.toString('utf8') : String(raw ?? '');
  const linhas = texto.split('\n').map(l => l.trim());
  const l29 = linhas[29] ?? '';
  const l43 = linhas[43] ?? '';
  const l14 = linhas[14] ?? '';  // header "Saldo p/ Quitação:"
  console.log(`${row.nomeArquivo}: L14="${l14}" L29="${l29}" L43="${l43}"`);
}
