const mysql = require('./node_modules/mysql2/promise');
mysql.createConnection(process.env.DATABASE_URL).then(async db => {
  const [rows] = await db.execute("SELECT configJson FROM docConfigs WHERE id = 330001");
  const cfg = JSON.parse(rows[0].configJson);
  
  // Corrigir o mapeamento:
  // dadoPlanilha01 = contrato (número do contrato principal) ✓
  // dadoPlanilha02 = dataVencimentoFinal (Data de Vencimento) ← era contratoAntigo
  // dadoPlanilha03 = contratoAntigo (Contrato Antigo, se houver) ← era dataVencimentoFinal
  // dadoPlanilha04 = valorQuitacao (Saldo p/ Quitação) ← era valorOperacao
  cfg.mapeamentoCampos = {
    "dadoPlanilha01": "contrato",
    "dadoPlanilha02": "dataVencimentoFinal",
    "dadoPlanilha03": "contratoAntigo",
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
  console.log("  dadoPlanilha01 → contrato (número do contrato)");
  console.log("  dadoPlanilha02 → dataVencimentoFinal (Data de Vencimento)");
  console.log("  dadoPlanilha03 → contratoAntigo (Contrato Antigo)");
  console.log("  dadoPlanilha04 → valorQuitacao (Saldo p/ Quitação)");
  await db.end();
}).catch(console.error);
