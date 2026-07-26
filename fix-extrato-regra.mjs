import mysql from 'mysql2/promise';
const conn = await mysql.createConnection(process.env.DATABASE_URL);

const [[r]] = await conn.execute('SELECT configJson FROM docConfigs WHERE id = 270001');
const cfg = JSON.parse(r.configJson);

// Adicionar palavras de exclusão
cfg.regrasIdentificacao.palavrasExclusaoNomeArquivo = ["CHEQUE ESPECIAL"];
cfg.regrasIdentificacao.descricao = "Identificado quando o nome contém 'EXTRATO' mas NÃO contém 'CHEQUE ESPECIAL'";

await conn.execute('UPDATE docConfigs SET configJson = ? WHERE id = 270001', [JSON.stringify(cfg)]);
await conn.end();
console.log('Regra do Extrato Sisbr atualizada:', cfg.regrasIdentificacao);
