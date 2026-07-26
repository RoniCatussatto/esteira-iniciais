import mysql from 'mysql2/promise';
const conn = await mysql.createConnection(process.env.DATABASE_URL);

// Buscar todos os documentos FATURA do lote 360001
const [faturas] = await conn.execute(
  "SELECT d.id, d.devedorId, d.nomeArquivo FROM documentos d JOIN devedores dev ON d.devedorId = dev.id WHERE d.loteId = 360001 AND d.nomeArquivo LIKE '%FATURA%'"
);
console.log('Faturas no lote 360001:');
faturas.forEach(r => console.log(`  devedorId=${r.devedorId} nome=${r.nomeArquivo}`));

// Buscar contratos dos devedores com Fatura
const devedorIds = [...new Set(faturas.map(r => r.devedorId))];
if (devedorIds.length > 0) {
  const [devs] = await conn.execute(
    `SELECT id, contratos FROM devedores WHERE id IN (${devedorIds.join(',')})`
  );
  console.log('\nDevedores com Fatura e seus contratos:');
  devs.forEach(r => console.log(`  devedorId=${r.id} contratos="${r.contratos}"`));
}

await conn.end();
