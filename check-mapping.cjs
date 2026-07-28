const mysql = require('./node_modules/mysql2/promise');
mysql.createConnection(process.env.DATABASE_URL).then(async db => {
  const [rows] = await db.execute("SELECT configJson FROM docConfigs WHERE id = 330001");
  const cfg = JSON.parse(rows[0].configJson);
  console.log("mapeamentoCampos:", JSON.stringify(cfg.mapeamentoCampos, null, 2));
  console.log("\ncamposExtracao:");
  cfg.camposExtracao.forEach(c => console.log(`  campo="${c.campo}" linhaIndice=${c.linhaIndice} linhaEspecial=${c.linhaEspecial} transformacao="${c.transformacao}"`));
  await db.end();
}).catch(console.error);
