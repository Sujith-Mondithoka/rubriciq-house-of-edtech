import { getSessionCookie } from "better-auth/cookies";
import { type NextRequest, NextResponse } from "next/server";

import { isProtectedPath, signInUrlFor } from "@/lib/routes";

/**
 * Optimistic check only: redirects visitors without a session cookie away from app pages.
 * It never touches the database. Real session and permission checks happen in
 * requireUser() and the policy layer.
 */
export function proxy(request: NextRequest) {
  const { pathname, search } = request.nextUrl;
  if (!isProtectedPath(pathname) || getSessionCookie(request)) {
    return NextResponse.next();
  }
  return NextResponse.redirect(new URL(signInUrlFor(pathname, search), request.url));
}

export const config = {
  matcher: ["/dashboard/:path*", "/courses/:path*"],
};
