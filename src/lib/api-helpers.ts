import { NextResponse } from "next/server";
import { getSessionFromCookies } from "@/lib/auth";
import { getDb } from "@/lib/db";
import type { SessionPayload, User } from "@/types/domain";

export function jsonError(message: string, status = 400) {
  return NextResponse.json({ error: message }, { status });
}

/**
 * Sanitize internal server/database error messages before returning HTTP responses in production.
 */
export function safeApiError(
  err: unknown,
  fallbackMessage: string,
  status = 400,
  contextTag?: string,
) {
  const rawMessage = err instanceof Error ? err.message : fallbackMessage;
  if (contextTag) {
    console.error(`[${contextTag}] ${status}:`, rawMessage);
  }

  const isProd = process.env.NODE_ENV === "production";
  if (isProd && status >= 500) {
    return jsonError(fallbackMessage, status);
  }
  if (
    isProd &&
    /mongo|econn|enotfound|etimedout|stack|syntaxerror|typeerror/i.test(rawMessage)
  ) {
    return jsonError(fallbackMessage, status);
  }
  return jsonError(rawMessage, status);
}

/**
 * Verify signed HttpOnly session cookie AND confirm user record still exists inside its tenant.
 */
export async function requireApiSession(): Promise<
  { session: SessionPayload; user: Omit<User, "passwordHash">; error: null } | { session: null; user: null; error: NextResponse }
> {
  const tokenSession = await getSessionFromCookies();
  if (!tokenSession) {
    return {
      session: null,
      user: null,
      error: jsonError("Authentication required.", 401),
    };
  }

  try {
    const db = await getDb();
    const dbUser = await db.findUserById(tokenSession.tenantId, tokenSession.userId);
    if (!dbUser || dbUser.tenantId !== tokenSession.tenantId) {
      return {
        session: null,
        user: null,
        error: jsonError("Session is no longer valid.", 401),
      };
    }

    const { passwordHash: _ignored, ...safeUser } = dbUser;
    void _ignored;
    const verifiedSession: SessionPayload = {
      userId: dbUser.id,
      tenantId: dbUser.tenantId,
      email: dbUser.email,
      role: dbUser.role,
      exp: tokenSession.exp,
    };

    return { session: verifiedSession, user: safeUser, error: null };
  } catch (err) {
    return {
      session: null,
      user: null,
      error: safeApiError(err, "Unable to verify session.", 500, "requireApiSession"),
    };
  }
}

/**
 * Enforce strict Role-Based Access Control (RBAC) on privileged endpoints.
 */
export function requireRole(
  session: SessionPayload,
  allowedRoles: Array<User["role"]>,
): NextResponse | null {
  if (!allowedRoles.includes(session.role)) {
    return jsonError("Forbidden: insufficient role permissions.", 403);
  }
  return null;
}
