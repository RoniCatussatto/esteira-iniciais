/**
 * Autenticação local (email/senha) — independente do Manus OAuth.
 * Usa bcryptjs para hash de senha e jose para JWT de sessão.
 */
import bcrypt from "bcryptjs";
import { SignJWT, jwtVerify } from "jose";
import { ENV } from "./_core/env";
import { ONE_YEAR_MS } from "../shared/const";

const SALT_ROUNDS = 12;

function getSecret() {
  return new TextEncoder().encode(ENV.cookieSecret);
}

export async function hashPassword(password: string): Promise<string> {
  return bcrypt.hash(password, SALT_ROUNDS);
}

export async function verifyPassword(password: string, hash: string): Promise<boolean> {
  return bcrypt.compare(password, hash);
}

export type LocalSessionPayload = {
  localUserId: number;
  email: string;
  name: string | null;
};

export async function signLocalSession(payload: LocalSessionPayload): Promise<string> {
  const expiresInMs = ONE_YEAR_MS;
  const expirationSeconds = Math.floor((Date.now() + expiresInMs) / 1000);
  return new SignJWT({ ...payload })
    .setProtectedHeader({ alg: "HS256", typ: "JWT" })
    .setExpirationTime(expirationSeconds)
    .sign(getSecret());
}

export async function verifyLocalSession(token: string | undefined | null): Promise<LocalSessionPayload | null> {
  if (!token) return null;
  try {
    const { payload } = await jwtVerify(token, getSecret(), { algorithms: ["HS256"] });
    const { localUserId, email, name } = payload as Record<string, unknown>;
    if (typeof localUserId !== "number" || typeof email !== "string") return null;
    return { localUserId, email, name: typeof name === "string" ? name : null };
  } catch {
    return null;
  }
}
