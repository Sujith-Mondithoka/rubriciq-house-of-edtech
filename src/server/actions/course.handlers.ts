import { AppError } from "@/lib/errors";
import {
  addTaSchema,
  courseRefSchema,
  createCourseSchema,
  joinCourseSchema,
  removeMemberSchema,
  setCourseAiSchema,
  updateCourseSchema,
} from "@/lib/validation/course.schema";
import { authorize } from "@/server/authz/authorize";
import { assertNotDemoLocked } from "@/server/authz/demo";
import type { Action } from "@/server/authz/policy";
import {
  addTaByEmail,
  archiveCourse,
  courseState,
  createCourse,
  getCourseAccess,
  getMembership,
  joinCourseByCode,
  regenerateJoinCode,
  removeMember,
  setCourseAiEnabled,
  updateCourse,
} from "@/server/services/course.service";

import { type ActionContext, defineHandler } from "./handler";

/** Loads the course and the caller's membership, then checks a course-level permission. */
async function authorizeCourse(
  ctx: ActionContext,
  courseId: string,
  action: Extract<Action, "course:manage" | "course:manageMembers">,
  { demoLocked = false }: { demoLocked?: boolean } = {},
) {
  const access = await getCourseAccess(ctx.db, courseId, ctx.user.id);
  if (!access) throw new AppError("NOT_FOUND", "Course not found.");
  authorize(access.member, action, { course: courseState(access.course) });
  // The shared demo course stays intact for the next reviewer.
  if (demoLocked) assertNotDemoLocked(access.course, ctx.user.id);
  return access;
}

export const createCourseHandler = defineHandler(createCourseSchema, async (ctx, input) => {
  const created = await createCourse(ctx.db, ctx.user.id, input);
  return { courseId: created.id };
});

export const joinCourseHandler = defineHandler(joinCourseSchema, (ctx, input) =>
  joinCourseByCode(ctx.db, ctx.user.id, input.joinCode),
);

export const updateCourseHandler = defineHandler(updateCourseSchema, async (ctx, input) => {
  await authorizeCourse(ctx, input.courseId, "course:manage", { demoLocked: true });
  await updateCourse(ctx.db, input.courseId, input);
  return { courseId: input.courseId };
});

export const archiveCourseHandler = defineHandler(courseRefSchema, async (ctx, input) => {
  await authorizeCourse(ctx, input.courseId, "course:manage", { demoLocked: true });
  await archiveCourse(ctx.db, ctx.user.id, input.courseId, ctx.now);
  return { courseId: input.courseId };
});

export const regenerateJoinCodeHandler = defineHandler(courseRefSchema, async (ctx, input) => {
  await authorizeCourse(ctx, input.courseId, "course:manage", { demoLocked: true });
  const joinCode = await regenerateJoinCode(ctx.db, ctx.user.id, input.courseId);
  return { courseId: input.courseId, joinCode };
});

export const setCourseAiHandler = defineHandler(setCourseAiSchema, async (ctx, input) => {
  await authorizeCourse(ctx, input.courseId, "course:manage", { demoLocked: true });
  await setCourseAiEnabled(ctx.db, ctx.user.id, input.courseId, input.aiEnabled);
  return { courseId: input.courseId, aiEnabled: input.aiEnabled };
});

export const addTaHandler = defineHandler(addTaSchema, async (ctx, input) => {
  await authorizeCourse(ctx, input.courseId, "course:manageMembers");
  const added = await addTaByEmail(ctx.db, ctx.user.id, input.courseId, input.email);
  return { courseId: input.courseId, ...added };
});

/** The course comes from the membership row, never from the client. */
export const removeMemberHandler = defineHandler(removeMemberSchema, async (ctx, input) => {
  const membership = await getMembership(ctx.db, input.memberId);
  if (!membership) throw new AppError("NOT_FOUND", "Member not found.");
  await authorizeCourse(ctx, membership.courseId, "course:manageMembers", { demoLocked: true });
  await removeMember(ctx.db, ctx.user.id, input.memberId);
  return { courseId: membership.courseId };
});
