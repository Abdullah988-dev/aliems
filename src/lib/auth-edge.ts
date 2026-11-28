import type { SessionPayload } from "@/types/domain";

export const SESSION_COOKIE_NAME = "aliems_session";

function getEdgeSecret(): string | null {
  const configured = process.env.AUTH_SECRET?.trim();
  if (configured) return configured;
  if (process.env.NODE_ENV === "production") {
    return null;
  }
  return "aliems-local-dev-only-secret-change-me";
}

function base64UrlToBytes(input: string): Uint8Array {
  const normalized = input.replace(/-/g, "+").replace(/_/g, "/");
  const padLen = (4 - (normalized.length % 4)) % 4;
  const padded = normalized + "=".repeat(padLen);
  const binary = atob(padded);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes;
}

function constantTimeEqual(a: Uint8Array, b: Uint8Array): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) {
    diff |= a[i] ^ b[i];
  }
  return diff === 0;
}

/**
 * Edge-runtime compatible HMAC-SHA256 session token verification using Web Crypto.
 */
export async function verifySessionTokenEdge(
  token: string | undefined,
): Promise<SessionPayload | null> {
  if (!token) return null;
  const secret = getEdgeSecret();
  if (!secret) return null;

  const parts = token.split(".");
  if (parts.length !== 2) return null;
  const [encoded, sig] = parts;
  if (!encoded || !sig) return null;

  try {
    const encoder = new TextEncoder();
    const key = await crypto.subtle.importKey(
      "raw",
      encoder.encode(secret),
      { name: "HMAC", hash: "SHA-256" },
      false,
      ["sign"],
    );
    const expectedSigBuf = new Uint8Array(
      await crypto.subtle.sign("HMAC", key, encoder.encode(encoded)),
    );
    const actualSigBuf = base64UrlToBytes(sig);
    if (!constantTimeEqual(actualSigBuf, expectedSigBuf)) {
      return null;
    }

    const decodedJson = new TextDecoder().decode(base64UrlToBytes(encoded));
    const parsed = JSON.parse(decodedJson) as SessionPayload;
    if (
      !parsed ||
      typeof parsed.userId !== "string" ||
      typeof parsed.tenantId !== "string" ||
      typeof parsed.email !== "string" ||
      (parsed.role !== "owner" && parsed.role !== "operator") ||
      typeof parsed.exp !== "number"
    ) {
      return null;
    }
    if (parsed.exp < Math.floor(Date.now() / 1000)) {
      return null;
    }
    return parsed;
  } catch {
    return null;
  }
}

