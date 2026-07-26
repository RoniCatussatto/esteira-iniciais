import mysql from 'mysql2/promise';
const conn = await mysql.createConnection(process.env.DATABASE_URL);
// Buscar extrações do contrato 330525
const [extRows] = await conn.execute(
  "SELECT id, devedorId, loteId, numeroContrato, dadoPlanilha01, dadoPlanilha02, dadoPlanilha03, dadoPlanilha04, multa2pct FROM extracoes WHERE numeroContrato = '330525' ORDER BY id DESC LIMIT 5"
);
console.log('Extrações do contrato 330525:');
extRows.forEach(r => console.log(JSON.stringify(r)));
await conn.end();
