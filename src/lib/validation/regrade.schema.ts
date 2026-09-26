import { z } from "zod";

import { MAX_CRITERIA } from "./assignment.schema";
import { FEEDBACK_MAX, submissionIdSchema } from "./grade.schema";

export const REASON_MIN = 10;
export const REASON_MAX = 2000;

export const regradeIdSchema = z.uuid("Invalid regrade request id");

export const createRegradeSchema = z
  .object({
    submissionId: submissionIdSchema,
    /** null = the whole grade rather than one criterion. */
    criterionId: z.uuid("Choose a criterion").nullable(),
    reason: z
      .string()
      .trim()
      .min(REASON_MIN, `Explain your request in at least ${REASON_MIN} characters`)
      .max(REASON_MAX, `Use at most ${REASON_MAX.toLocaleString("en")} characters`),
  })
  .strict();

export const REGRADE_DECISIONS = ["ACCEPTED", "REJECTED"] as const;

export const resolveRegradeSchema = z
  .object({
    regradeId: regradeIdSchema,
    decision: z.enum(REGRADE_DECISIONS, "Choose accept or reject"),
    response: z
      .string()
      .trim()
      .min(1, "Write a response to the student")
      .max(FEEDBACK_MAX, `Use at most ${FEEDBACK_MAX.toLocaleString("en")} characters`),
    /** The grade version shown to the instructor (optimistic locking). */
    version: z.number().int().min(1),
    /** New levels for an accepted request; points come from the rubric. */
    changes: z
      .array(z.object({ criterionId: z.uuid(), levelId: z.uuid() }).strict())
      .max(MAX_CRITERIA),
  })
  .strict()
  .superRefine((value, ctx) => {
    if (value.decision === "REJECTED" && value.changes.length) {
      ctx.addIssue({
        code: "custom",
        path: ["changes"],
        message: "A rejected request changes nothing",
      });
    }
    if (value.decision === "ACCEPTED" && !value.changes.length) {
      ctx.addIssue({
        code: "custom",
        path: ["changes"],
        message: "Change at least one level to accept",
      });
    }
    const ids = value.changes.map((c) => c.criterionId);
    if (new Set(ids).size !== ids.length) {
      ctx.addIssue({
        code: "custom",
        path: ["changes"],
        message: "Each criterion can change once",
      });
    }
  });

export type CreateRegradeInput = z.infer<typeof createRegradeSchema>;
export type ResolveRegradeInput = z.infer<typeof resolveRegradeSchema>;

export const REGRADE_FILTERS = ["OPEN", "RESOLVED"] as const;
export type RegradeFilter = (typeof REGRADE_FILTERS)[number];

/** Reads `?status=` leniently; defaults to open requests. */
export function parseRegradeFilter(value: unknown): RegradeFilter {
  const raw = Array.isArray(value) ? value[0] : value;
  return raw === "RESOLVED" ? "RESOLVED" : "OPEN";
}
