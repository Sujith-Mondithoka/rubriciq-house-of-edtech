"use server";

import { revalidatePath } from "next/cache";

import { createRegradeHandler, resolveRegradeHandler } from "./regrade.handlers";
import { runAction } from "./run-action";

/** Requests show on the student's assignment page, the grader and the regrade queue. */
function revalidateCourse({ courseId }: { courseId: string }) {
  revalidatePath(`/courses/${courseId}`, "layout");
}

export async function createRegradeAction(input: unknown) {
  return runAction(createRegradeHandler, input, revalidateCourse);
}

export async function resolveRegradeAction(input: unknown) {
  return runAction(resolveRegradeHandler, input, revalidateCourse);
}
