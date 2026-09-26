/** Route prefixes that require a signed-in user. */
export const PROTECTED_PREFIXES = ["/dashboard", "/courses"] as const;

export function isProtectedPath(pathname: string): boolean {
  return PROTECTED_PREFIXES.some(
    (prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`),
  );
}

export function signInUrlFor(pathname: string, search = ""): string {
  return `/sign-in?next=${encodeURIComponent(`${pathname}${search}`)}`;
}
