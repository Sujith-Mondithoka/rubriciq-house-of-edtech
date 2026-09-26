import { getSessionCookie } from "better-auth/cookies";
import { type NextRequest, NextResponse } from "next/server";

import { buildCsp } from "@/lib/csp";
import { isProtectedPath, signInUrlFor } from "@/lib/routes";

/**
 * 1. Optimistic check only: redirects visitors without a session cookie away from app pages.
 *    It never touches the database. Real session and permission checks happen in
 *    requireUser() and the policy layer.
 * 2. A fresh CSP nonce per page request (Next.js reads it from the request header and adds it
 *    to its scripts).
 */
export function proxy(request: NextRequest) {
  const { pathname, search } = request.nextUrl;
  if (isProtectedPath(pathname) && !getSessionCookie(request)) {
    return NextResponse.redirect(new URL(signInUrlFor(pathname, search), request.url));
  }

  const nonce = Buffer.from(crypto.randomUUID()).toString("base64");
  const csp = buildCsp(nonce, { dev: process.env.NODE_ENV === "development" });
  const requestHeaders = new Headers(request.headers);
  requestHeaders.set("x-nonce", nonce);
  requestHeaders.set("Content-Security-Policy", csp);
  const response = NextResponse.next({ request: { headers: requestHeaders } });
  response.headers.set("Content-Security-Policy", csp);
  return response;
}

export const config = {
  matcher: [
    // Pages only: not API routes, static assets or link prefetches.
    {
      source: "/((?!api|_next/static|_next/image|favicon.ico).*)",
      missing: [
        { type: "header", key: "next-router-prefetch" },
        { type: "header", key: "purpose", value: "prefetch" },
      ],
    },
  ],
};
