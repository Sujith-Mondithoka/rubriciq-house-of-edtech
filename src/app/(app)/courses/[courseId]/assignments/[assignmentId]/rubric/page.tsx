import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";

import { RubricBuilderLazy } from "@/components/assignment/rubric-builder-lazy";
import { saveRubricAction } from "@/server/actions/assignment.actions";
import { loadAssignmentForMember } from "@/server/authz/load-course";
import { can } from "@/server/authz/policy";
import { db } from "@/server/db";
import { getRubric } from "@/server/services/assignment.service";

export const metadata: Metadata = { title: "Rubric builder" };

export default async function RubricPage({
  params,
}: PageProps<"/courses/[courseId]/assignments/[assignmentId]/rubric">) {
  const { courseId, assignmentId } = await params;
  const { member, state, assignment } = await loadAssignmentForMember(courseId, assignmentId);
  if (!can(member, "rubric:edit", { course: state, assignment: { status: assignment.status } })) {
    notFound();
  }
  const criteria = await getRubric(db, assignment.id);

  return (
    <section aria-labelledby="rubric-heading" className="grid max-w-3xl gap-4">
      <Link
        href={`/courses/${courseId}/assignments/${assignment.id}`}
        className="text-sm text-muted-foreground underline-offset-4 hover:underline"
      >
        ← Back to the assignment
      </Link>
      <div className="grid gap-1">
        <h2 id="rubric-heading" className="text-lg font-medium break-words">
          Rubric for {assignment.title}
        </h2>
        <p className="text-sm text-muted-foreground">
          Add the criteria you will grade on and the levels for each. The rubric locks when you
          publish the assignment.
        </p>
      </div>
      <RubricBuilderLazy
        courseId={courseId}
        assignmentId={assignment.id}
        initialCriteria={criteria.map((c) => ({
          title: c.title,
          description: c.description,
          levels: c.levels.map((l) => ({
            label: l.label,
            points: l.points,
            descriptor: l.descriptor,
          })),
        }))}
        action={saveRubricAction}
      />
    </section>
  );
}
