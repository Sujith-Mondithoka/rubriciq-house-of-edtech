import { AppError } from "@/lib/errors";
import { releaseGradesSchema, saveGradeSchema } from "@/lib/validation/grade.schema";
import { authorize } from "@/server/authz/authorize";
import { can } from "@/server/authz/policy";
import { getAssignmentAccess } from "@/server/services/assignment.service";
import { courseState } from "@/server/services/course.service";
import { getGradeForStaff, releaseGrades, saveGrade } from "@/server/services/grade.service";
import { getSubmissionAccess } from "@/server/services/submission.service";

import { defineHandler } from "./handler";

/** The course is resolved from the submission, never from the client. */
export const saveGradeHandler = defineHandler(saveGradeSchema, async (ctx, input) => {
  const access = await getSubmissionAccess(ctx.db, input.submissionId, ctx.user.id);
  if (!access) throw new AppError("NOT_FOUND", "Submission not found.");
  const course = courseState(access.course);
  // Other people's submissions are "not found", not "forbidden".
  if (!can(access.member, "submission:view", { course, submission: access.submission })) {
    throw new AppError("NOT_FOUND", "Submission not found.");
  }
  const current = await getGradeForStaff(ctx.db, access.submission.id);
  authorize(access.member, "grade:save", {
    course,
    grade: current ? { status: current.status } : null,
  });
  const saved = await saveGrade(ctx.db, {
    submissionId: access.submission.id,
    actorId: ctx.user.id,
    version: input.version,
    overallFeedback: input.overallFeedback,
    scores: input.scores,
  });
  return {
    courseId: access.course.id,
    assignmentId: access.assignment.id,
    submissionId: access.submission.id,
    ...saved,
  };
});

/** One or many grades; the service releases all of them or none. */
export const releaseGradesHandler = defineHandler(releaseGradesSchema, async (ctx, input) => {
  const access = await getAssignmentAccess(ctx.db, input.assignmentId, ctx.user.id);
  if (!access) throw new AppError("NOT_FOUND", "Assignment not found.");
  const course = courseState(access.course);
  if (!can(access.member, "submission:viewAll", { course })) {
    throw new AppError("NOT_FOUND", "Assignment not found.");
  }
  // Per-grade state (draft, reviewed, complete, version) is checked under row locks.
  authorize(access.member, "grade:release", { course, grade: { status: "DRAFT" } });
  const { released } = await releaseGrades(ctx.db, {
    actorId: ctx.user.id,
    assignmentId: access.assignment.id,
    grades: input.grades,
    now: ctx.now,
  });
  return { courseId: access.course.id, assignmentId: access.assignment.id, released };
});
