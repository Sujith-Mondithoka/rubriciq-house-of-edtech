"use server";

import { revalidatePath } from "next/cache";

import { deleteDraftHandler, saveDraftHandler, submitHandler } from "./submission.handlers";
import { runAction } from "./run-action";

type Ref = { courseId: string; assignmentId: string };

/** The course list shows each student's own status; the assignment page shows the editor. */
function revalidateAssignment({ courseId, assignmentId }: Ref) {
  revalidatePath(`/courses/${courseId}`);
  revalidatePath(`/courses/${courseId}/assignments/${assignmentId}`);
}

/** Autosave: no revalidation, the editor already holds the text. */
export async function saveDraftAction(input: unknown) {
  return runAction(saveDraftHandler, input);
}

export async function submitAction(input: unknown) {
  return runAction(submitHandler, input, revalidateAssignment);
}

export async function deleteDraftAction(input: unknown) {
  return runAction(deleteDraftHandler, input, revalidateAssignment);
}
