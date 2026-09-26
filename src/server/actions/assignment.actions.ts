"use server";

import { revalidatePath } from "next/cache";

import {
  closeAssignmentHandler,
  createAssignmentHandler,
  deleteAssignmentHandler,
  publishAssignmentHandler,
  saveRubricHandler,
  updateAssignmentHandler,
} from "./assignment.handlers";
import { runAction } from "./run-action";

/** Refreshes the course (assignment list) and every page under it. */
function revalidateCourse({ courseId }: { courseId: string }) {
  revalidatePath(`/courses/${courseId}`, "layout");
}

export async function createAssignmentAction(input: unknown) {
  return runAction(createAssignmentHandler, input, revalidateCourse);
}

export async function updateAssignmentAction(input: unknown) {
  return runAction(updateAssignmentHandler, input, revalidateCourse);
}

export async function saveRubricAction(input: unknown) {
  return runAction(saveRubricHandler, input, revalidateCourse);
}

export async function publishAssignmentAction(input: unknown) {
  return runAction(publishAssignmentHandler, input, revalidateCourse);
}

export async function closeAssignmentAction(input: unknown) {
  return runAction(closeAssignmentHandler, input, revalidateCourse);
}

export async function deleteAssignmentAction(input: unknown) {
  return runAction(deleteAssignmentHandler, input, revalidateCourse);
}
