import "server-only";

import { randomUUID } from "node:crypto";

import { unstable_rethrow } from "next/navigation";

import { GENERIC_ERROR_MESSAGE } from "@/lib/errors";
import { fail, type Result } from "@/lib/result";
import { getCurrentUser } from "@/server/auth/session";
import { db } from "@/server/db";

import type { Handler } from "./handler";

/**
 * Runs a handler for the signed-in user. Unexpected errors are logged with a request id and
 * the user sees a generic message; nothing is thrown to the client.
 */
export async function runAction<T>(
  handler: Handler<T>,
  input: unknown,
  onSuccess?: (data: T) => void,
): Promise<Result<T>> {
  try {
    const user = await getCurrentUser();
    if (!user) return fail("UNAUTHENTICATED", "Your session has ended. Please sign in again.");
    const result = await handler({ db, user, now: new Date() }, input);
    if (result.ok) onSuccess?.(result.data);
    return result;
  } catch (error) {
    unstable_rethrow(error);
    const requestId = randomUUID();
    console.error(`[action] ${requestId}`, error);
    return fail("INTERNAL", `${GENERIC_ERROR_MESSAGE} (Reference: ${requestId.slice(0, 8)})`);
  }
}
