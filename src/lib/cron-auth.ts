import { createHash, timingSafeEqual } from "node:crypto";

const digest = (value: string) => createHash("sha256").update(value).digest();

/**
 * Vercel Cron sends `Authorization: Bearer <CRON_SECRET>`. Compared in constant time (hashing
 * first gives equal lengths). No secret configured means the endpoint is closed.
 */
export function isAuthorizedCron(authorization: string | null, secret: string | undefined) {
  if (!secret || !authorization?.startsWith("Bearer ")) return false;
  return timingSafeEqual(digest(authorization.slice("Bearer ".length)), digest(secret));
}
