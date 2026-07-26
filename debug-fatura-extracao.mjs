import mysql from 'mysql2/promise';
const conn = await mysql.createConnection(process.env.DATABASE_URL);
// Buscar um documento FATURA com texto extraído
const [rows] = await conn.execute(
  "SELECT id, nomeArquivo, textoExtraido FROM documentos WHERE loteId = 300001 AND nomeArquivo LIKE '%FATURA%' AND textoExtraido IS NOT NULL AND CHAR_LENGTH(textoExtraido) > 50 LIMIT 3"
);
await conn.end();
for (const row of rows) {
  const raw = row.textoExtraido;
  const texto = Buffer.isBuffer(raw) ? raw.toString('utf8') : String(raw ?? '');
  // Testar as regex da Fatura
  const matchConta = texto.match(/(75644\d{8})/);
  const matchContrato = row.nomeArquivo.match(/-\s*(\d+)/);
  console.log(`${row.nomeArquivo}:`);
  console.log(`  dadoPlanilha01 (regex 75644...): ${matchConta ? matchConta[1] : 'NÃO ENCONTRADO'}`);
  console.log(`  dadoPlanilha02 (regex -\\d+ no nome): ${matchContrato ? matchContrato[1] : 'NÃO ENCONTRADO'}`);
}
