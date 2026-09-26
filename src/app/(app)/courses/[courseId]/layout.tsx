import Link from "next/link";

import { CourseNav } from "@/components/course/course-nav";
import { ArchivedBadge, RoleBadge } from "@/components/course/role-badge";
import { loadCourseForMember } from "@/server/authz/load-course";
import { can } from "@/server/authz/policy";

export default async function CourseLayout({
  children,
  params,
}: LayoutProps<"/courses/[courseId]">) {
  const { courseId } = await params;
  const { course, member, state } = await loadCourseForMember(courseId);

  return (
    <div className="grid gap-6">
      <div className="grid gap-3">
        <Link
          href="/dashboard"
          className="text-sm text-muted-foreground underline-offset-4 hover:underline"
        >
          ← All courses
        </Link>
        <div className="flex flex-wrap items-center gap-2">
          <h1 className="text-2xl font-semibold tracking-tight break-words">{course.name}</h1>
          <RoleBadge role={member.role} />
          {state.archived ? <ArchivedBadge /> : null}
        </div>
        <CourseNav
          courseId={course.id}
          showMembers={can(member, "course:viewMembers", { course: state })}
          showSettings={member.role === "INSTRUCTOR"}
        />
      </div>
      {children}
    </div>
  );
}
