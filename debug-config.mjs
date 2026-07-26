import mysql from 'mysql2/promise';

const conn = await mysql.createConnection(process.env.DATABASE_URL);
const [rows] = await conn.execute('SELECT id, nomeDocumento, configJson FROM docConfigs WHERE id = 270001');
await conn.end();

if (!rows.length) { console.log('Não encontrado'); process.exit(0); }
const row = rows[0];
console.log('ID:', row.id, '| Nome:', row.nomeDocumento);
const cfg = JSON.parse(row.configJson);
console.log('Configuração:\n', JSON.stringify(cfg, null, 2));
