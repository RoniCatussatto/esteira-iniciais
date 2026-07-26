import mysql from 'mysql2/promise';
const conn = await mysql.createConnection(process.env.DATABASE_URL);

const [rows] = await conn.execute("SELECT id, configJson FROM docConfigs WHERE nomeDocumento = 'Extrato Sisbr' LIMIT 1");
const row = rows[0];
const cfg = JSON.parse(row.configJson);

// Adicionar moraEspecifica condicional: quando modalidade contém CARTÃO, CARTÕES ou AVAIS
// preencher com dataVencimentoFinal (dp03); caso contrário, não preencher (null)
cfg.mapeamentoCampos.moraEspecifica = {
  condicional: {
    campo: "modalidade",
    contemAlgum: ["CARTAO", "CARTOES", "AVAIS"],
    entao: "dataVencimentoFinal",
    senao: null
  }
};

await conn.execute("UPDATE docConfigs SET configJson = ? WHERE id = ?", [JSON.stringify(cfg), row.id]);
console.log('Extrato Sisbr atualizado com moraEspecifica condicional para cartão/avais');
console.log('Novo mapeamentoCampos:', JSON.stringify(cfg.mapeamentoCampos, null, 2));

await conn.end();
process.exit(0);
