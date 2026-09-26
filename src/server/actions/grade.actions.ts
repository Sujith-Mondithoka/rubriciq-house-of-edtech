"use server";

import { revalidatePath } from "next/cache";

import { releaseGradesHandler, saveGradeHandler } from "./grade.handlers";
import { runAction } from "./run-action";

/** Grades show on the queue, the grader, the student's assignment page and course list. */
function revalidateCourse({ courseId }: { courseId: string }) {
  revalidatePath(`/courses/${courseId}`, "layout");
}

export async function saveGradeAction(input: unknown) {
  return runAction(saveGradeHandler, input, revalidateCourse);
}

export async function releaseGradesAction(input: unknown) {
  return runAction(releaseGradesHandler, input, revalidateCourse);
}
