import type { Metadata } from "next";
import Link from "next/link";

import { AssignmentActions } from "@/components/assignment/assignment-actions";
import { AssignmentStatusBadge } from "@/components/assignment/assignment-status-badge";
import { RubricView } from "@/components/assignment/rubric-view";
import { LocalDateTime } from "@/components/common/local-date-time";
import { Button } from "@/components/ui/button";
import {
  closeAssignmentAction,
  deleteAssignmentAction,
  publishAssignmentAction,
} from "@/server/actions/assignment.actions";
import { loadAssignmentForMember } from "@/server/authz/load-course";
import { can } from "@/server/authz/policy";
import { db } from "@/server/db";
import { getRubric, hasSubmissions } from "@/server/services/assignment.service";

type Props = PageProps<"/courses/[courseId]/assignments/[assignmentId]">;

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { courseId, assignmentId } = await params;
  const { assignment } = await loadAssignmentForMember(courseId, assignmentId);
  return { title: assignment.title };
}

export default async function AssignmentPage({ params }: Props) {
  const { courseId, assignmentId } = await params;
  const { member, state, assignment } = await loadAssignmentForMember(courseId, assignmentId);
  const status = { status: assignment.status };
  const canUpdate = can(member, "assignment:update", { course: state, assignment: status });
  const [criteria, submitted] = await Promise.all([
    getRubric(db, assignment.id),
    canUpdate ? hasSubmissions(db, assignment.id) : false,
  ]);
  const canEditRubric = can(member, "rubric:edit", { course: state, assignment: status });
  const canDelete = can(member, "assignment:delete", {
    course: state,
    assignment: { ...status, hasSubmissions: submitted },
  });
  const base = `/courses/${courseId}/assignments/${assignment.id}`;

  return (
    <article aria-labelledby="assignment-heading" className="grid gap-6">
      <header className="grid gap-3">
        <div className="flex flex-wrap items-center gap-2">
          <h2 id="assignment-heading" className="text-xl font-semibold break-words">
            {assignment.title}
          </h2>
          <AssignmentStatusBadge status={assignment.status} />
        </div>
        <p className="text-sm text-muted-foreground">
          Due <LocalDateTime iso={assignment.dueAt.toISOString()} /> ·{" "}
          {assignment.allowLate ? "Late submissions accepted" : "No late submissions"} ·{" "}
          {assignment.maxScore} points
        </p>
        {canUpdate ? (
          <div className="flex flex-wrap gap-2">
            {assignment.status !== "CLOSED" ? (
              <Button asChild variant="outline" size="lg">
                <Link href={`${base}/edit`}>Edit details</Link>
              </Button>
            ) : null}
            {canEditRubric ? (
              <Button asChild variant="outline" size="lg">
                <Link href={`${base}/rubric`}>
                  {criteria.length ? "Edit rubric" : "Build rubric"}
                </Link>
              </Button>
            ) : null}
            <AssignmentActions
              courseId={courseId}
              assignmentId={assignment.id}
              status={assignment.status}
              canDelete={canDelete}
              hasRubric={criteria.length > 0}
              publishAction={publishAssignmentAction}
              closeAction={closeAssignmentAction}
              deleteAction={deleteAssignmentAction}
            />
          </div>
        ) : null}
        {canUpdate && assignment.status === "DRAFT" && !criteria.length ? (
          <p className="text-sm text-muted-foreground">Build a rubric before publishing.</p>
        ) : null}
      </header>

      <section aria-labelledby="instructions-heading" className="grid gap-2">
        <h3 id="instructions-heading" className="font-medium">
          Instructions
        </h3>
        <p className="whitespace-pre-wrap">
          {assignment.instructions || (
            <span className="text-muted-foreground">No instructions.</span>
          )}
        </p>
      </section>

      <section aria-labelledby="rubric-view-heading" className="grid gap-3">
        <h3 id="rubric-view-heading" className="font-medium">
          Rubric
        </h3>
        <RubricView criteria={criteria} maxScore={assignment.maxScore} />
      </section>
    </article>
  );
}
