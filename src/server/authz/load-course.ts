import "server-only";

import { notFound } from "next/navigation";
import { cache } from "react";

import { courseIdSchema } from "@/lib/validation/course.schema";
import { requireUser } from "@/server/auth/session";
import { db } from "@/server/db";
import { courseState, getCourseAccess } from "@/server/services/course.service";

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
