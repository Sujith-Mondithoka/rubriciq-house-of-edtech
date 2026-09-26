import "server-only";

import { notFound } from "next/navigation";
import { cache } from "react";

import { assignmentIdSchema } from "@/lib/validation/assignment.schema";
import { courseIdSchema } from "@/lib/validation/course.schema";
import { submissionIdSchema } from "@/lib/validation/grade.schema";
import { requireUser } from "@/server/auth/session";
import { db } from "@/server/db";
import { getAssignmentAccess } from "@/server/services/assignment.service";
import { courseState, getCourseAccess } from "@/server/services/course.service";
import { getSubmissionAccess } from "@/server/services/submission.service";

import { can, type Member } from "./policy";

/**
 * For course pages and layouts: the signed-in member's view of a course, memoised per
 * render. Invalid ids, unknown courses and non-members all get the same 404.
 */
export const loadCourseForMember = cache(async (courseId: string) => {
  const user = await requireUser();
  const id = courseIdSchema.safeParse(courseId);
  if (!id.success) notFound();

  const access = await getCourseAccess(db, id.data, user.id);
  if (!access) notFound();
  const state = courseState(access.course);
  if (!can(access.member, "course:view", { course: state })) notFound();

  return { user, course: access.course, member: access.member as Member, state };
});

/**
 * For assignment pages: the course is resolved from the assignment, and the URL's course id
 * must match it. Students get the same 404 for drafts as for missing assignments.
 */
export const loadAssignmentForMember = cache(async (courseId: string, assignmentId: string) => {
  const ctx = await loadCourseForMember(courseId);
  const id = assignmentIdSchema.safeParse(assignmentId);
  if (!id.success) notFound();

  const access = await getAssignmentAccess(db, id.data, ctx.user.id);
  if (!access || access.course.id !== ctx.course.id) notFound();
  const { status } = access.assignment;
  if (!can(ctx.member, "assignment:view", { course: ctx.state, assignment: { status } })) {
    notFound();
  }
  return { ...ctx, assignment: access.assignment };
});

/**
 * For the grading pages: staff only. The submission must belong to the assignment in the URL;
 * anyone else (students included) gets the same 404.
 */
export const loadAssignmentForGrading = cache(async (courseId: string, assignmentId: string) => {
  const ctx = await loadAssignmentForMember(courseId, assignmentId);
  if (!can(ctx.member, "submission:viewAll", { course: ctx.state })) notFound();
  return ctx;
});

export const loadSubmissionForGrading = cache(
  async (courseId: string, assignmentId: string, submissionId: string) => {
    const ctx = await loadAssignmentForGrading(courseId, assignmentId);
    const id = submissionIdSchema.safeParse(submissionId);
    if (!id.success) notFound();
    const access = await getSubmissionAccess(db, id.data, ctx.user.id);
    if (!access || access.assignment.id !== ctx.assignment.id) notFound();
    // Unsubmitted drafts are the student's work in progress, not something to grade.
    if (access.submission.status !== "SUBMITTED") notFound();
    return { ...ctx, submission: access.submission };
  },
);
