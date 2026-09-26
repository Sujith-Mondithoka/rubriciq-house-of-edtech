import type { Metadata } from "next";
import Link from "next/link";

import { AssignmentActions } from "@/components/assignment/assignment-actions";
import { AssignmentStatusBadge } from "@/components/assignment/assignment-status-badge";
import { RubricView } from "@/components/assignment/rubric-view";
import { LocalDateTime } from "@/components/common/local-date-time";
import { AiNotice } from "@/components/course/ai-notice";
import { GradeView } from "@/components/grading/grade-view";
import { RegradeRequestForm } from "@/components/regrade/regrade-request-form";
import { RegradeStatus } from "@/components/regrade/regrade-status";
import { SubmissionEditor } from "@/components/submission/submission-editor";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { isLate } from "@/lib/dates";
import {
  closeAssignmentAction,
  deleteAssignmentAction,
  publishAssignmentAction,
} from "@/server/actions/assignment.actions";
import { createRegradeAction } from "@/server/actions/regrade.actions";
import {
  deleteDraftAction,
  saveDraftAction,
  submitAction,
} from "@/server/actions/submission.actions";
import { loadAssignmentForMember } from "@/server/authz/load-course";
import { can, isStaff } from "@/server/authz/policy";
import { db } from "@/server/db";
import { getRubric } from "@/server/services/assignment.service";
import { getReleasedGrade, hasGrade } from "@/server/services/grade.service";
import {
  countRegrades,
  getRegradeForSubmission,
  regradeDeadline,
} from "@/server/services/regrade.service";
import { countSubmissions, getOwnSubmission } from "@/server/services/submission.service";

type Props = PageProps<"/courses/[courseId]/assignments/[assignmentId]">;

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { courseId, assignmentId } = await params;
  const { assignment } = await loadAssignmentForMember(courseId, assignmentId);
  return { title: assignment.title };
}

