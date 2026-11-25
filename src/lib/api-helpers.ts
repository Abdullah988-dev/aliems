import { NextResponse } from "next/server";
import { getSessionFromCookies } from "@/lib/auth";
import type { SessionPayload } from "@/types/domain";

export function jsonError(message: string, status = 400) {
  return NextResponse.json({ error: message }, { status });
}

export async function requireApiSession(): Promise<
  { session: SessionPayload; error: null } | { session: null; error: NextResponse }
> {
  const session = await getSessionFromCookies();
  if (!session) {
    return { session: null, error: jsonError("Authentication required.", 401) };
  }
  return { session, error: null };
}

