import { AppError } from "@/lib/errors";
import { DEMO_JOIN_CODE, DEMO_USER_IDS, DEMO_USERS } from "@/server/db/demo-accounts";

/** Shown next to every control that is off for demo accounts on the shared demo course. */
export const DEMO_DISABLED_MESSAGE = "Disabled in the demo";

/** The seeded demo course (owned by the demo instructor, with the fixed demo join code). */
export function isDemoCourse(course: { createdBy: string; joinCode: string }): boolean {
  return course.createdBy === DEMO_USERS.instructor.id && course.joinCode === DEMO_JOIN_CODE;
}

/**
 * The demo course is shared by every reviewer, so demo accounts may not archive it, remove its
 * members, delete its assignments or change its settings. Courses a demo account creates
 * itself are not affected.
 */
export function isDemoLocked(course: { createdBy: string; joinCode: string }, userId: string) {
  return isDemoCourse(course) && DEMO_USER_IDS.includes(userId);
}

export function assertNotDemoLocked(
  course: { createdBy: string; joinCode: string },
  userId: string,
) {
  if (isDemoLocked(course, userId)) {
    throw new AppError(
      "FORBIDDEN",
      `${DEMO_DISABLED_MESSAGE}: the shared demo course cannot be changed this way. Create your own course to try it.`,
    );
  }
}
