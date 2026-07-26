import mysql from 'mysql2/promise';
const conn = await mysql.createConnection(process.env.DATABASE_URL);
const [rows] = await conn.execute("SELECT id, nomeDocumento, configJson FROM docConfigs WHERE nomeDocumento IN ('Extrato Sisbr', 'Fatura') ORDER BY nomeDocumento");
for (const row of rows) {
  console.log(`\n=== ${row.nomeDocumento} (id=${row.id}) ===`);
  if (row.configJson) {
    const cfg = JSON.parse(row.configJson);
    console.log('mapeamentoCampos:', JSON.stringify(cfg.mapeamentoCampos, null, 2));
  }
}
await conn.end();
process.exit(0);
