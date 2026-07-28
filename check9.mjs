async function getSignedUrl(fileKey) {
  const forgeUrl = process.env.BUILT_IN_FORGE_API_URL.replace(/\/+$/, '');
  const forgeKey = process.env.BUILT_IN_FORGE_API_KEY;
  const getUrl = new URL('v1/storage/presign/get', forgeUrl + '/');
  getUrl.searchParams.set('path', fileKey);
  const resp = await fetch(getUrl, { headers: { Authorization: `Bearer ${forgeKey}` } });
  const { url } = await resp.json();
  return url;
}

const fileKey = 'lote-750001/docs/1785257722201-0-RODRIGO_ZULLO_-_EXTRATO_EMPR__STIMO_-_CONTRATO_297251.pdf';
const signedUrl = await getSignedUrl(fileKey);
const resp = await fetch(signedUrl);
const buf = Buffer.from(await resp.arrayBuffer());

const { PDFParse } = await import('pdf-parse');
const parser = new PDFParse({ data: new Uint8Array(buf) });
const result = await parser.getText();
const linhas = result.text.split('\n');
console.log(`Total de linhas: ${linhas.length}`);
linhas.forEach((l, i) => {
  if (l.trim()) console.log(`[${i}] ${l.trim()}`);
});
