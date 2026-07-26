import { eq, lt, count, desc } from "drizzle-orm";
import { drizzle } from "drizzle-orm/mysql2";
import { InsertUser, users, lotes, devedores, InsertDevedor, documentos, InsertDocumento, extracoes, InsertExtracao, clientes, InsertCliente, docConfigs, InsertDocConfig } from "../drizzle/schema";
import { ENV } from './_core/env';

let _db: ReturnType<typeof drizzle> | null = null;

// Lazily create the drizzle instance so local tooling can run without a DB.
export async function getDb() {
  if (!_db && process.env.DATABASE_URL) {
    try {
      _db = drizzle(process.env.DATABASE_URL);
    } catch (error) {
      console.warn("[Database] Failed to connect:", error);
      _db = null;
    }
  }
  return _db;
}

export async function upsertUser(user: InsertUser): Promise<void> {
  if (!user.openId) {
    throw new Error("User openId is required for upsert");
  }

  const db = await getDb();
  if (!db) {
    console.warn("[Database] Cannot upsert user: database not available");
    return;
  }

  try {
    const values: InsertUser = {
      openId: user.openId,
    };
    const updateSet: Record<string, unknown> = {};

    const textFields = ["name", "email", "loginMethod"] as const;
    type TextField = (typeof textFields)[number];

    const assignNullable = (field: TextField) => {
      const value = user[field];
      if (value === undefined) return;
      const normalized = value ?? null;
      values[field] = normalized;
      updateSet[field] = normalized;
    };

    textFields.forEach(assignNullable);

    if (user.lastSignedIn !== undefined) {
      values.lastSignedIn = user.lastSignedIn;
      updateSet.lastSignedIn = user.lastSignedIn;
    }
    if (user.role !== undefined) {
      values.role = user.role;
      updateSet.role = user.role;
    } else if (user.openId === ENV.ownerOpenId) {
      values.role = 'admin';
      updateSet.role = 'admin';
    }

    if (!values.lastSignedIn) {
      values.lastSignedIn = new Date();
    }

    if (Object.keys(updateSet).length === 0) {
      updateSet.lastSignedIn = new Date();
    }

    await db.insert(users).values(values).onDuplicateKeyUpdate({
      set: updateSet,
    });
  } catch (error) {
    console.error("[Database] Failed to upsert user:", error);
    throw error;
  }
}

export async function getUserByOpenId(openId: string) {
  const db = await getDb();
  if (!db) {
    console.warn("[Database] Cannot get user: database not available");
    return undefined;
  }

  const result = await db.select().from(users).where(eq(users.openId, openId)).limit(1);

  return result.length > 0 ? result[0] : undefined;
}

// ─── Lotes ────────────────────────────────────────────────────────────────────

export async function createLote(data: { nome: string; dataBordero?: string; cooperativa?: string; totalDevedores: number }) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  const result = await db.insert(lotes).values(data);
  return result;
}

/** Retorna lotes paginados (mais recentes primeiro) e o total de registros. */
export async function getLotesPaginados(page: number, pageSize: number) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  const offset = (page - 1) * pageSize;
  const [rows, totalRows] = await Promise.all([
    db.select().from(lotes).orderBy(desc(lotes.createdAt)).limit(pageSize).offset(offset),
    db.select({ total: count() }).from(lotes),
  ]);
  return { lotes: rows, total: totalRows[0]?.total ?? 0 };
}

export async function getLoteById(id: number) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  const result = await db.select().from(lotes).where(eq(lotes.id, id)).limit(1);
  return result[0] ?? null;
}

export async function updateLoteStatus(id: number, status: "aguardando" | "em_processamento" | "concluido" | "erro") {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  return db.update(lotes).set({ status }).where(eq(lotes.id, id));
}

/** Exclui um lote e todos os devedores vinculados. */
export async function deleteLote(id: number) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  await db.delete(devedores).where(eq(devedores.loteId, id));
  await db.delete(lotes).where(eq(lotes.id, id));
}

/** Exclui lotes criados há mais de 30 dias (e seus devedores). Retorna quantos foram excluídos. */
export async function deleteLotesAntigos(): Promise<number> {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  const limite = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
  // Buscar IDs dos lotes antigos
  const antigos = await db.select({ id: lotes.id }).from(lotes).where(lt(lotes.createdAt, limite));
  if (antigos.length === 0) return 0;
  for (const lote of antigos) {
    await db.delete(devedores).where(eq(devedores.loteId, lote.id));
  }
  const ids = antigos.map((l) => l.id);
  for (const id of ids) {
    await db.delete(lotes).where(eq(lotes.id, id));
  }
  return antigos.length;
}

// ─── Devedores ────────────────────────────────────────────────────────────────

export async function createDevedores(data: InsertDevedor[]) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  if (data.length === 0) return;
  return db.insert(devedores).values(data);
}

export async function getDevedoresByLote(loteId: number) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  return db.select().from(devedores).where(eq(devedores.loteId, loteId)).orderBy(devedores.id);
}

