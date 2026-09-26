import { AppError } from "@/lib/errors";
import {
  deleteDraftSchema,
  saveDraftSchema,
  submitSchema,
} from "@/lib/validation/submission.schema";
import { authorize } from "@/server/authz/authorize";
import { can } from "@/server/authz/policy";
import { getAssignmentAccess } from "@/server/services/assignment.service";
import { courseState } from "@/server/services/course.service";
import {
  deleteOwnDraft,
  getOwnSubmission,
  getSubmissionAccess,
  saveDraft,
  submitSubmission,
} from "@/server/services/submission.service";

import { type ActionContext, defineHandler } from "./handler";

const NOT_FOUND = "Assignment not found.";

/** Checks `submission:write` for the caller on this assignment (course resolved from it). */
async function authorizeWrite(ctx: ActionContext, assignmentId: string) {
  const access = await getAssignmentAccess(ctx.db, assignmentId, ctx.user.id);
  if (!access) throw new AppError("NOT_FOUND", NOT_FOUND);
  const course = courseState(access.course);
  const { status, dueAt, allowLate, courseId } = access.assignment;
  if (!can(access.member, "assignment:view", { course, assignment: { status } })) {
    throw new AppError("NOT_FOUND", NOT_FOUND);
  }
  const existing = await getOwnSubmission(ctx.db, assignmentId, ctx.user.id);
  const resource = {
    course,
    assignment: { status, dueAt, allowLate },
    submission: existing ? { studentId: ctx.user.id } : null,
    now: ctx.now,
  };
  if (can(access.member, "submission:write", resource)) return { courseId };

  // A student in an active course can only fail on timing: say so instead of "forbidden".
  if (access.member?.role === "STUDENT" && !course.archived) {
    throw new AppError(
      "CONFLICT",
      status === "PUBLISHED"
        ? "The deadline has passed and late submissions are not accepted."
        : "This assignment is closed to submissions.",
    );
  }
  authorize(access.member, "submission:write", resource);
  return { courseId };
}

export const saveDraftHandler = defineHandler(saveDraftSchema, async (ctx, input) => {
  const { courseId } = await authorizeWrite(ctx, input.assignmentId);
  const saved = await saveDraft(ctx.db, {
    assignmentId: input.assignmentId,
    studentId: ctx.user.id,
    content: input.content,
    now: ctx.now,
  });
  return { courseId, assignmentId: input.assignmentId, submission: saved };
});

export const submitHandler = defineHandler(submitSchema, async (ctx, input) => {
  const { courseId } = await authorizeWrite(ctx, input.assignmentId);
  const saved = await submitSubmission(ctx.db, {
    assignmentId: input.assignmentId,
    studentId: ctx.user.id,
    content: input.content,
    now: ctx.now,
  });
  return { courseId, assignmentId: input.assignmentId, submission: saved };
});

/** The course comes from the submission, never from the client. */
export const deleteDraftHandler = defineHandler(deleteDraftSchema, async (ctx, input) => {
  const access = await getSubmissionAccess(ctx.db, input.submissionId, ctx.user.id);
  if (!access) throw new AppError("NOT_FOUND", "Submission not found.");
  const course = courseState(access.course);
  // Other people's submissions are "not found", not "forbidden".
  if (!can(access.member, "submission:view", { course, submission: access.submission })) {
    throw new AppError("NOT_FOUND", "Submission not found.");
  }
  authorize(access.member, "submission:deleteDraft", {
    course,
    submission: { studentId: access.submission.studentId, status: access.submission.status },
  });
  await deleteOwnDraft(ctx.db, access.submission.id, ctx.user.id);
  return { courseId: access.course.id, assignmentId: access.assignment.id };
});
