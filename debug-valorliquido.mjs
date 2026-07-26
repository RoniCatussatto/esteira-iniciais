import mysql from 'mysql2/promise';
const conn = await mysql.createConnection(process.env.DATABASE_URL);
const [rows] = await conn.execute(
  "SELECT id, nomeArquivo, textoExtraido FROM documentos WHERE loteId = 300001 AND nomeArquivo LIKE '%EXTRATO%' AND textoExtraido IS NOT NULL AND CHAR_LENGTH(textoExtraido) > 100 ORDER BY id"
);
await conn.end();
for (const row of rows) {
  const raw = row.textoExtraido;
  const texto = Buffer.isBuffer(raw) ? raw.toString('utf8') : String(raw ?? '');
  const linhas = texto.split('\n').map(l => l.trim());
  const l29 = linhas[29] ?? '';
  const l43 = linhas[43] ?? '';
  // Verificar se linha 43 tem número no início (padrão: "8.503,49\tTaxa Juros...")
  const l43num = l43.match(/^([\d.,]+)/);
  const saldo = l43num ? l43num[1] : l29;
  console.log(`${row.nomeArquivo}: L29="${l29}" L43="${l43.substring(0,30)}" => saldo="${saldo}"`);
}
