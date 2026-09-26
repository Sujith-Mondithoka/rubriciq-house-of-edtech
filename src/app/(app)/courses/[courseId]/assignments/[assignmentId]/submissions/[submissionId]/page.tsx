import type { Metadata } from "next";
import Link from "next/link";

import { LocalDateTime } from "@/components/common/local-date-time";
import { GradeView } from "@/components/grading/grade-view";
import { GraderPanel } from "@/components/grading/grader-panel";
import { QueueStatusBadge } from "@/components/grading/queue-status-badge";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { releaseGradesAction, saveGradeAction } from "@/server/actions/grade.actions";
import { loadSubmissionForGrading } from "@/server/authz/load-course";
import { can } from "@/server/authz/policy";
import { db } from "@/server/db";
import { getRubric } from "@/server/services/assignment.service";
import { getGradeForStaff } from "@/server/services/grade.service";
import { getUserName } from "@/server/services/user.service";

type Props = PageProps<"/courses/[courseId]/assignments/[assignmentId]/submissions/[submissionId]">;

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { courseId, assignmentId, submissionId } = await params;
  const { assignment } = await loadSubmissionForGrading(courseId, assignmentId, submissionId);
  return { title: `Grade: ${assignment.title}` };
}

export default async function GraderPage({ params }: Props) {
  const { courseId, assignmentId, submissionId } = await params;
  const { member, state, assignment, submission } = await loadSubmissionForGrading(
    courseId,
    assignmentId,
    submissionId,
  );
  const [criteria, grade, studentName] = await Promise.all([
    getRubric(db, assignment.id),
    getGradeForStaff(db, submission.id),
    getUserName(db, submission.studentId),
  ]);
  const gradeState = grade ? { status: grade.status } : null;
  const canSave = can(member, "grade:save", { course: state, grade: gradeState });
  const canRelease = can(member, "grade:release", {
    course: state,
    grade: { status: grade?.status ?? "DRAFT" },
  });
  const queueHref = `/courses/${courseId}/assignments/${assignment.id}/submissions`;
  const status =
    grade?.status === "RELEASED"
      ? "RELEASED"
      : grade?.gradedBy
        ? "REVIEWED"
        : grade
          ? "AI_DRAFTED"
          : "SUBMITTED";

  return (
    <div className="grid gap-6">
      <header className="grid gap-2">
        <Link
          href={queueHref}
          className="text-sm text-muted-foreground underline-offset-4 hover:underline"
        >
          ← Grading queue
        </Link>
        <div className="flex flex-wrap items-center gap-2">
          <h2 className="text-xl font-semibold break-words">{studentName ?? "Student"}</h2>
          <QueueStatusBadge status={status} />
        </div>
        <p className="text-sm text-muted-foreground">
          {assignment.title} ·{" "}
          {submission.submittedAt ? (
            <>
              {submission.isLate ? "Submitted late" : "Submitted"}{" "}
              <LocalDateTime iso={submission.submittedAt.toISOString()} />
            </>
          ) : null}{" "}
          · {submission.wordCount} words
        </p>
      </header>

      <div className="grid gap-6 lg:grid-cols-2 lg:items-start">
        <section
          aria-labelledby="student-work-heading"
          className="grid gap-2 lg:sticky lg:top-4 lg:max-h-[calc(100vh-2rem)] lg:overflow-y-auto"
        >
          <h3 id="student-work-heading" className="font-medium">
            Student&apos;s answer
          </h3>
          <div className="rounded-xl border p-4 font-serif leading-relaxed break-words whitespace-pre-wrap">
            {submission.content}
          </div>
        </section>

        <section aria-labelledby="grade-heading" className="grid gap-3">
          <h3 id="grade-heading" className="font-medium">
            Grade
          </h3>
          {grade?.status === "RELEASED" ? (
            <>
              <Alert>
                <AlertDescription>
                  This grade is released. It can only change through a regrade request.
                </AlertDescription>
              </Alert>
              <GradeView
                criteria={criteria}
                grade={grade}
                maxScore={assignment.maxScore}
                headingLevel="h4"
              />
            </>
          ) : canSave ? (
            <GraderPanel
              submissionId={submission.id}
              assignmentId={assignment.id}
              criteria={criteria}
              maxScore={assignment.maxScore}
              initial={{
                version: grade?.version ?? 0,
                reviewed: Boolean(grade?.gradedBy),
                overallFeedback: grade?.overallFeedback ?? "",
                scores: grade?.scores ?? [],
              }}
              canRelease={canRelease}
              saveAction={saveGradeAction}
              releaseAction={releaseGradesAction}
            />
          ) : (
            <Alert>
              <AlertDescription>
                {state.archived
                  ? "This course is archived, so grades can no longer change."
                  : "You cannot grade this submission."}
              </AlertDescription>
            </Alert>
          )}
        </section>
      </div>
    </div>
  );
}
