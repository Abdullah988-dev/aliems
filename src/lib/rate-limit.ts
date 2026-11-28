import { NextResponse } from "next/server";

interface Bucket {
  count: number;
  resetAt: number;
}

declare global {
  var __aliemsRateLimitStore: Map<string, Bucket> | undefined;
}

function getStore(): Map<string, Bucket> {
  if (!globalThis.__aliemsRateLimitStore) {
    globalThis.__aliemsRateLimitStore = new Map<string, Bucket>();
  }
  return globalThis.__aliemsRateLimitStore;
}

export interface RateLimitResult {
  allowed: boolean;
  limit: number;
  remaining: number;
  retryAfterSeconds: number;
}

export function getClientIp(request: Request): string {
  const forwarded = request.headers.get("x-forwarded-for");
  if (forwarded) {
    const first = forwarded.split(",")[0]?.trim();
    if (first) return first;
  }
  const realIp = request.headers.get("x-real-ip")?.trim();
  if (realIp) return realIp;
  return "127.0.0.1";
}

export function checkRateLimit(params: {
  key: string;
  limit: number;
  windowMs: number;
}): RateLimitResult {
  const store = getStore();
  const now = Date.now();

  // Opportunistic cleanup so long-lived Node processes never leak memory
  if (store.size > 5000) {
    for (const [k, b] of store.entries()) {
      if (b.resetAt <= now) store.delete(k);
    }
  }

  const existing = store.get(params.key);
  if (!existing || existing.resetAt <= now) {
    store.set(params.key, { count: 1, resetAt: now + params.windowMs });
    return {
      allowed: true,
      limit: params.limit,
      remaining: Math.max(0, params.limit - 1),
      retryAfterSeconds: Math.ceil(params.windowMs / 1000),
    };
  }

  if (existing.count >= params.limit) {
    const retryAfterSeconds = Math.max(1, Math.ceil((existing.resetAt - now) / 1000));
    return {
      allowed: false,
      limit: params.limit,
      remaining: 0,
      retryAfterSeconds,
    };
  }

  existing.count += 1;
  return {
    allowed: true,
    limit: params.limit,
    remaining: Math.max(0, params.limit - existing.count),
    retryAfterSeconds: Math.max(1, Math.ceil((existing.resetAt - now) / 1000)),
  };
}

export function rateLimitExceededResponse(
  result: RateLimitResult,
  message = "Too many requests. Please try again later.",
): NextResponse {
  return NextResponse.json(
    { error: message },
    {
      status: 429,
      headers: {
        "Retry-After": String(result.retryAfterSeconds),
        "X-RateLimit-Limit": String(result.limit),
        "X-RateLimit-Remaining": "0",
      },
    },
  );
}

/** Strict auth rate limiter: max 5 requests per 15 minutes per IP + endpoint. */
export function enforceAuthRateLimit(request: Request, action: string): NextResponse | null {
  if (process.env.NODE_ENV === "test") return null;
  const ip = getClientIp(request);
  const res = checkRateLimit({
    key: `auth:${action}:${ip}`,
    limit: 5,
    windowMs: 15 * 60 * 1000,
  });
  if (!res.allowed) {
    return rateLimitExceededResponse(
      res,
      `Too many attempts. Please wait ${Math.ceil(res.retryAfterSeconds / 60)} minute(s) before trying again.`,
    );
  }
  return null;
}

/** General API rate limiter: 120 requests per minute per IP. */
export function enforceApiRateLimit(
  request: Request,
  bucketName = "api",
  limit = 120,
  windowMs = 60 * 1000,
): NextResponse | null {
  if (process.env.NODE_ENV === "test") return null;
  const ip = getClientIp(request);
  const res = checkRateLimit({
    key: `${bucketName}:${ip}`,
    limit,
    windowMs,
  });
  if (!res.allowed) {
    return rateLimitExceededResponse(res);
  }
  return null;
}