export default async function AssignmentPage({ params }: Props) {
  const { courseId, assignmentId } = await params;
  const { user, member, state, course, assignment } = await loadAssignmentForMember(
    courseId,
    assignmentId,
  );
  const staff = isStaff(member.role);
  const now = new Date();
  const status = { status: assignment.status };
  const [criteria, counts, own] = await Promise.all([
    getRubric(db, assignment.id),
    staff ? countSubmissions(db, [assignment.id]) : null,
    staff ? null : getOwnSubmission(db, assignment.id, user.id),
  ]);
  const summary = counts?.get(assignment.id) ?? { submitted: 0, late: 0, drafts: 0 };
  const regradeCounts =
    staff && assignment.status !== "DRAFT" ? await countRegrades(db, assignment.id) : null;
  // The student sees a grade only once it is released; a draft grade just freezes their work.
  const ownSubmitted = own?.status === "SUBMITTED" ? own : null;
  const [released, gradingStarted] = ownSubmitted
    ? await Promise.all([getReleasedGrade(db, ownSubmitted.id), hasGrade(db, ownSubmitted.id)])
    : [null, false];
  const canViewGrade =
    released !== null &&
    can(member, "grade:view", {
      course: state,
      submission: { studentId: user.id },
      grade: { status: "RELEASED" },
    });
  const regrade =
    canViewGrade && ownSubmitted ? await getRegradeForSubmission(db, ownSubmitted.id) : null;
  const canRequestRegrade =
    canViewGrade &&
    released !== null &&
    can(member, "regrade:create", {
      course: state,
      submission: { studentId: user.id },
      grade: { status: "RELEASED", releasedAt: released.releasedAt },
      hasExistingRequest: regrade !== null,
      now,
    });
  const regradeClosesAt = released?.releasedAt ? regradeDeadline(released.releasedAt) : null;

  const canUpdate = can(member, "assignment:update", { course: state, assignment: status });
  const canEditRubric = can(member, "rubric:edit", { course: state, assignment: status });
  const canDelete = can(member, "assignment:delete", {
    course: state,
    assignment: { ...status, hasSubmissions: summary.submitted + summary.drafts > 0 },
  });
  const canWrite =
    !gradingStarted &&
    can(member, "submission:write", {
      course: state,
      assignment: { ...status, dueAt: assignment.dueAt, allowLate: assignment.allowLate },
      submission: own ? { studentId: user.id } : null,
      now,
    });
  const pastDue = isLate(now, assignment.dueAt);
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

      {staff && assignment.status !== "DRAFT" ? (
        <section aria-labelledby="submissions-summary-heading" className="grid gap-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h3 id="submissions-summary-heading" className="font-medium">
              Submissions
            </h3>
            <div className="flex flex-wrap gap-2">
              <Button asChild size="lg">
                <Link href={`${base}/submissions`}>Open grading queue</Link>
              </Button>
              <Button asChild size="lg" variant="outline">
                <Link href={`${base}/regrades`}>
                  Regrade requests ({regradeCounts?.OPEN ?? 0} open)
                </Link>
              </Button>
            </div>
          </div>
          <dl className="grid grid-cols-3 gap-3 text-center">
            {(
              [
                ["Submitted", summary.submitted],
                ["Late", summary.late],
                ["Drafts in progress", summary.drafts],
              ] as const
            ).map(([label, n]) => (
              <div key={label} className="rounded-lg bg-muted/50 p-3">
                <dt className="text-sm text-muted-foreground">{label}</dt>
                <dd className="text-2xl font-semibold">{n}</dd>
              </div>
            ))}
          </dl>
        </section>
      ) : null}

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

      {!staff && ownSubmitted ? (
        <section aria-labelledby="grade-heading" className="grid gap-3">
          <h3 id="grade-heading" className="text-lg font-medium">
            Your grade
          </h3>
          {canViewGrade && released ? (
            <>
              <GradeView criteria={criteria} grade={released} maxScore={assignment.maxScore} />
              {regrade ? (
                <RegradeStatus
                  regrade={regrade}
                  criterionTitle={criteria.find((c) => c.id === regrade.criterionId)?.title ?? null}
                  audience="student"
                />
              ) : canRequestRegrade && ownSubmitted ? (
                <div className="grid gap-2">
                  <h4 className="font-medium">Disagree with a score?</h4>
                  <p className="text-sm text-muted-foreground">
                    You can ask for one regrade
                    {regradeClosesAt ? (
                      <>
                        {" "}
                        until <LocalDateTime iso={regradeClosesAt.toISOString()} />
                      </>
                    ) : null}
                    .
                  </p>
                  <RegradeRequestForm
                    submissionId={ownSubmitted.id}
                    criteria={criteria.map((c) => ({ id: c.id, title: c.title }))}
                    action={createRegradeAction}
                  />
                </div>
              ) : regradeClosesAt && now > regradeClosesAt ? (
                <p className="text-sm text-muted-foreground">
                  The regrade window closed on <LocalDateTime iso={regradeClosesAt.toISOString()} />
                  .
                </p>
              ) : null}
            </>
          ) : (
            <p className="rounded-xl border border-dashed p-4 text-sm text-muted-foreground">
              Not released yet. Your grade and feedback appear here once your teacher releases them.
            </p>
          )}
        </section>
      ) : null}

      {!staff ? (
        <section aria-labelledby="submission-heading" className="grid gap-4">
          <h3 id="submission-heading" className="text-lg font-medium">
            Your submission
          </h3>
          <AiNotice aiEnabled={course.aiEnabled} />
          {canWrite ? (
            <>
              {pastDue ? (
                <Alert>
                  <AlertDescription>
                    The deadline has passed. You can still submit, but it will be marked late.
                  </AlertDescription>
                </Alert>
              ) : null}
              <SubmissionEditor
                assignmentId={assignment.id}
                dueAt={assignment.dueAt}
                initial={own}
                saveAction={saveDraftAction}
                submitAction={submitAction}
                deleteAction={deleteDraftAction}
              />
            </>
          ) : (
            <ReadOnlySubmission
              own={own}
              reason={
                state.archived
                  ? "This course is archived."
                  : assignment.status === "CLOSED"
                    ? "This assignment is closed."
                    : gradingStarted
                      ? "Grading has started."
                      : "The deadline has passed."
              }
            />
          )}
        </section>
      ) : null}
    </article>
  );
}

function ReadOnlySubmission({
  own,
  reason,
}: {
  own: Awaited<ReturnType<typeof getOwnSubmission>>;
  reason: string;
}) {
  const submitted = own?.status === "SUBMITTED";
  return (
    <div className="grid gap-3">
      <Alert>
        <AlertDescription>
          {reason}{" "}
          {submitted
            ? "Your submission can no longer be changed."
            : "Submissions are no longer accepted."}
        </AlertDescription>
      </Alert>
      {submitted && own.submittedAt ? (
        <>
          <p className="text-sm text-muted-foreground">
            {own.isLate ? "Submitted late" : "Submitted"} on{" "}
            <LocalDateTime iso={own.submittedAt.toISOString()} /> · {own.wordCount} words
          </p>
          <div className="rounded-xl border p-4 font-serif leading-relaxed whitespace-pre-wrap">
            {own.content}
          </div>
        </>
      ) : (
        <p className="text-sm text-muted-foreground">You did not submit this assignment.</p>
      )}
    </div>
  );
}
