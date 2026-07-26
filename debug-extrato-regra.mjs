import mysql from 'mysql2/promise';
const conn = await mysql.createConnection(process.env.DATABASE_URL);
const [[r]] = await conn.execute('SELECT configJson FROM docConfigs WHERE id = 270001');
await conn.end();
const cfg = JSON.parse(r.configJson);
console.log('regrasIdentificacao:', JSON.stringify(cfg.regrasIdentificacao, null, 2));
