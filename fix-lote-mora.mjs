import mysql from 'mysql2/promise';
const conn = await mysql.createConnection(process.env.DATABASE_URL);
const [lotes] = await conn.execute("SELECT id, nome FROM lotes ORDER BY id DESC LIMIT 1");
const loteId = lotes[0].id;
console.log('Lote atual:', loteId, lotes[0].nome);
const [del] = await conn.execute("DELETE FROM extracoes WHERE loteId = ?", [loteId]);
console.log('Extrações deletadas:', del.affectedRows);
await conn.end();
process.exit(0);
