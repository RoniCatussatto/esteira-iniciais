import mysql from 'mysql2/promise';
const conn = await mysql.createConnection(process.env.DATABASE_URL);

// Contratos que TÊM Fatura - processar Fatura primeiro, depois Extrato
const contratosComFatura = ['2323394', '4025787', '5451312', '6565472', '330525', '6655480'];

for (const contrato of contratosComFatura) {
  const [[ext]] = await conn.execute(
    "SELECT id FROM extracoes WHERE loteId = 360001 AND numeroContrato = ?",
    [contrato]
  );
  if (!ext) { console.log(`Extração não encontrada para ${contrato}`); continue; }
  
  // 1. Processar FATURA primeiro
  const [[fatura]] = await conn.execute(
    "SELECT nomeArquivo, textoExtraido FROM documentos WHERE loteId = 360001 AND nomeArquivo LIKE ? AND textoExtraido IS NOT NULL LIMIT 1",
    [`%FATURA%${contrato}%`]
  );
  
  let dp01 = null, dp02 = null, multa = 'nao';
  if (fatura) {
    const raw = fatura.textoExtraido;
    const texto = Buffer.isBuffer(raw) ? raw.toString('utf8') : String(raw ?? '');
    // regex conta cartão: 75644\d{8}
    const matchConta = texto.match(/(75644\d{8})/);
    // regex contrato do nome: -\s*(\d+)
    const matchContrato = fatura.nomeArquivo.match(/-\s*(\d+)/);
    dp01 = matchConta ? matchConta[1] : null;
    dp02 = matchContrato ? matchContrato[1] : null;
    console.log(`  Fatura ${contrato}: dp01=${dp01} dp02=${dp02}`);
  } else {
    console.log(`  Sem Fatura para ${contrato}`);
  }
  
  // 2. Processar EXTRATO para dp03 e dp04
  const [[doc]] = await conn.execute(
    "SELECT textoExtraido FROM documentos WHERE loteId = 360001 AND nomeArquivo LIKE ? AND textoExtraido IS NOT NULL LIMIT 1",
    [`%EXTRATO%${contrato}%`]
  );
  
  let dp03 = null, dp04 = null;
  if (doc) {
    const raw = doc.textoExtraido;
    const texto = Buffer.isBuffer(raw) ? raw.toString('utf8') : String(raw ?? '');
    const linhas = texto.split('\n').map(l => l.trim());
    dp03 = linhas[33] ?? null; // dataVencto
    const val43 = linhas[43] ?? '';
    const match43 = val43.match(/^([\d.,]+)/);
    const saldoRaw = match43 ? match43[1] : (linhas[29] ?? '');
    dp04 = saldoRaw.replace(/\.(?=\d{3}[,])/g, '') || null;
    console.log(`  Extrato ${contrato}: dp03=${dp03} dp04=${dp04}`);
  }
  
  // 3. Gravar no banco
  await conn.execute(
    "UPDATE extracoes SET dadoPlanilha01 = ?, dadoPlanilha02 = ?, dadoPlanilha03 = ?, dadoPlanilha04 = ?, multa2pct = ? WHERE id = ?",
    [dp01, dp02, dp03, dp04, multa, ext.id]
  );
  console.log(`  Gravou ${contrato}: dp01=${dp01} dp02=${dp02} dp03=${dp03} dp04=${dp04} multa=${multa}\n`);
}

await conn.end();
console.log('Pronto!');
