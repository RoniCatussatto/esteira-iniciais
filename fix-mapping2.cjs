const mysql = require('./node_modules/mysql2/promise');
mysql.createConnection(process.env.DATABASE_URL).then(async db => {
  const [rows] = await db.execute("SELECT configJson FROM docConfigs WHERE id = 330001");
  const cfg = JSON.parse(rows[0].configJson);
  
  // Mapeamento correto conforme confirmado pelo usuário:
  // dadoPlanilha01 = contrato (número do contrato principal)
  // dadoPlanilha02 = dataOperacao (Data da Operação, linha 32)
  // dadoPlanilha03 = dataVencimentoFinal (Data de Vencimento, linha 33)
  // dadoPlanilha04 = valorQuitacao (Saldo p/ Quitação, linha 43)
  cfg.mapeamentoCampos = {
    "dadoPlanilha01": "contrato",
    "dadoPlanilha02": "dataOperacao",
    "dadoPlanilha03": "dataVencimentoFinal",
    "dadoPlanilha04": "valorQuitacao",
    "multa2pct": {
      "condicional": {
        "campo": "multa2pctConteudo",
        "contemAlgum": ["2,00", "2.00"],
        "entao": "sim",
        "senao": "nao"
      }
    }
  };
  
  await db.execute(
    "UPDATE docConfigs SET configJson = ?, mapeamentoCampos = ? WHERE id = 330001",
    [JSON.stringify(cfg), JSON.stringify(cfg.mapeamentoCampos)]
  );
  console.log("✓ Mapeamento corrigido:");
  console.log("  dadoPlanilha01 → contrato (linha 36)");
  console.log("  dadoPlanilha02 → dataOperacao (linha 32)");
  console.log("  dadoPlanilha03 → dataVencimentoFinal (linha 33)");
  console.log("  dadoPlanilha04 → valorQuitacao (linha 43)");
  await db.end();
}).catch(console.error);
