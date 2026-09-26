import { z } from "zod";

import { assignmentIdSchema, MAX_CRITERIA } from "./assignment.schema";

export const FEEDBACK_MAX = 2000;
/** Most grades one bulk release may carry (one statement, one transaction). */
export const RELEASE_BATCH_MAX = 200;

export const submissionIdSchema = z.uuid("Invalid submission id");

const feedback = z
  .string()
  .trim()
  .max(FEEDBACK_MAX, `Use at most ${FEEDBACK_MAX.toLocaleString("en")} characters`);

export const criterionScoreInputSchema = z
  .object({
    criterionId: z.uuid("Invalid criterion id"),
    /** null = not scored yet (allowed in a draft; release needs every criterion). */
    levelId: z.uuid("Invalid level id").nullable(),
    feedback,
  })
  .strict();

/** Points are never sent: the server takes them from the chosen level. */
export const saveGradeSchema = z
  .object({
    submissionId: submissionIdSchema,
    /** The version the grader loaded; 0 when no grade exists yet (optimistic locking). */
    version: z.number().int().min(0).max(1_000_000),
    overallFeedback: feedback,
    scores: z.array(criterionScoreInputSchema).max(MAX_CRITERIA),
  })
  .strict()
  .superRefine((value, ctx) => {
    const seen = new Set<string>();
    value.scores.forEach((s, index) => {
      if (seen.has(s.criterionId)) {
        ctx.addIssue({
          code: "custom",
          path: ["scores", index, "criterionId"],
          message: "Each criterion can be scored once",
        });
      }
      seen.add(s.criterionId);
    });
  });

export const releaseGradesSchema = z
  .object({
    assignmentId: assignmentIdSchema,
    /** Exactly what the instructor confirmed: a newer save makes the release fail. */
    grades: z
      .array(
        z.object({ submissionId: submissionIdSchema, version: z.number().int().min(1) }).strict(),
      )
      .min(1, "Choose at least one grade")
      .max(RELEASE_BATCH_MAX, `Release at most ${RELEASE_BATCH_MAX} grades at once`),
  })
  .strict()
  .refine(
    (value) => new Set(value.grades.map((g) => g.submissionId)).size === value.grades.length,
    { message: "Each grade can be released once", path: ["grades"] },
  );

/** The grader form (the ids and version are added when saving). */
export const gradeFormSchema = z
  .object({ overallFeedback: feedback, scores: z.array(criterionScoreInputSchema) })
  .strict();

export type GradeFormInput = z.infer<typeof gradeFormSchema>;
export type SaveGradeInput = z.infer<typeof saveGradeSchema>;
export type CriterionScoreInput = z.infer<typeof criterionScoreInputSchema>;

// ---------------------------------------------------------------------------
// Grading queue filter (lives in the URL: ?status=)
// ---------------------------------------------------------------------------

export const QUEUE_STATUSES = [
  "NOT_SUBMITTED",
  "SUBMITTED",
  "AI_DRAFTED",
  "REVIEWED",
  "RELEASED",
] as const;
export type QueueStatus = (typeof QUEUE_STATUSES)[number];

const queueStatus = z.enum(QUEUE_STATUSES);

/** Reads `?status=` leniently: anything unknown means "all". */
export function parseQueueFilter(value: unknown): QueueStatus | null {
  const raw = Array.isArray(value) ? value[0] : value;
  const parsed = queueStatus.safeParse(raw);
  return parsed.success ? parsed.data : null;
}
