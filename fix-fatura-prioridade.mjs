import mysql from 'mysql2/promise';

const conn = await mysql.createConnection(process.env.DATABASE_URL);

// Buscar a configuração da Fatura
const [rows] = await conn.execute(
  "SELECT id, nomeDocumento, configJson FROM docConfigs WHERE nomeDocumento = 'Fatura' LIMIT 5"
);
console.log('Faturas encontradas:', rows.length);

for (const row of rows) {
  const cfg = row.configJson ? JSON.parse(row.configJson) : {};
  cfg.prioridade = 0; // Alta prioridade: sempre sobrescreve dp01/dp02
  await conn.execute(
    "UPDATE docConfigs SET configJson = ? WHERE id = ?",
    [JSON.stringify(cfg), row.id]
  );
  console.log(`Fatura id=${row.id} atualizada com prioridade=0`);
}

await conn.end();
process.exit(0);
