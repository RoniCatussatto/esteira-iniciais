import mysql from 'mysql2/promise';
const conn = await mysql.createConnection(process.env.DATABASE_URL);

const [[r]] = await conn.execute('SELECT configJson FROM docConfigs WHERE id = 300001');
const cfg = JSON.parse(r.configJson);

// Corrigir mapeamentoCampos: usar nomes dos campos intermediários (normalizados)
// campos intermediários: dadoPlanilha02, dadoPlanilha04, dadoPlanilha03
cfg.mapeamentoCampos = {
  "dadoPlanilha02": "dadoPlanilha02",
  "dadoPlanilha03": "dadoPlanilha03",
  "dadoPlanilha04": "dadoPlanilha04",
  "multa2pct": "nao"
};

await conn.execute('UPDATE docConfigs SET configJson = ? WHERE id = 300001', [JSON.stringify(cfg)]);
await conn.end();
console.log('Cheque Especial mapeamentoCampos corrigido:', cfg.mapeamentoCampos);
