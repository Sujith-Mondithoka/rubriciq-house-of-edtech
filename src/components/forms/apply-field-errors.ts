import type { FieldValues, Path, UseFormSetError } from "react-hook-form";

import type { FieldErrors } from "@/lib/result";

/**
 * Shows server-side field errors on the matching inputs. Returns true when at least one
 * field was marked, so the caller can skip a generic toast.
 */
export function applyFieldErrors<T extends FieldValues>(
  fieldErrors: FieldErrors | undefined,
  setError: UseFormSetError<T>,
  fields: readonly Path<T>[],
): boolean {
  let marked = false;
  for (const field of fields) {
    const message = fieldErrors?.[field]?.[0];
    if (message) {
      setError(field, { type: "server", message }, { shouldFocus: !marked });
      marked = true;
    }
  }
  return marked;
}
