import { int, mysqlEnum, mysqlTable, text, timestamp, varchar, json } from "drizzle-orm/mysql-core";

/**
 * Core user table backing auth flow.
 * Extend this file with additional tables as your product grows.
 * Columns use camelCase to match both database fields and generated types.
 */
export const users = mysqlTable("users", {
  /**
   * Surrogate primary key. Auto-incremented numeric value managed by the database.
   * Use this for relations between tables.
   */
  id: int("id").autoincrement().primaryKey(),
  /** Manus OAuth identifier (openId) returned from the OAuth callback. Unique per user. */
  openId: varchar("openId", { length: 64 }).notNull().unique(),
  name: text("name"),
  email: varchar("email", { length: 320 }),
  loginMethod: varchar("loginMethod", { length: 64 }),
  role: mysqlEnum("role", ["user", "admin"]).default("user").notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
  lastSignedIn: timestamp("lastSignedIn").defaultNow().notNull(),
});

export type User = typeof users.$inferSelect;
export type InsertUser = typeof users.$inferInsert;

// TODO: Add your tables here
// TODO: Add your tables here

/**
 * Lotes de processamento — cada upload de planilha BD gera um lote.
 */
export const lotes = mysqlTable("lotes", {
  id: int("id").autoincrement().primaryKey(),
  nome: varchar("nome", { length: 255 }).notNull(),
  dataBordero: varchar("dataBordero", { length: 20 }),
  cooperativa: varchar("cooperativa", { length: 255 }),
  totalDevedores: int("totalDevedores").default(0).notNull(),
  status: mysqlEnum("status", ["aguardando", "em_processamento", "concluido", "erro"]).default("aguardando").notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

export type Lote = typeof lotes.$inferSelect;
export type InsertLote = typeof lotes.$inferInsert;

/**
 * Devedores — cada linha da planilha BD vira um devedor vinculado a um lote.
 */
export const devedores = mysqlTable("devedores", {
  id: int("id").autoincrement().primaryKey(),
  loteId: int("loteId").notNull(),
  // Dados principais
  cooperativa: varchar("cooperativa", { length: 255 }),
  dataBordero: varchar("dataBordero", { length: 20 }),
  contratos: text("contratos"),
  valorBordero: varchar("valorBordero", { length: 50 }),
  // Dados do contrário (devedor)
  contrarioNome: varchar("contrarioNome", { length: 255 }),
  contrarioCpf: varchar("contrarioCpf", { length: 20 }),
  vencBordero: varchar("vencBordero", { length: 20 }),
  contrarioEndereco: text("contrarioEndereco"),
  foro: varchar("foro", { length: 255 }),
  // Dados do veículo (podem ser nulos)
  veiculoModelo: varchar("veiculoModelo", { length: 255 }),
  veiculoAno: varchar("veiculoAno", { length: 20 }),
  veiculoPlaca: varchar("veiculoPlaca", { length: 20 }),
  veiculoRenavam: varchar("veiculoRenavam", { length: 50 }),
  veiculoChassis: varchar("veiculoChassis", { length: 100 }),
  // Campos calculados / gerados (preenchidos nas etapas seguintes)
  tipoInicial: varchar("tipoInicial", { length: 100 }),
  tipoPlanilha: varchar("tipoPlanilha", { length: 100 }),
  valorCausa: varchar("valorCausa", { length: 50 }),
  status: mysqlEnum("status", ["pendente", "em_processamento", "concluido", "erro"]).default("pendente").notNull(),
  observacoes: text("observacoes"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

export type Devedor = typeof devedores.$inferSelect;
export type InsertDevedor = typeof devedores.$inferInsert;

/**
 * Documentos — arquivos enviados para cada devedor de um lote.
 */
export const documentos = mysqlTable("documentos", {
  id: int("id").autoincrement().primaryKey(),
  loteId: int("loteId").notNull(),
  devedorId: int("devedorId").notNull(),
  nomeArquivo: varchar("nomeArquivo", { length: 500 }).notNull(),
  nomePasta: varchar("nomePasta", { length: 500 }),   // nome da pasta original do upload
  fileKey: varchar("fileKey", { length: 1000 }).notNull(),
  fileUrl: varchar("fileUrl", { length: 1000 }).notNull(),
  mimeType: varchar("mimeType", { length: 100 }),
  tamanho: int("tamanho"),                             // bytes
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});

export type Documento = typeof documentos.$inferSelect;
export type InsertDocumento = typeof documentos.$inferInsert;
