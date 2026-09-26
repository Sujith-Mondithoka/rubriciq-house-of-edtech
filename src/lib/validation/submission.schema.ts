import { z } from "zod";

import { assignmentIdSchema } from "./assignment.schema";

export const SUBMISSION_MAX = 20_000;

const content = z
  .string()
  .trim()
  .max(SUBMISSION_MAX, `Use at most ${SUBMISSION_MAX.toLocaleString("en")} characters`);

/** Autosave. An empty draft is allowed (the student cleared the editor). */
export const saveDraftSchema = z.object({ assignmentId: assignmentIdSchema, content }).strict();

export const submitSchema = z
  .object({
    assignmentId: assignmentIdSchema,
    content: content.refine((value) => value.length > 0, "Write something before submitting"),
  })
  .strict();

export const deleteDraftSchema = z
  .object({ submissionId: z.uuid("Invalid submission id") })
  .strict();
