"use server";

import { revalidatePath } from "next/cache";

import {
  addTaHandler,
  archiveCourseHandler,
  createCourseHandler,
  joinCourseHandler,
  regenerateJoinCodeHandler,
  removeMemberHandler,
  setCourseAiHandler,
  updateCourseHandler,
} from "./course.handlers";
import { runAction } from "./run-action";

/** Refreshes the dashboard list and every page under the course. */
function revalidateCourse({ courseId }: { courseId: string }) {
  revalidatePath("/dashboard");
  revalidatePath(`/courses/${courseId}`, "layout");
}

export async function createCourseAction(input: unknown) {
  return runAction(createCourseHandler, input, revalidateCourse);
}

export async function joinCourseAction(input: unknown) {
  return runAction(joinCourseHandler, input, revalidateCourse);
}

export async function updateCourseAction(input: unknown) {
  return runAction(updateCourseHandler, input, revalidateCourse);
}

export async function archiveCourseAction(input: unknown) {
  return runAction(archiveCourseHandler, input, revalidateCourse);
}

export async function regenerateJoinCodeAction(input: unknown) {
  return runAction(regenerateJoinCodeHandler, input, revalidateCourse);
}

export async function setCourseAiAction(input: unknown) {
  return runAction(setCourseAiHandler, input, revalidateCourse);
}

export async function addTaAction(input: unknown) {
  return runAction(addTaHandler, input, revalidateCourse);
}

export async function removeMemberAction(input: unknown) {
  return runAction(removeMemberHandler, input, revalidateCourse);
}
