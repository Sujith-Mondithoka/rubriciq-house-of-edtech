import "server-only";

import { randomUUID } from "node:crypto";

import { unstable_rethrow } from "next/navigation";

import { GENERIC_ERROR_MESSAGE } from "@/lib/errors";
import { fail, type Result } from "@/lib/result";
import { type CurrentUser, getCurrentUser } from "@/server/auth/session";
import { db } from "@/server/db";
import {
  hitRateLimit,
  RATE_LIMITS,
  type RateLimitRule,
  retryMessage,
} from "@/server/services/rate-limit.service";

import type { Handler } from "./handler";

type RunOptions = {
  /** An extra, stricter limit for expensive actions (e.g. AI drafts). */
  rateLimit?: (user: CurrentUser) => RateLimitRule;
};

/**
 * Runs a handler for the signed-in user. Every action is rate-limited per user. Unexpected
 * errors are logged with a request id and the user sees a generic message; nothing is thrown
 * to the client.
 */
export async function runAction<T>(
  handler: Handler<T>,
  input: unknown,
  onSuccess?: (data: T) => void,
  options: RunOptions = {},
): Promise<Result<T>> {
  try {
    const user = await getCurrentUser();
    if (!user) return fail("UNAUTHENTICATED", "Your session has ended. Please sign in again.");
    const now = new Date();
    const rules = [
      RATE_LIMITS.action(user.id),
      ...(options.rateLimit ? [options.rateLimit(user)] : []),
    ];
    for (const rule of rules) {
      const limit = await hitRateLimit(db, rule, now);
      if (!limit.ok) return fail("RATE_LIMITED", retryMessage(limit.retryAfterMs));
    }
    const result = await handler({ db, user, now }, input);
    if (result.ok) onSuccess?.(result.data);
    return result;
  } catch (error) {
    unstable_rethrow(error);
    const requestId = randomUUID();
    console.error(`[action] ${requestId}`, error);
    return fail("INTERNAL", `${GENERIC_ERROR_MESSAGE} (Reference: ${requestId.slice(0, 8)})`);
  }
}
