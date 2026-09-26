import { randomUUID } from "node:crypto";

import { sql } from "drizzle-orm";

import type { DbOrTx } from "@/server/db/client";
import { rateLimit } from "@/server/db/schema";

export type RateLimitRule = {
  /** Namespaced key, e.g. `ai:<userId>`; stored as `rl:<key>` next to Better Auth's own keys. */
  key: string;
  limit: number;
  windowMs: number;
};

export type RateLimitResult = { ok: boolean; remaining: number; retryAfterMs: number };

/**
 * Fixed-window counter in Postgres (the table Better Auth already uses), so limits hold across
 * serverless instances without another service. One atomic upsert per check.
 */
export async function hitRateLimit(
  db: DbOrTx,
  rule: RateLimitRule,
  now: Date,
): Promise<RateLimitResult> {
  const nowMs = now.getTime();
  const expired = sql`${rateLimit.lastRequest} <= ${nowMs - rule.windowMs}`;
  const [row] = await db
    .insert(rateLimit)
    .values({ id: randomUUID(), key: `rl:${rule.key}`, count: 1, lastRequest: nowMs })
    .onConflictDoUpdate({
      target: rateLimit.key,
      set: {
        count: sql`case when ${expired} then 1 else ${rateLimit.count} + 1 end`,
        // lastRequest holds the start of the current window.
        lastRequest: sql`case when ${expired} then ${nowMs} else ${rateLimit.lastRequest} end`,
      },
    })
    .returning({ count: rateLimit.count, windowStart: rateLimit.lastRequest });
  const count = row?.count ?? 1;
  const windowStart = Number(row?.windowStart ?? nowMs);
  return {
    ok: count <= rule.limit,
    remaining: Math.max(0, rule.limit - count),
    retryAfterMs: Math.max(0, windowStart + rule.windowMs - nowMs),
  };
}

const MINUTE = 60_000;

/** The limits the app applies (CLAUDE.md: rate-limit sign-in, sign-up and AI actions). */
export const RATE_LIMITS = {
  /** Every Server Action, per user: generous enough for autosave, stops scripted floods. */
  action: (userId: string): RateLimitRule => ({
    key: `action:${userId}`,
    limit: 120,
    windowMs: MINUTE,
  }),
  /** Starting AI drafts, per user. */
  ai: (userId: string): RateLimitRule => ({
    key: `ai:${userId}`,
    limit: 10,
    windowMs: 10 * MINUTE,
  }),
  /** One-click demo sign-in runs in a Server Action (outside Better Auth's limiter), per IP. */
  demoSignIn: (ip: string): RateLimitRule => ({
    key: `demo:${ip}`,
    limit: 10,
    windowMs: 10 * MINUTE,
  }),
};

export function retryMessage(retryAfterMs: number) {
  const minutes = Math.max(1, Math.ceil(retryAfterMs / MINUTE));
  return `Too many requests. Please try again in ${minutes} minute${minutes === 1 ? "" : "s"}.`;
}
