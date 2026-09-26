import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";

import { AssignmentForm } from "@/components/assignment/assignment-form";
import { updateAssignmentAction } from "@/server/actions/assignment.actions";
import { loadAssignmentForMember } from "@/server/authz/load-course";
import { can } from "@/server/authz/policy";

export const metadata: Metadata = { title: "Edit assignment" };

export default async function EditAssignmentPage({
  params,
}: PageProps<"/courses/[courseId]/assignments/[assignmentId]/edit">) {
  const { courseId, assignmentId } = await params;
  const { member, state, assignment } = await loadAssignmentForMember(courseId, assignmentId);
  const resource = { course: state, assignment: { status: assignment.status } };
  if (!can(member, "assignment:update", resource) || assignment.status === "CLOSED") notFound();

  return (
    <section aria-labelledby="edit-assignment-heading" className="grid max-w-2xl gap-4">
      <Link
        href={`/courses/${courseId}/assignments/${assignment.id}`}
        className="text-sm text-muted-foreground underline-offset-4 hover:underline"
      >
        ← Back to the assignment
      </Link>
      <h2 id="edit-assignment-heading" className="text-lg font-medium">
        Edit {assignment.title}
      </h2>
      <AssignmentForm
        mode="edit"
        assignmentId={assignment.id}
        defaults={{
          title: assignment.title,
          instructions: assignment.instructions,
          dueAt: assignment.dueAt.toISOString(),
          allowLate: assignment.allowLate,
        }}
        action={updateAssignmentAction}
      />
    </section>
  );
}
