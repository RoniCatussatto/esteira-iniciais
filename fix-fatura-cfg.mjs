import mysql from 'mysql2/promise';
const conn = await mysql.createConnection(process.env.DATABASE_URL);

const novoConfig = {
  "regrasIdentificacao": {
    "palavrasChaveNomeArquivo": ["FATURA"],
    "palavrasChaveConteudo": [],
    "descricao": "Identificado quando o nome do arquivo contém 'FATURA'"
  },
  "camposExtracao": [
    {
      "campo": "dadoPlanilha01",
      "descricao": "Número da conta cartão (13 dígitos começando com 75644)",
      "localizacao": "Corpo do documento - cabeçalho",
      "regex": "(75644\\d{8})",
      "transformacao": ""
    },
    {
      "campo": "dadoPlanilha02",
      "descricao": "Número do contrato extraído do nome do arquivo (após o hífen)",
      "localizacao": "Nome do arquivo — após o hífen",
      "regex": "-\\s*(\\d+)",
      "transformacao": ""
    }
  ],
  "mapeamentoCampos": {
    "dadoPlanilha01": "dadoPlanilha01",
    "dadoPlanilha02": "dadoPlanilha02",
    "multa2pct": "nao"
  }
};

await conn.execute(
  'UPDATE docConfigs SET configJson = ? WHERE id = 210001',
  [JSON.stringify(novoConfig)]
);
await conn.end();
console.log('Configuração da Fatura atualizada com sucesso!');
