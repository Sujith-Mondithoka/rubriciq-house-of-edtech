import { z } from "zod";

import { AppError } from "@/lib/errors";
import { fail, ok, type Result } from "@/lib/result";
import type { CurrentUser } from "@/server/auth/session";
import type { Db } from "@/server/db/client";

/** Everything a handler needs; integration tests pass a fake user and the test database. */
export type ActionContext = { db: Db; user: CurrentUser; now: Date };

export type Handler<T> = (ctx: ActionContext, input: unknown) => Promise<Result<T>>;

/**
 * parse → run (authorize + service) → Result. Expected failures (`AppError`) become
 * `{ ok: false }`; anything else propagates so the action runner can log it.
 * Kept free of Next.js imports so it can be tested against a real database.
 */
export function defineHandler<S extends z.ZodType, T>(
  schema: S,
  run: (ctx: ActionContext, input: z.output<S>) => Promise<T>,
): Handler<T> {
  return async (ctx, input) => {
    const parsed = schema.safeParse(input);
    if (!parsed.success) {
      return fail(
        "VALIDATION",
        "Please check the highlighted fields.",
        z.flattenError(parsed.error).fieldErrors as Record<string, string[]>,
      );
    }
    try {
      return ok(await run(ctx, parsed.data));
    } catch (error) {
      if (error instanceof AppError) return fail(error.code, error.message, error.fieldErrors);
      throw error;
    }
  };
}
