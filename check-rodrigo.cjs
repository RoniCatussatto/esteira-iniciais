const mysql = require('./node_modules/mysql2/promise');
mysql.createConnection(process.env.DATABASE_URL).then(async db => {
  const [rows] = await db.execute(
    "SELECT id, nome, cooperativa FROM devedores WHERE nome LIKE '%RODRIGO%ZULLO%' LIMIT 3"
  );
  console.log("Devedores:", rows);
  await db.end();
}).catch(console.error);
