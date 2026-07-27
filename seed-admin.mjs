/**
 * Script para cadastrar o usuário administrador no banco de dados.
 * Uso: node seed-admin.mjs <email> <senha> [nome]
 * Exemplo: node seed-admin.mjs admin@exemplo.com MinhaS3nha "Roniel"
 */
import { createConnection } from "mysql2/promise";
import { createHash } from "crypto";
import { readFileSync } from "fs";

// Carregar .env se existir
try {
  const env = readFileSync(".env", "utf8");
  for (const line of env.split("\n")) {
    const [key, ...rest] = line.split("=");
    if (key && rest.length) process.env[key.trim()] = rest.join("=").trim();
  }
} catch {}

const args = process.argv.slice(2);
if (args.length < 2) {
  console.error("Uso: node seed-admin.mjs <email> <senha> [nome]");
  process.exit(1);
}

const [email, password, name = null] = args;

// Usar bcryptjs via require dinâmico
const { default: bcrypt } = await import("bcryptjs");

const hash = await bcrypt.hash(password, 12);

const dbUrl = process.env.DATABASE_URL;
if (!dbUrl) {
  console.error("DATABASE_URL não definida.");
  process.exit(1);
}

// Parsear a URL do banco
const url = new URL(dbUrl);
const conn = await createConnection({
  host: url.hostname,
  port: parseInt(url.port || "3306"),
  user: url.username,
  password: url.password,
  database: url.pathname.slice(1),
  ssl: { rejectUnauthorized: false },
});

try {
  await conn.execute(
    "INSERT INTO localUsers (email, passwordHash, name) VALUES (?, ?, ?) ON DUPLICATE KEY UPDATE passwordHash = VALUES(passwordHash), name = COALESCE(VALUES(name), name)",
    [email.toLowerCase(), hash, name]
  );
  console.log(`✅ Usuário criado/atualizado: ${email}`);
} finally {
  await conn.end();
}
