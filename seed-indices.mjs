import mysql from 'mysql2/promise';
import { readFileSync } from 'fs';

const conn = await mysql.createConnection(process.env.DATABASE_URL);
const indices = JSON.parse(readFileSync('/home/ubuntu/upload/indices.json', 'utf8'));

let inseridos = 0;
for (const item of indices) {
  // Converter "jan/2020" → "2020-01"
  const mesAno = item.data_formatada.substring(0, 7); // "2020-01-15" → "2020-01"
  await conn.execute(
    "INSERT INTO indicesCorrecao (mesAno, dataTexto, ipca, selic) VALUES (?, ?, ?, ?) ON DUPLICATE KEY UPDATE ipca=VALUES(ipca), selic=VALUES(selic)",
    [mesAno, item.data_texto, item.ipca, item.selic]
  );
  inseridos++;
}

console.log(`${inseridos} índices inseridos/atualizados.`);

// Verificar
const [rows] = await conn.execute("SELECT COUNT(*) as total, MIN(mesAno) as primeiro, MAX(mesAno) as ultimo FROM indicesCorrecao");
console.log('Total no banco:', rows[0].total, '| De:', rows[0].primeiro, 'até:', rows[0].ultimo);

await conn.end();
process.exit(0);
