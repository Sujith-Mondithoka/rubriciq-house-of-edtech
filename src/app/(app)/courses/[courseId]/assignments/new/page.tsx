import type { Metadata } from "next";
import { notFound } from "next/navigation";

import { AssignmentForm } from "@/components/assignment/assignment-form";
import { createAssignmentAction } from "@/server/actions/assignment.actions";
import { loadCourseForMember } from "@/server/authz/load-course";
import { can } from "@/server/authz/policy";

export const metadata: Metadata = { title: "New assignment" };

export default async function NewAssignmentPage({
  params,
}: PageProps<"/courses/[courseId]/assignments/new">) {
  const { course, member, state } = await loadCourseForMember((await params).courseId);
  if (!can(member, "assignment:create", { course: state })) notFound();

  return (
    <section aria-labelledby="new-assignment-heading" className="grid max-w-2xl gap-4">
      <div className="grid gap-1">
        <h2 id="new-assignment-heading" className="text-lg font-medium">
          New assignment
        </h2>
        <p className="text-sm text-muted-foreground">
          It starts as a draft. Next you will build its rubric, then publish it.
        </p>
      </div>
      <AssignmentForm mode="create" courseId={course.id} action={createAssignmentAction} />
    </section>
  );
}
