import { createConnection } from "mysql2/promise";
import { readFileSync } from "fs";

const json = JSON.parse(readFileSync("/home/ubuntu/upload/clientes.json", "utf8"));
const db = await createConnection(process.env.DATABASE_URL);

let inserted = 0, skipped = 0;
for (const [nomeFantasia, d] of Object.entries(json)) {
  try {
    await db.execute(
      `INSERT IGNORE INTO clientes (nomeFantasia, nomeCompleto, doc, telefone, logradouro, numero, complemento, cep, uf, municipio, paragrafaInicial, enderecoCoop)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        nomeFantasia,
        d.nome ?? null,
        d.doc ?? null,
        d.telefone ?? null,
        d.logradouro ?? null,
        d.numero ?? null,
        d.complemento ?? null,
        d.cep ?? null,
        d.uf ?? null,
        d.municipio ?? null,
        d.paragrafo_inicial ?? null,
        d.enderecoCoop ?? null,
      ]
    );
    inserted++;
  } catch (e) {
    console.error("Erro em", nomeFantasia, e.message);
    skipped++;
  }
}
await db.end();
console.log(`Seed concluído: ${inserted} inseridas, ${skipped} erros.`);