export async function getDevedorById(id: number) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  const result = await db.select().from(devedores).where(eq(devedores.id, id)).limit(1);
  return result[0] ?? null;
}

export async function updateDevedor(id: number, data: Partial<InsertDevedor>) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  return db.update(devedores).set(data).where(eq(devedores.id, id));
}

// ─── Documentos ───────────────────────────────────────────────────────────────

export async function createDocumento(data: InsertDocumento) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  return db.insert(documentos).values(data);
}

export async function getDocumentosByLote(loteId: number) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  return db.select().from(documentos).where(eq(documentos.loteId, loteId)).orderBy(documentos.devedorId, documentos.id);
}

export async function getDocumentosByDevedor(devedorId: number) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  return db.select().from(documentos).where(eq(documentos.devedorId, devedorId)).orderBy(documentos.id);
}

export async function deleteDocumento(id: number) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  return db.delete(documentos).where(eq(documentos.id, id));
}

  export async function deleteDocumentosByLote(loteId: number) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  return db.delete(documentos).where(eq(documentos.loteId, loteId));
}

export async function updateDocumentoTexto(id: number, textoExtraido: string) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  return db.update(documentos).set({ textoExtraido }).where(eq(documentos.id, id));
}

// ─── Extrações ────────────────────────────────────────────────────────────────

export async function getExtracoesByDevedor(devedorId: number) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  return db.select().from(extracoes).where(eq(extracoes.devedorId, devedorId)).orderBy(extracoes.id);
}

export async function getExtracoesByLote(loteId: number) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  return db.select().from(extracoes).where(eq(extracoes.loteId, loteId)).orderBy(extracoes.devedorId, extracoes.id);
}

export async function createExtracao(data: InsertExtracao) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  const result = await db.insert(extracoes).values(data);
  const insertId = (result as unknown as { insertId: number }[])[0]?.insertId ?? (result as unknown as { insertId: number }).insertId;
  return db.select().from(extracoes).where(eq(extracoes.id, insertId)).limit(1).then(r => r[0]);
}

export async function updateExtracao(id: number, data: Partial<InsertExtracao>) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  await db.update(extracoes).set(data).where(eq(extracoes.id, id));
  return db.select().from(extracoes).where(eq(extracoes.id, id)).limit(1).then(r => r[0]);
}

export async function deleteExtracao(id: number) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  return db.delete(extracoes).where(eq(extracoes.id, id));
}

export async function deleteExtracoesByLote(loteId: number) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  return db.delete(extracoes).where(eq(extracoes.loteId, loteId));
}

/** Inicializa as extrações de um devedor a partir dos contratos separados por " / " */
export async function initExtracoesByContratos(devedorId: number, loteId: number, contratosStr: string) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  // Verifica se já existem extrações para este devedor
  const existing = await db.select().from(extracoes).where(eq(extracoes.devedorId, devedorId)).limit(1);
  if (existing.length > 0) return; // já inicializado
  const contratos = contratosStr.split(/\s*\/\s*/).map(c => c.trim()).filter(Boolean);
  if (contratos.length === 0) return;
  await db.insert(extracoes).values(contratos.map(c => ({ devedorId, loteId, numeroContrato: c })));
}

// ─── Clientes ─────────────────────────────────────────────────────────────────

export async function getAllClientes() {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  return db.select().from(clientes).orderBy(clientes.nomeFantasia);
}

export async function getClienteById(id: number) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  const result = await db.select().from(clientes).where(eq(clientes.id, id)).limit(1);
  return result[0] ?? null;
}

export async function createCliente(data: InsertCliente) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  return db.insert(clientes).values(data);
}

export async function updateCliente(id: number, data: Partial<InsertCliente>) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  return db.update(clientes).set(data).where(eq(clientes.id, id));
}

export async function deleteCliente(id: number) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  return db.delete(clientes).where(eq(clientes.id, id));
}

// ─── DocConfigs ───────────────────────────────────────────────────────────────

export async function getDocConfigsByCliente(clienteId: number) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  return db.select().from(docConfigs).where(eq(docConfigs.clienteId, clienteId)).orderBy(docConfigs.nomeDocumento);
}

export async function getDocConfigById(id: number) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  const result = await db.select().from(docConfigs).where(eq(docConfigs.id, id)).limit(1);
  return result[0] ?? null;
}

export async function createDocConfig(data: InsertDocConfig) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  const result = await db.insert(docConfigs).values(data);
  const insertId = (result as unknown as { insertId: number }[])[0]?.insertId ?? (result as unknown as { insertId: number }).insertId;
  return db.select().from(docConfigs).where(eq(docConfigs.id, insertId)).limit(1).then(r => r[0]);
}

export async function updateDocConfig(id: number, data: Partial<InsertDocConfig>) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  return db.update(docConfigs).set(data).where(eq(docConfigs.id, id));
}

export async function deleteDocConfig(id: number) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  return db.delete(docConfigs).where(eq(docConfigs.id, id));
}
