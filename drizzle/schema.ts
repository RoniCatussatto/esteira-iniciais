import { decimal, int, mysqlEnum, mysqlTable, text, timestamp, varchar } from "drizzle-orm/mysql-core";

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
  // Campos de extração dos documentos (Etapa 3)
  dadoPlanilha01: text("dadoPlanilha01"),
  dadoPlanilha02: text("dadoPlanilha02"),
  dadoPlanilha03: text("dadoPlanilha03"),
  dadoPlanilha04: text("dadoPlanilha04"),
  multa2pct: mysqlEnum("multa2pct", ["sim", "nao", "branco"]).default("branco"),
  moraEspecifica: text("moraEspecifica"),
  // Etapa Definir Inicial
  modeloInicial: varchar("modeloInicial", { length: 100 }), // Ex: "CAC", "COB CCB", "EXEC CONFISSAO"
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
  textoExtraido: text("textoExtraido"),                // texto extraído do PDF durante o upload
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});

export type Documento = typeof documentos.$inferSelect;
export type InsertDocumento = typeof documentos.$inferInsert;

/**
 * Extrações — campos extraídos dos documentos, um registro por contrato de cada devedor.
 * Um devedor com 3 contratos terá 3 registros aqui.
 */
export const extracoes = mysqlTable("extracoes", {
  id: int("id").autoincrement().primaryKey(),
  devedorId: int("devedorId").notNull(),
  loteId: int("loteId").notNull(),
  numeroContrato: varchar("numeroContrato", { length: 100 }).notNull(),
  dadoPlanilha01: text("dadoPlanilha01"),
  dadoPlanilha02: text("dadoPlanilha02"),
  dadoPlanilha03: text("dadoPlanilha03"),
  dadoPlanilha04: text("dadoPlanilha04"),
  multa2pct: mysqlEnum("multa2pct", ["sim", "nao", "branco"]).default("branco"),
  moraEspecifica: text("moraEspecifica"),
  // Índice de correção monetária para este contrato (definido na etapa Definir Inicial)
  indiceCorrecao: mysqlEnum("indiceCorrecao", ["ipca", "selic"]).default("ipca"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

export type Extracao = typeof extracoes.$inferSelect;
export type InsertExtracao = typeof extracoes.$inferInsert;

/**
 * Clientes — empresas/cooperativas que são autoras das ações.
 * Pré-populada via seed a partir do JSON de clientes.
 */
export const clientes = mysqlTable("clientes", {
  id: int("id").autoincrement().primaryKey(),
  nomeFantasia: varchar("nomeFantasia", { length: 255 }).notNull().unique(), // chave de identificação (ex: "SICOOB COOPEREMB")
  nomeCompleto: text("nomeCompleto"),
  doc: varchar("doc", { length: 30 }),          // CNPJ
  telefone: varchar("telefone", { length: 30 }),
  logradouro: varchar("logradouro", { length: 255 }),
  numero: varchar("numero", { length: 50 }),
  complemento: varchar("complemento", { length: 255 }),
  cep: varchar("cep", { length: 20 }),
  uf: varchar("uf", { length: 5 }),
  municipio: varchar("municipio", { length: 255 }),
  paragrafaInicial: text("paragrafaInicial"),
  enderecoCoop: text("enderecoCoop"),
  modeloPadrao: varchar("modeloPadrao", { length: 100 }), // Modelo padrão de petição inicial (ex: "CAC", "COB CCB")
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

export type Cliente = typeof clientes.$inferSelect;
export type InsertCliente = typeof clientes.$inferInsert;

/**
 * DocConfigs — configurações de extração de dados por tipo de documento e por cliente.
 * Cada registro representa um tipo de documento configurado para uma cliente específica.
 */
export const docConfigs = mysqlTable("docConfigs", {
  id: int("id").autoincrement().primaryKey(),
  clienteId: int("clienteId").notNull(),
  nomeDocumento: varchar("nomeDocumento", { length: 255 }).notNull(), // ex: "CCB", "Fatura", "Extrato Sisbr"
  descricao: text("descricao"),
  // Configuração de extração (campos e regras — preenchidos na etapa de configuração)
  configJson: text("configJson"),  // JSON com as regras de extração
  ativo: int("ativo").default(1).notNull(),
  // Regras de identificação automática do documento
  regrasIdentificacao: text("regrasIdentificacao"), // JSON: lista de palavras-chave/padrões no nome do arquivo
  // Script de extração gerado pela IA
  scriptExtracao: text("scriptExtracao"),           // código Python/JS para extrair dados
  // Mapeamento dos campos extraídos → campos do sistema
  mapeamentoCampos: text("mapeamentoCampos"),       // JSON: { dadoPlanilha01: "...", multa2pct: "...", ... }
  // Histórico de conversa com a IA (para edições futuras)
  historicoChat: text("historicoChat"),             // JSON: array de mensagens
  // Arquivos modelo enviados pelo usuário
  arquivosModelo: text("arquivosModelo"),           // JSON: array de { nome, url, key }
  // Status da configuração
  statusConfig: mysqlEnum("statusConfig", ["rascunho", "configurado", "testado"]).default("rascunho").notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

export type DocConfig = typeof docConfigs.$inferSelect;
export type InsertDocConfig = typeof docConfigs.$inferInsert;

/**
 * Índices de correção monetária mensais (IPCA e Selic acumulada).
 * Cada registro representa um mês/ano com seus respectivos valores.
 */
export const indicesCorrecao = mysqlTable("indicesCorrecao", {
  id: int("id").autoincrement().primaryKey(),
  /** Mês/ano no formato "YYYY-MM" (ex: "2025-07") — chave natural única */
  mesAno: varchar("mesAno", { length: 7 }).notNull().unique(),
  /** Rótulo legível (ex: "jul/2025") */
  dataTexto: varchar("dataTexto", { length: 20 }).notNull(),
  /** Valor do índice IPCA acumulado */
  ipca: decimal("ipca", { precision: 12, scale: 6 }).notNull(),
  /** Valor do índice Selic acumulado */
  selic: decimal("selic", { precision: 12, scale: 6 }).notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

export type IndiceCorrecao = typeof indicesCorrecao.$inferSelect;
export type InsertIndiceCorrecao = typeof indicesCorrecao.$inferInsert;

/**
 * Categorias de planilha de cálculo disponíveis.
 * Cada modelo de inicial é associado a uma dessas categorias.
 */
export const CATEGORIAS_PLANILHA = [
  "Geral IPCA",
  "Geral SELIC",
  "CAC e CCB",
  "CE",
  "Cartao",
  "Confissao",
  "Santa Casa",
  "Colegio",
  "Cheque",
  "CE e Cartao",
  "Emprestimo com CE",
  "Emprestimo com Cartao",
  "Emprestimo com CE e Cartao",
] as const;

export type CategoriaPlanilha = (typeof CATEGORIAS_PLANILHA)[number];

/**
 * Modelos de petição inicial — arquivos .docx com placeholders.
 * O nome é o identificador único (ex: "CAC", "COB CCB", "EXEC CONFISSAO").
 * Cada modelo está associado a uma categoria de planilha de cálculo.
 */
export const modelosIniciais = mysqlTable("modelosIniciais", {
  id: int("id").autoincrement().primaryKey(),
  /** Nome identificador único (ex: "CAC", "COB CCB", "EXEC CONFISSAO") */
  nome: varchar("nome", { length: 100 }).notNull().unique(),
  /** Categoria da planilha de cálculo associada */
  categoriaPlanilha: varchar("categoriaPlanilha", { length: 100 }).notNull(),
  /** Chave S3 do arquivo .docx */
  fileKey: varchar("fileKey", { length: 1000 }).notNull(),
  /** URL de acesso ao arquivo .docx */
  fileUrl: varchar("fileUrl", { length: 1000 }).notNull(),
  /** Nome original do arquivo enviado */
  nomeArquivo: varchar("nomeArquivo", { length: 500 }).notNull(),
  /** Tamanho em bytes */
  tamanho: int("tamanho"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

export type ModeloInicial = typeof modelosIniciais.$inferSelect;
export type InsertModeloInicial = typeof modelosIniciais.$inferInsert;

/**
 * Modelos de planilha de cálculo — arquivos .xlsx com fórmulas e placeholders.
 * A chave única é (categoriaPlanilha + qtdContratos): uma planilha por combinação.
 * Máximo de 20 contratos por categoria.
 */
export const modelosCalculo = mysqlTable("modelosCalculo", {
  id: int("id").autoincrement().primaryKey(),
  /** Categoria da planilha (ex: "CAC e CCB", "CE", "Cartao") */
  categoriaPlanilha: varchar("categoriaPlanilha", { length: 100 }).notNull(),
  /** Quantidade de contratos que esta planilha suporta (1–20) */
  qtdContratos: int("qtdContratos").notNull(),
  /** Chave S3 do arquivo .xlsx */
  fileKey: varchar("fileKey", { length: 1000 }).notNull(),
  /** URL de acesso ao arquivo .xlsx */
  fileUrl: varchar("fileUrl", { length: 1000 }).notNull(),
  /** Nome original do arquivo enviado */
  nomeArquivo: varchar("nomeArquivo", { length: 500 }).notNull(),
  /** Tamanho em bytes */
  tamanho: int("tamanho"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

export type ModeloCalculo = typeof modelosCalculo.$inferSelect;
export type InsertModeloCalculo = typeof modelosCalculo.$inferInsert;
