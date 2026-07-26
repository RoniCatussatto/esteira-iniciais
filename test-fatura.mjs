import mysql from 'mysql2/promise';
const conn = await mysql.createConnection(process.env.DATABASE_URL);

// Buscar um documento FATURA com texto extraído
const [[docRow]] = await conn.execute(
  "SELECT id, nomeArquivo, textoExtraido FROM documentos WHERE loteId = 300001 AND nomeArquivo LIKE '%FATURA%' AND nomeArquivo LIKE '%330525%' LIMIT 1"
);
const [[cfgRow]] = await conn.execute('SELECT configJson FROM docConfigs WHERE id = 210001');
await conn.end();

const texto = Buffer.isBuffer(docRow.textoExtraido) ? docRow.textoExtraido.toString('utf8') : String(docRow.textoExtraido ?? '');
const cfg = JSON.parse(cfgRow.configJson);

console.log('=== Simulando extração da Fatura ===');
console.log('Documento:', docRow.nomeArquivo);

// Simular extração
const camposIntermedios = {};
for (const campo of cfg.camposExtracao) {
  const locNorm = (campo.localizacao ?? '').toLowerCase();
  const extrairDoNome = locNorm.includes('nome') || locNorm.includes('arquivo');
  const fonte = extrairDoNome ? docRow.nomeArquivo : texto;
  if (campo.regex) {
    const m = fonte.match(new RegExp(campo.regex));
    if (m) {
      const chave = campo.campo.toLowerCase().replace(/[_\s]/g, '');
      camposIntermedios[chave] = m[1] ?? m[0];
      console.log(`  Intermediário "${campo.campo}" = "${camposIntermedios[chave]}"`);
    }
  }
}

// Simular mapeamento
const resultado = {};
for (const [campoFinal, ref] of Object.entries(cfg.mapeamentoCampos)) {
  const chaveRef = ref.toLowerCase().replace(/[_\s]/g, '');
  if (camposIntermedios[chaveRef] !== undefined) {
    resultado[campoFinal] = camposIntermedios[chaveRef];
  } else {
    resultado[campoFinal] = ref; // valor fixo
  }
}

console.log('\n=== Resultado final ===');
console.log('dadoPlanilha01:', resultado.dadoPlanilha01, resultado.dadoPlanilha01?.match(/^\d+$/) ? '✓ número' : '✗ texto descritivo');
console.log('dadoPlanilha02:', resultado.dadoPlanilha02, resultado.dadoPlanilha02?.match(/^\d+$/) ? '✓ número' : '✗ texto descritivo');
console.log('multa2pct:', resultado.multa2pct);
