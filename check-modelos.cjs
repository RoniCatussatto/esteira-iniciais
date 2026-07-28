const mysql = require('mysql2/promise');
const modelos = ["CAC E CARTAO","CAC","EXEC CCB","CCB E CARTAO","CAC E CCB","CCB E CE","COB CCB","CAC CCB CE","CAC E CE"];
mysql.createConnection(process.env.DATABASE_URL).then(async db => {
  const placeholders = modelos.map(() => '?').join(',');
  const [existentes] = await db.execute(`SELECT nome FROM modelosIniciais WHERE nome IN (${placeholders})`, modelos);
  const nomesExistentes = existentes.map(m => m.nome);
  console.log("Modelos existentes:", nomesExistentes);
  const faltando = modelos.filter(m => !nomesExistentes.includes(m));
  console.log("Modelos FALTANDO:", faltando);
  await db.end();
}).catch(console.error);
