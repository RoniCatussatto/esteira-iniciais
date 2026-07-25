import { eq, lt, count, desc } from "drizzle-orm";
import { drizzle } from "drizzle-orm/mysql2";
import { InsertUser, users, lotes, devedores, InsertDevedor } from "../drizzle/schema";
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
