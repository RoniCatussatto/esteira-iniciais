import mysql from 'mysql2/promise';
const conn = await mysql.createConnection(process.env.DATABASE_URL);

// Contratos que TÊM Fatura (não devem ter dados do Extrato em dp01/dp02)
const contratosComFatura = ['2323394', '4025787', '5451312', '6565472', '330525', '6655480'];

// Contratos que NÃO têm Fatura (devem ter dados do Extrato em dp01-dp04)
// Esses foram limpos incorretamente - precisamos restaurar
const contratosSemFatura = ['1044799', '1427588', '1450736', '1494530', '1540401', '1430408', '1057429', '1430616', '1512619', '1382249'];

// Para cada contrato sem Fatura, buscar o texto do documento EXTRATO e re-extrair
for (const contrato of contratosSemFatura) {
  const [[ext]] = await conn.execute(
    "SELECT e.id FROM extracoes e WHERE e.loteId = 360001 AND e.numeroContrato = ?",
    [contrato]
  );
  if (!ext) { console.log(`Extração não encontrada para ${contrato}`); continue; }
  
  // Buscar texto do EXTRATO correspondente
  const [[doc]] = await conn.execute(
    "SELECT textoExtraido FROM documentos WHERE loteId = 360001 AND nomeArquivo LIKE ? AND textoExtraido IS NOT NULL LIMIT 1",
    [`%EXTRATO%${contrato}%`]
  );
  if (!doc) { console.log(`Documento EXTRATO não encontrado para ${contrato}`); continue; }
  
  const raw = doc.textoExtraido;
  const texto = Buffer.isBuffer(raw) ? raw.toString('utf8') : String(raw ?? '');
  const linhas = texto.split('\n').map(l => l.trim());
  
  const dataOperacao = linhas[32] ?? '';
  const dataVencto = linhas[33] ?? '';
  const val43 = linhas[43] ?? '';
  const match43 = val43.match(/^([\d.,]+)/);
  const saldoRaw = match43 ? match43[1] : (linhas[29] ?? '');
  const saldo = saldoRaw.replace(/\.(?=\d{3}[,])/g, '');
  const modalidade = linhas[26] ?? '';
  const multa = modalidade.includes('HONRA') ? 'nao' : 'sim';
  
  await conn.execute(
    "UPDATE extracoes SET dadoPlanilha01 = ?, dadoPlanilha02 = ?, dadoPlanilha03 = ?, dadoPlanilha04 = ?, multa2pct = ? WHERE id = ?",
    [contrato, dataOperacao, dataVencto, saldo, multa, ext.id]
  );
  console.log(`Restaurou ${contrato}: dp01=${contrato} dp02=${dataOperacao} dp03=${dataVencto} dp04=${saldo} multa=${multa}`);
}

await conn.end();
console.log('Pronto!');
