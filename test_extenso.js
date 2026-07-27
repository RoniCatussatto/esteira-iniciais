const extenso = require('extenso');
const vals = [13128.59, 500.00, 1000.00, 2500.50, 100000.00, 1500.00];
for (const v of vals) {
  const r = extenso(v, { mode: 'currency', currency: { type: 'BRL' } });
  const comVirgula = r.replace(/(\bmil\b)(?!,)/g, '$1,');
  console.log(v, '->', comVirgula);
}
