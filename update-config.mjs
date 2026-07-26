import mysql from 'mysql2/promise';
const conn = await mysql.createConnection(process.env.DATABASE_URL);

const novoConfig = {
  "regrasIdentificacao": {
    "palavrasChaveNomeArquivo": ["EXTRATO"],
    "palavrasChaveConteudo": []
  },
  "camposExtracao": [
    {
      "campo": "modalidade",
      "descricao": "Modalidade do contrato",
      "localizacao": "linha 26 do texto do PDF",
      "linhaIndice": 26
    },
    {
      "campo": "contrato",
      "descricao": "Número do contrato",
      "localizacao": "linha 36 do texto do PDF",
      "linhaIndice": 36
    },
    {
      "campo": "dataOperacao",
      "descricao": "Data de Operação",
      "localizacao": "linha 32 do texto do PDF",
      "linhaIndice": 32
    },
    {
      "campo": "dataVencimentoFinal",
      "descricao": "Data de Vencimento Final",
      "localizacao": "linha 33 do texto do PDF",
      "linhaIndice": 33
    },
    {
      "campo": "valorQuitacao",
      "descricao": "Saldo para Quitação",
      "localizacao": "linha 29 do texto do PDF",
      "linhaIndice": 29,
      "transformacao": "removerPontoMilhar"
    }
  ],
  "mapeamentoCampos": {
    "dadoPlanilha01": "contrato",
    "dadoPlanilha02": "dataOperacao",
    "dadoPlanilha03": "dataVencimentoFinal",
    "dadoPlanilha04": "valorQuitacao",
    "multa2pct": {
      "condicional": {
        "campo": "modalidade",
        "contem": "HONRA",
        "entao": "nao",
        "senao": "sim"
      }
    },
    "moraEspecifica": null
  }
};

await conn.execute(
  'UPDATE docConfigs SET configJson = ? WHERE id = 270001',
  [JSON.stringify(novoConfig)]
);
await conn.end();
console.log('Configuração atualizada com sucesso!');
