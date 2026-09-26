import { z } from "zod";

import { assignmentIdSchema } from "./assignment.schema";
import { submissionIdSchema } from "./grade.schema";

/** Mirrors AI_BATCH_MAX on the server. */
export const AI_SUBMISSIONS_MAX = 50;

/** Omit `submissionIds` to draft every eligible submission (bulk); pass one id for a retry. */
export const generateAiDraftsSchema = z
  .object({
    assignmentId: assignmentIdSchema,
    submissionIds: z
      .array(submissionIdSchema)
      .min(1)
      .max(AI_SUBMISSIONS_MAX)
      .refine((ids) => new Set(ids).size === ids.length, "Each submission can be listed once")
      .optional(),
  })
  .strict();
