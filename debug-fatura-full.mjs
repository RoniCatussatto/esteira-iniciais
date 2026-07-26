import mysql from 'mysql2/promise';
const conn = await mysql.createConnection(process.env.DATABASE_URL);
const [[r]] = await conn.execute('SELECT id, nomeDocumento, configJson FROM docConfigs WHERE id = 210001');
await conn.end();
console.log(`ID: ${r.id} | Nome: ${r.nomeDocumento}`);
const cfg = JSON.parse(r.configJson);
console.log(JSON.stringify(cfg, null, 2));
