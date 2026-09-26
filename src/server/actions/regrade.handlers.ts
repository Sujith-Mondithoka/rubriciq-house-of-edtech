import { AppError } from "@/lib/errors";
import { createRegradeSchema, resolveRegradeSchema } from "@/lib/validation/regrade.schema";
import { authorize } from "@/server/authz/authorize";
import { can } from "@/server/authz/policy";
import { courseState } from "@/server/services/course.service";
import { getGradeForStaff } from "@/server/services/grade.service";
import {
  createRegrade,
  getRegradeAccess,
  getRegradeForSubmission,
  resolveRegrade,
} from "@/server/services/regrade.service";
import { getSubmissionAccess } from "@/server/services/submission.service";

import { defineHandler } from "./handler";

/** A student asks once, within 7 days of release. The course comes from the submission. */
export const createRegradeHandler = defineHandler(createRegradeSchema, async (ctx, input) => {
  const access = await getSubmissionAccess(ctx.db, input.submissionId, ctx.user.id);
  if (!access) throw new AppError("NOT_FOUND", "Submission not found.");
  const course = courseState(access.course);
  if (!can(access.member, "submission:view", { course, submission: access.submission })) {
    throw new AppError("NOT_FOUND", "Submission not found.");
  }
  const g = await getGradeForStaff(ctx.db, access.submission.id);
  // An unreleased grade does not exist as far as the student is concerned.
  if (!g || g.status !== "RELEASED") throw new AppError("NOT_FOUND", "Grade not found.");
  const existing = await getRegradeForSubmission(ctx.db, access.submission.id);
  authorize(access.member, "regrade:create", {
    course,
    submission: { studentId: access.submission.studentId },
    grade: { status: g.status, releasedAt: g.releasedAt },
    hasExistingRequest: existing !== null,
    now: ctx.now,
  });
  const { regradeId } = await createRegrade(ctx.db, {
    submissionId: access.submission.id,
    studentId: ctx.user.id,
    criterionId: input.criterionId,
    reason: input.reason,
    now: ctx.now,
  });
  return { courseId: access.course.id, assignmentId: access.assignment.id, regradeId };
});

/** Instructor only. The course is resolved from the request's grade. */
export const resolveRegradeHandler = defineHandler(resolveRegradeSchema, async (ctx, input) => {
  const access = await getRegradeAccess(ctx.db, input.regradeId, ctx.user.id);
  if (!access) throw new AppError("NOT_FOUND", "Regrade request not found.");
  const course = courseState(access.course);
  if (!can(access.member, "submission:viewAll", { course })) {
    throw new AppError("NOT_FOUND", "Regrade request not found.");
  }
  authorize(access.member, "regrade:resolve", {
    course,
    regrade: { status: access.regrade.status },
  });
  const result = await resolveRegrade(ctx.db, {
    regradeId: access.regrade.id,
    actorId: ctx.user.id,
    decision: input.decision,
    response: input.response,
    version: input.version,
    changes: input.changes,
    now: ctx.now,
  });
  return { courseId: access.course.id, assignmentId: access.assignmentId, ...result };
});
