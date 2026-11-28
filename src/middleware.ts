import { NextRequest, NextResponse } from "next/server";
import { SESSION_COOKIE_NAME, verifySessionTokenEdge } from "@/lib/auth-edge";

const PUBLIC_API_PATHS = new Set([
  "/api/auth/login",
  "/api/auth/register",
  "/api/auth/logout",
  "/api/health",
]);

function getAllowedOrigins(request: NextRequest): Set<string> {
  const allowed = new Set<string>();

  // Same-origin host from current request
  const host = request.headers.get("x-forwarded-host") || request.headers.get("host");
  const proto =
    request.headers.get("x-forwarded-proto") ||
    (request.nextUrl.protocol ? request.nextUrl.protocol.replace(":", "") : "http");
  if (host) {
    allowed.add(`${proto}://${host}`);
  }
  allowed.add(request.nextUrl.origin);

  const envOrigins = [
    process.env.ALLOWED_ORIGINS || "",
    process.env.NEXT_PUBLIC_APP_URL || "",
  ]
    .join(",")
    .split(",")
    .map((s) => s.trim().replace(/\/+$/, ""))
    .filter(Boolean);

  for (const origin of envOrigins) {
    allowed.add(origin);
  }

  if (process.env.NODE_ENV !== "production") {
    allowed.add("http://localhost:3000");
    allowed.add("http://127.0.0.1:3000");
  }

  return allowed;
}

function buildSecurityHeaders(nonce: string, isProd: boolean): Record<string, string> {
  const scriptSrc = isProd
    ? `'self' 'nonce-${nonce}'`
    : `'self' 'nonce-${nonce}' 'unsafe-eval'`;

  const csp = [
    "default-src 'self'",
    "base-uri 'self'",
    "form-action 'self'",
    "frame-ancestors 'none'",
    "object-src 'none'",
    "img-src 'self' data: blob:",
    "font-src 'self' data:",
    "style-src 'self' 'unsafe-inline'",
    `script-src ${scriptSrc}`,
    "connect-src 'self'",
    ...(isProd ? ["upgrade-insecure-requests"] : []),
  ].join("; ");

  const headers: Record<string, string> = {
    "Content-Security-Policy": csp,
    "X-Frame-Options": "DENY",
    "X-Content-Type-Options": "nosniff",
    "Referrer-Policy": "strict-origin-when-cross-origin",
    "Permissions-Policy": "camera=(), microphone=(), geolocation=()",
    "X-XSS-Protection": "0",
    "Cross-Origin-Opener-Policy": "same-origin",
  };

  if (isProd) {
    headers["Strict-Transport-Security"] =
      "max-age=31536000; includeSubDomains; preload";
  }

  return headers;
}

function applyHeaders(
  response: NextResponse,
  headersMap: Record<string, string>,
  corsOrigin?: string | null,
) {
  for (const [k, v] of Object.entries(headersMap)) {
    response.headers.set(k, v);
  }
  if (corsOrigin) {
    response.headers.set("Access-Control-Allow-Origin", corsOrigin);
    response.headers.set("Access-Control-Allow-Credentials", "true");
    response.headers.set(
      "Access-Control-Allow-Methods",
      "GET, POST, PATCH, DELETE, OPTIONS",
    );
    response.headers.set("Access-Control-Allow-Headers", "Content-Type");
    response.headers.set("Vary", "Origin");
  }
  return response;
}

export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;
  const isProd = process.env.NODE_ENV === "production";
  const nonce = Buffer.from(crypto.randomUUID()).toString("base64");
  const secHeaders = buildSecurityHeaders(nonce, isProd);

  // 1. CORS validation on /api/* (reject untrusted cross-origin requests; no '*' wildcard)
  let verifiedCorsOrigin: string | null = null;
  if (pathname.startsWith("/api/")) {
    const requestOrigin = request.headers.get("origin")?.trim().replace(/\/+$/, "");
    if (requestOrigin) {
      const allowedOrigins = getAllowedOrigins(request);
      if (!allowedOrigins.has(requestOrigin)) {
        return applyHeaders(
          NextResponse.json(
            { error: "Origin not allowed by CORS policy." },
            { status: 403 },
          ),
          secHeaders,
        );
      }
      verifiedCorsOrigin = requestOrigin;
    }

    if (request.method === "OPTIONS") {
      return applyHeaders(
        new NextResponse(null, { status: 204 }),
        secHeaders,
        verifiedCorsOrigin,
      );
    }
  }

  // 2. Verify session token at the edge
  const token = request.cookies.get(SESSION_COOKIE_NAME)?.value;
  const session = await verifySessionTokenEdge(token);

  // 3. Protect API endpoints
  if (pathname.startsWith("/api/") && !PUBLIC_API_PATHS.has(pathname)) {
    if (!session) {
      return applyHeaders(
        NextResponse.json({ error: "Authentication required." }, { status: 401 }),
        secHeaders,
        verifiedCorsOrigin,
      );
    }
    if (pathname.startsWith("/api/admin/") && session.role !== "owner") {
      return applyHeaders(
        NextResponse.json(
          { error: "Forbidden: owner privileges required." },
          { status: 403 },
        ),
        secHeaders,
        verifiedCorsOrigin,
      );
    }
  }

  // 4. Auth page protection: redirect already authenticated users away from /login & /register
  if (pathname === "/login" || pathname === "/register") {
    if (session) {
      return applyHeaders(
        NextResponse.redirect(new URL("/dashboard", request.url)),
        secHeaders,
      );
    }
  }

  // 5. Protected frontend route guards: prevent direct URL bypass across all operational routes
  const protectedRoutes = ["/dashboard", "/inventory", "/ledger", "/add-item", "/edit-item"];
  const isProtectedRoute = protectedRoutes.some(
    (route) => pathname === route || pathname.startsWith(`${route}/`),
  );
  if (isProtectedRoute) {
    if (!session) {
      return applyHeaders(
        NextResponse.redirect(new URL("/login", request.url)),
        secHeaders,
      );
    }
  }

  if (pathname === "/admin" || pathname.startsWith("/admin/")) {
    if (!session) {
      return applyHeaders(
        NextResponse.redirect(new URL("/login", request.url)),
        secHeaders,
      );
    }
    if (session.role !== "owner") {
      return applyHeaders(
        NextResponse.redirect(new URL("/dashboard", request.url)),
        secHeaders,
      );
    }
  }

  // 6. Strip unverified or tampered URL query parameters on non-API page routes
  if (!pathname.startsWith("/api/") && request.nextUrl.search) {
    const cleanUrl = new URL(pathname, request.url);
    return applyHeaders(NextResponse.redirect(cleanUrl), secHeaders);
  }

  // Forward nonce & security headers to App Router SSR
  const requestHeaders = new Headers(request.headers);
  requestHeaders.set("x-nonce", nonce);
  requestHeaders.set("Content-Security-Policy", secHeaders["Content-Security-Policy"]);

  const response = NextResponse.next({
    request: { headers: requestHeaders },
  });
  return applyHeaders(response, secHeaders, verifiedCorsOrigin);
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|icon\\.svg|favicon\\.ico).*)"],
};

