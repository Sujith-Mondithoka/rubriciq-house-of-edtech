import { z } from "zod";

import { courseIdSchema } from "./course.schema";

export const ASSIGNMENT_TITLE_MAX = 120;
export const INSTRUCTIONS_MAX = 5000;
export const CRITERION_TITLE_MAX = 120;
export const CRITERION_DESCRIPTION_MAX = 1000;
export const LEVEL_LABEL_MAX = 60;
export const LEVEL_DESCRIPTOR_MAX = 1000;
export const MAX_CRITERIA = 20;
export const MIN_LEVELS = 2;
export const MAX_LEVELS = 6;
export const POINTS_MAX = 100;

export const assignmentIdSchema = z.uuid("Invalid assignment id");

/** An ISO 8601 timestamp with an offset (the browser sends `toISOString()`), stored as UTC. */
const dueAt = z.iso
  .datetime({ offset: true, message: "Choose a due date and time" })
  .transform((value) => new Date(value));

const assignmentFields = {
  title: z
    .string()
    .trim()
    .min(1, "Enter a title")
    .max(ASSIGNMENT_TITLE_MAX, `Use at most ${ASSIGNMENT_TITLE_MAX} characters`),
  instructions: z
    .string()
    .trim()
    .max(INSTRUCTIONS_MAX, `Use at most ${INSTRUCTIONS_MAX.toLocaleString("en")} characters`),
  dueAt,
  allowLate: z.boolean(),
};

export const createAssignmentSchema = z
  .object({ courseId: courseIdSchema, ...assignmentFields })
  .strict();

export const updateAssignmentSchema = z
  .object({ assignmentId: assignmentIdSchema, ...assignmentFields })
  .strict();

export const assignmentRefSchema = z.object({ assignmentId: assignmentIdSchema }).strict();

// ---------------------------------------------------------------------------
// Rubric (saved as a whole while the assignment is DRAFT)
// ---------------------------------------------------------------------------

export const rubricLevelSchema = z
  .object({
    label: z
      .string()
      .trim()
      .min(1, "Enter a label")
      .max(LEVEL_LABEL_MAX, `Use at most ${LEVEL_LABEL_MAX} characters`),
    points: z
      .number("Enter points")
      .int("Use whole points")
      .min(0, "Points cannot be negative")
      .max(POINTS_MAX, `At most ${POINTS_MAX} points`),
    descriptor: z
      .string()
      .trim()
      .max(LEVEL_DESCRIPTOR_MAX, `Use at most ${LEVEL_DESCRIPTOR_MAX} characters`),
  })
  .strict();

export const rubricCriterionSchema = z
  .object({
    title: z
      .string()
      .trim()
      .min(1, "Enter a criterion title")
      .max(CRITERION_TITLE_MAX, `Use at most ${CRITERION_TITLE_MAX} characters`),
    description: z
      .string()
      .trim()
      .max(CRITERION_DESCRIPTION_MAX, `Use at most ${CRITERION_DESCRIPTION_MAX} characters`),
    levels: z
      .array(rubricLevelSchema)
      .min(MIN_LEVELS, `Add at least ${MIN_LEVELS} levels`)
      .max(MAX_LEVELS, `Use at most ${MAX_LEVELS} levels`),
  })
  .strict()
  .superRefine((criterion, ctx) => {
    const seen = new Set<number>();
    criterion.levels.forEach((level, index) => {
      if (seen.has(level.points)) {
        ctx.addIssue({
          code: "custom",
          path: ["levels", index, "points"],
          message: "Each level needs different points",
        });
      }
      seen.add(level.points);
    });
  });

export const saveRubricSchema = z
  .object({
    assignmentId: assignmentIdSchema,
    criteria: z
      .array(rubricCriterionSchema)
      .min(1, "Add at least one criterion")
      .max(MAX_CRITERIA, `Use at most ${MAX_CRITERIA} criteria`),
  })
  .strict();

export type AssignmentFormInput = z.input<typeof createAssignmentSchema>;
export type RubricCriterionInput = z.infer<typeof rubricCriterionSchema>;
export type SaveRubricInput = z.infer<typeof saveRubricSchema>;

/** The best possible score: the top level of every criterion. Computed on the server. */
export function rubricMaxScore(criteria: { levels: { points: number }[] }[]): number {
  return criteria.reduce(
    (sum, c) => sum + (c.levels.length ? Math.max(...c.levels.map((l) => l.points)) : 0),
    0,
  );
}
