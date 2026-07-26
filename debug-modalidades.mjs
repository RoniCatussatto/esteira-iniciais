import mysql from 'mysql2/promise';
const conn = await mysql.createConnection(process.env.DATABASE_URL);
// Verificar documentos EXTRATO de cartão (que têm Fatura associada)
const [rows] = await conn.execute(`
  SELECT d.nomeArquivo, SUBSTRING(d.textoExtraido, 1, 500) as inicio
  FROM documentos d
  WHERE d.nomeArquivo LIKE 'EXTRATO%'
  AND d.textoExtraido IS NOT NULL
  AND d.textoExtraido != ''
  AND EXISTS (
    SELECT 1 FROM documentos d2 
    WHERE d2.devedorId = d.devedorId 
    AND d2.nomeArquivo LIKE 'FATURA%'
  )
  LIMIT 5
`);
for (const row of rows) {
  const linhas = row.inicio.split('\n');
  console.log(`\n${row.nomeArquivo}:`);
  console.log('Linha 26 (modalidade):', linhas[26] ?? '(vazia)');
}
await conn.end();
process.exit(0);
