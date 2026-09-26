import { AppError } from "@/lib/errors";
import {
  assignmentRefSchema,
  createAssignmentSchema,
  saveRubricSchema,
  updateAssignmentSchema,
} from "@/lib/validation/assignment.schema";
import { authorize } from "@/server/authz/authorize";
import { assertNotDemoLocked } from "@/server/authz/demo";
import { can } from "@/server/authz/policy";
import {
  closeAssignment,
  createAssignment,
  deleteDraftAssignment,
  getAssignmentAccess,
  hasSubmissions,
  publishAssignment,
  saveRubric,
  updateAssignment,
} from "@/server/services/assignment.service";
import { courseState, getCourseAccess } from "@/server/services/course.service";

import { type ActionContext, defineHandler } from "./handler";

const NOT_FOUND = "Assignment not found.";

/**
 * Loads the assignment with its owning course and the caller's membership. People who may
 * not even see it (non-members, students on a draft) get NOT_FOUND.
 */
async function loadAssignment(ctx: ActionContext, assignmentId: string) {
  const access = await getAssignmentAccess(ctx.db, assignmentId, ctx.user.id);
  if (!access) throw new AppError("NOT_FOUND", NOT_FOUND);
  const course = courseState(access.course);
  const { status } = access.assignment;
  if (!can(access.member, "assignment:view", { course, assignment: { status } })) {
    throw new AppError("NOT_FOUND", NOT_FOUND);
  }
  return { ...access, course, member: access.member! };
}

export const createAssignmentHandler = defineHandler(createAssignmentSchema, async (ctx, input) => {
  const access = await getCourseAccess(ctx.db, input.courseId, ctx.user.id);
  if (!access) throw new AppError("NOT_FOUND", "Course not found.");
  authorize(access.member, "assignment:create", { course: courseState(access.course) });
  const { courseId, ...fields } = input;
  const created = await createAssignment(ctx.db, ctx.user.id, courseId, fields);
  return { courseId, assignmentId: created.id };
});

export const updateAssignmentHandler = defineHandler(updateAssignmentSchema, async (ctx, input) => {
  const { assignment, course, member } = await loadAssignment(ctx, input.assignmentId);
  authorize(member, "assignment:update", { course, assignment: { status: assignment.status } });
  const { assignmentId, ...fields } = input;
  await updateAssignment(ctx.db, assignmentId, fields);
  return { courseId: assignment.courseId, assignmentId };
});

export const saveRubricHandler = defineHandler(saveRubricSchema, async (ctx, input) => {
  const { assignment, course, member } = await loadAssignment(ctx, input.assignmentId);
  authorize(member, "rubric:edit", { course, assignment: { status: assignment.status } });
  const { maxScore } = await saveRubric(ctx.db, input.assignmentId, input.criteria);
  return { courseId: assignment.courseId, assignmentId: assignment.id, maxScore };
});

export const publishAssignmentHandler = defineHandler(assignmentRefSchema, async (ctx, input) => {
  const { assignment, course, member } = await loadAssignment(ctx, input.assignmentId);
  authorize(member, "assignment:update", { course, assignment: { status: assignment.status } });
  await publishAssignment(ctx.db, ctx.user.id, assignment.id, ctx.now);
  return { courseId: assignment.courseId, assignmentId: assignment.id };
});

export const closeAssignmentHandler = defineHandler(assignmentRefSchema, async (ctx, input) => {
  const { assignment, course, member } = await loadAssignment(ctx, input.assignmentId);
  authorize(member, "assignment:update", { course, assignment: { status: assignment.status } });
  await closeAssignment(ctx.db, ctx.user.id, assignment.id);
  return { courseId: assignment.courseId, assignmentId: assignment.id };
});

export const deleteAssignmentHandler = defineHandler(assignmentRefSchema, async (ctx, input) => {
  const { assignment, course, member } = await loadAssignment(ctx, input.assignmentId);
  authorize(member, "assignment:delete", {
    course,
    assignment: {
      status: assignment.status,
      hasSubmissions: await hasSubmissions(ctx.db, assignment.id),
    },
  });
  // The course comes from the assignment; the shared demo course keeps its assignments.
  const access = await getCourseAccess(ctx.db, assignment.courseId, ctx.user.id);
  if (access) assertNotDemoLocked(access.course, ctx.user.id);
  await deleteDraftAssignment(ctx.db, ctx.user.id, assignment.id);
  return { courseId: assignment.courseId, assignmentId: assignment.id };
});
