import mysql from 'mysql2/promise';
const conn = await mysql.createConnection(process.env.DATABASE_URL);

// Config do Cheque Especial
const [[cheque]] = await conn.execute("SELECT id, nomeDocumento, configJson FROM docConfigs WHERE nomeDocumento LIKE '%Cheque%' LIMIT 1");
if (cheque) {
  console.log('=== Cheque Especial (id=' + cheque.id + ') ===');
  const cfg = JSON.parse(cheque.configJson);
  console.log('camposExtracao:', JSON.stringify(cfg.camposExtracao, null, 2));
  console.log('mapeamentoCampos:', JSON.stringify(cfg.mapeamentoCampos, null, 2));
}

// Fatura 5451312 - verificar o texto
const [[doc]] = await conn.execute(
  "SELECT nomeArquivo, textoExtraido FROM documentos WHERE loteId = 360001 AND nomeArquivo LIKE '%FATURA%5451312%' LIMIT 1"
);
if (doc) {
  const raw = doc.textoExtraido;
  const texto = Buffer.isBuffer(raw) ? raw.toString('utf8') : String(raw ?? '');
  console.log('\n=== Fatura 5451312 ===');
  console.log('Texto (primeiras 300 chars):', texto.substring(0, 300));
  const match = texto.match(/(75644\d{8})/);
  console.log('Regex 75644...: ', match ? match[1] : 'NÃO ENCONTRADO');
  // Tentar encontrar qualquer número de 13 dígitos
  const match13 = texto.match(/(\d{13})/);
  console.log('Qualquer 13 dígitos: ', match13 ? match13[1] : 'NÃO ENCONTRADO');
}

await conn.end();
