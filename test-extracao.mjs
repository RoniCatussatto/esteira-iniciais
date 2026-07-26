import mysql from 'mysql2/promise';

const conn = await mysql.createConnection(process.env.DATABASE_URL);

// Buscar o texto do EXTRATO 1540401 e a config
const [[docRow]] = await conn.execute(
  "SELECT id, nomeArquivo, textoExtraido FROM documentos WHERE id = 390041 LIMIT 1"
);
const [[cfgRow]] = await conn.execute(
  "SELECT configJson FROM docConfigs WHERE id = 270001"
);
await conn.end();

const texto = Buffer.isBuffer(docRow.textoExtraido) 
  ? docRow.textoExtraido.toString('utf8') 
  : String(docRow.textoExtraido ?? '');
const linhas = texto.split('\n').map(l => l.trim());
const cfg = JSON.parse(cfgRow.configJson);

console.log('=== Simulando extração com nova configuração ===');
console.log('Documento:', docRow.nomeArquivo);
console.log('');

const resultado = {};
for (const campo of cfg.camposExtracao) {
  if (campo.linhaIndice !== undefined) {
    resultado[campo.campo] = linhas[campo.linhaIndice] ?? '';
    console.log(`${campo.campo} (linha ${campo.linhaIndice}): "${resultado[campo.campo]}"`);
  }
  if (campo.linhaEspecial === 'saldoQuitacao') {
    const val43 = linhas[43] ?? '';
    const match43 = val43.match(/^([\d.,]+)/);
    const saldo = match43 ? match43[1] : (linhas[29] ?? '');
    // removerPontoMilhar: remove pontos de milhar
    const valorFinal = saldo.replace(/\.(?=\d{3}[,])/g, '');
    resultado[campo.campo] = valorFinal;
    console.log(`${campo.campo} (saldoQuitacao L43="${val43.substring(0,30)}" → L29="${linhas[29]}"): "${valorFinal}"`);
  }
}

console.log('');
console.log('=== Resultado esperado pelo usuário ===');
console.log('Data Operação: 07/11/2025 →', resultado.dataOperacao === '07/11/2025' ? '✓ CORRETO' : '✗ ERRADO: ' + resultado.dataOperacao);
console.log('Data Vencto:   25/12/2026 →', resultado.dataVencimentoFinal === '25/12/2026' ? '✓ CORRETO' : '✗ ERRADO: ' + resultado.dataVencimentoFinal);
console.log('Saldo Quit.:   8503,49   →', resultado.valorQuitacao === '8503,49' ? '✓ CORRETO' : '✗ ERRADO: ' + resultado.valorQuitacao);
console.log('Contrato:      1540401   →', resultado.contrato === '1540401' ? '✓ CORRETO' : '✗ ERRADO: ' + resultado.contrato);
