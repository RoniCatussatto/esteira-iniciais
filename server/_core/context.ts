import type { CreateExpressContextOptions } from "@trpc/server/adapters/express";
import type { User } from "../../drizzle/schema";
import { sdk } from "./sdk";
import { verifyLocalSession } from "../localAuth";
import { getLocalUserById } from "../db";
import { LOCAL_SESSION_COOKIE } from "../../shared/const";
import { parse as parseCookies } from "cookie";

export type TrpcContext = {
  req: CreateExpressContextOptions["req"];
  res: CreateExpressContextOptions["res"];
  user: User | null;
  localUserId: number | null;
};

export async function createContext(
  opts: CreateExpressContextOptions
): Promise<TrpcContext> {
  let user: User | null = null;
  let localUserId: number | null = null;

  // 1. Tentar autenticação local (email/senha) — tem prioridade
  try {
    const cookies = parseCookies(opts.req.headers.cookie ?? "");
    const localToken = cookies[LOCAL_SESSION_COOKIE];
    const localSession = await verifyLocalSession(localToken);
    if (localSession) {
      const localUser = await getLocalUserById(localSession.localUserId);
      if (localUser) {
        localUserId = localUser.id;
        // Mapear localUser para o tipo User esperado pelo protectedProcedure
        user = {
          id: localUser.id,
          openId: `local_${localUser.id}`,
          name: localUser.name ?? null,
          email: localUser.email,
          loginMethod: "local",
          role: "admin",
          createdAt: localUser.createdAt,
          updatedAt: localUser.updatedAt,
          lastSignedIn: localUser.updatedAt,
        } as User;
      }
    }
  } catch {
    // Sessão local inválida — continuar sem autenticação
  }

  // 2. Fallback: Manus OAuth (apenas se não há sessão local)
  if (!user) {
  try {
    user = await sdk.authenticateRequest(opts.req);
  } catch (error) {
    // Authentication is optional for public procedures.
    user = null;
  }
  }

  return {
    req: opts.req,
    res: opts.res,
    user,
    localUserId,
  };
}
