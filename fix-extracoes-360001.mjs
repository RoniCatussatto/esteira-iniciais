import mysql from 'mysql2/promise';
const conn = await mysql.createConnection(process.env.DATABASE_URL);

// Verificar extrações do lote 360001
const [extRows] = await conn.execute(
  "SELECT id, devedorId, numeroContrato, dadoPlanilha01, dadoPlanilha02, dadoPlanilha03, dadoPlanilha04 FROM extracoes WHERE loteId = 360001"
);
console.log('Extrações do lote 360001:');
extRows.forEach(r => console.log(`  id=${r.id} contrato=${r.numeroContrato} dp01="${r.dadoPlanilha01}" dp02="${r.dadoPlanilha02}" dp03="${r.dadoPlanilha03}" dp04="${r.dadoPlanilha04}"`));

// Limpar extrações onde dp01 não é conta cartão (começa com 75644) nem nulo
// Esses foram preenchidos pelo Extrato antes da Fatura
const [toFix] = await conn.execute(
  "SELECT id, numeroContrato FROM extracoes WHERE loteId = 360001 AND dadoPlanilha01 IS NOT NULL AND dadoPlanilha01 NOT LIKE '75644%'"
);
console.log('\nExtrações a corrigir:', toFix.length);

if (toFix.length > 0) {
  for (const r of toFix) {
    await conn.execute(
      "UPDATE extracoes SET dadoPlanilha01 = NULL, dadoPlanilha02 = NULL, dadoPlanilha03 = NULL, dadoPlanilha04 = NULL, multa2pct = 'branco' WHERE id = ?",
      [r.id]
    );
    console.log(`  Limpou id=${r.id} contrato=${r.numeroContrato}`);
  }
}

await conn.end();
console.log('Pronto!');
