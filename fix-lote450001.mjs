import mysql from 'mysql2/promise';

const conn = await mysql.createConnection(process.env.DATABASE_URL);

// Verificar o lote mais recente
const [lotes] = await conn.execute("SELECT id, nome FROM lotes ORDER BY id DESC LIMIT 3");
console.log('Lotes recentes:', lotes.map(l => `${l.id}: ${l.nome}`).join(', '));

// Deletar extrações do lote mais recente (450001)
const loteId = lotes[0].id;
const [del] = await conn.execute("DELETE FROM extracoes WHERE loteId = ?", [loteId]);
console.log(`Extrações deletadas do lote ${loteId}:`, del.affectedRows);

await conn.end();
process.exit(0);
