import type { ErrorCode, FieldErrors } from "./result";

/**
 * An expected failure with a message that is safe to show. Services throw it; the action
 * layer turns it into a `Result`. Anything else is an unexpected error and is logged.
 */
export class AppError extends Error {
  constructor(
    readonly code: Exclude<ErrorCode, "INTERNAL">,
    message: string,
    readonly fieldErrors?: FieldErrors,
  ) {
    super(message);
    this.name = "AppError";
  }
}

export const GENERIC_ERROR_MESSAGE = "Something went wrong. Please try again.";

/** Postgres unique_violation, optionally for one named constraint. */
export function isUniqueViolation(error: unknown, constraint?: string): boolean {
  // Drizzle wraps the pg error in `cause`.
  type PgLike = { code?: string; constraint?: string; cause?: PgLike } | null | undefined;
  const e = error as PgLike;
  return [e, e?.cause].some(
    (c) => c?.code === "23505" && (!constraint || c.constraint === constraint),
  );
}
