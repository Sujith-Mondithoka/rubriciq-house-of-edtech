export type ErrorCode =
  | "VALIDATION"
  | "UNAUTHENTICATED"
  | "FORBIDDEN"
  | "NOT_FOUND"
  | "CONFLICT"
  | "RATE_LIMITED"
  | "INTERNAL";

export type FieldErrors = Record<string, string[] | undefined>;

/** What every Server Action returns. Actions never throw to the client. */
export type Result<T> =
  | { ok: true; data: T }
  | { ok: false; code: ErrorCode; message: string; fieldErrors?: FieldErrors };

export function ok<T>(data: T): Result<T> {
  return { ok: true, data };
}

export function fail(code: ErrorCode, message: string, fieldErrors?: FieldErrors): Result<never> {
  return fieldErrors ? { ok: false, code, message, fieldErrors } : { ok: false, code, message };
}
