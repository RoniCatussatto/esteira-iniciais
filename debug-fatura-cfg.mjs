import mysql from 'mysql2/promise';
const conn = await mysql.createConnection(process.env.DATABASE_URL);
const [rows] = await conn.execute('SELECT id, nomeDocumento, configJson FROM docConfigs WHERE nomeDocumento LIKE "%Fatura%" OR nomeDocumento LIKE "%fatura%" LIMIT 3');
await conn.end();
for (const r of rows) {
  console.log(`ID: ${r.id} | Nome: ${r.nomeDocumento}`);
  const cfg = JSON.parse(r.configJson);
  console.log('mapeamentoCampos:', JSON.stringify(cfg.mapeamentoCampos, null, 2));
  console.log('');
}
