import type { Metadata } from "next";
import Link from "next/link";

import { LocalDateTime } from "@/components/common/local-date-time";
import { AiDraftButton } from "@/components/grading/ai-draft-button";
import { aiFailureReason } from "@/components/grading/ai-run-status";
import { AutoRefresh } from "@/components/grading/auto-refresh";
import { GradeView } from "@/components/grading/grade-view";
import { GraderPanel } from "@/components/grading/grader-panel";
import { QueueStatusBadge } from "@/components/grading/queue-status-badge";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { highlightSegments } from "@/lib/highlight";
import { generateAiDraftsAction } from "@/server/actions/ai.actions";
import { releaseGradesAction, saveGradeAction } from "@/server/actions/grade.actions";
import { aiConfig } from "@/server/ai/provider";
import { loadSubmissionForGrading } from "@/server/authz/load-course";
import { can } from "@/server/authz/policy";
import { db } from "@/server/db";
import { getLatestRuns, sweepStaleRuns } from "@/server/services/ai.service";
import { getRubric } from "@/server/services/assignment.service";
import { getGradeForStaff } from "@/server/services/grade.service";
import { getUserName } from "@/server/services/user.service";

/** AI drafts started here run after the response (`after()`), within this limit. */
export const maxDuration = 300;

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
  // Lost AI runs (PENDING > 5 min) become FAILED before anything is shown.
  await sweepStaleRuns(db, assignment.id, new Date());
  const [criteria, grade, studentName, runs] = await Promise.all([
    getRubric(db, assignment.id),
    getGradeForStaff(db, submission.id),
    getUserName(db, submission.studentId),
    getLatestRuns(db, [submission.id]),
  ]);
  const run = runs.get(submission.id);
  const gradeState = grade ? { status: grade.status } : null;
  const canSave = can(member, "grade:save", { course: state, grade: gradeState });
  const canRelease = can(member, "grade:release", {
    course: state,
    grade: { status: grade?.status ?? "DRAFT" },
  });
  // AI is offered only when configured, on for the course, and nobody has graded by hand yet.
  const canUseAi =
    aiConfig.available && can(member, "ai:run", { course: state }) && canSave && !grade?.gradedBy;
  const queueHref = `/courses/${courseId}/assignments/${assignment.id}/submissions`;
  const status =
    grade?.status === "RELEASED"
      ? "RELEASED"
      : grade?.gradedBy
        ? "REVIEWED"
        : grade
          ? "AI_DRAFTED"
          : "SUBMITTED";
  const evidence = grade?.scores.flatMap((s) => (s.source !== "HUMAN" ? (s.aiEvidence ?? []) : []));

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
            {highlightSegments(submission.content, evidence ?? []).map((segment, i) =>
              segment.highlighted ? (
                <mark key={i} className="rounded-sm bg-amber-200/70 px-0.5 dark:bg-amber-500/30">
                  {segment.text}
                </mark>
              ) : (
                segment.text
              ),
            )}
          </div>
          {evidence?.length ? (
            <p className="text-sm text-muted-foreground">
              Highlighted: passages the AI quoted as evidence.
            </p>
          ) : null}
        </section>

        <section aria-labelledby="grade-heading" className="grid gap-3">
          <h3 id="grade-heading" className="font-medium">
            Grade
          </h3>

          {canUseAi && run?.status === "PENDING" ? (
            <Alert>
              <AlertTitle>AI is drafting this grade…</AlertTitle>
              <AlertDescription>
                <AutoRefresh label="This page updates when the draft is ready. You can also grade manually." />
              </AlertDescription>
            </Alert>
          ) : null}
          {canUseAi && run?.status === "FAILED" ? (
            <Alert>
              <AlertTitle>AI draft failed: retry or grade manually</AlertTitle>
              <AlertDescription className="grid gap-3">
                <p>The draft failed because {aiFailureReason(run.errorCode)}.</p>
                <AiDraftButton
                  assignmentId={assignment.id}
                  submissionIds={[submission.id]}
                  label="Retry AI draft"
                  action={generateAiDraftsAction}
                />
              </AlertDescription>
            </Alert>
          ) : null}
          {canUseAi && !grade && run?.status !== "PENDING" && run?.status !== "FAILED" ? (
            <div className="flex flex-wrap items-center gap-3 rounded-xl border border-dashed p-3">
              <AiDraftButton
                assignmentId={assignment.id}
                submissionIds={[submission.id]}
                label="Generate AI draft"
                action={generateAiDraftsAction}
              />
              <p className="text-sm text-muted-foreground">
                Optional. You review and can change every suggestion.
              </p>
            </div>
          ) : null}

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
              // A new version (e.g. an AI draft arriving) remounts the form with fresh values.
              key={grade?.version ?? 0}
              submissionId={submission.id}
              assignmentId={assignment.id}
              criteria={criteria}
              maxScore={assignment.maxScore}
              initial={{
                version: grade?.version ?? 0,
                reviewed: Boolean(grade?.gradedBy),
                overallFeedback: grade?.overallFeedback ?? "",
                scores: (grade?.scores ?? []).map((s) => ({
                  criterionId: s.criterionId,
                  levelId: s.levelId,
                  feedback: s.feedback,
                  ai: {
                    source: s.source,
                    confidence: s.aiConfidence,
                    evidence: s.aiEvidence ?? [],
                  },
                })),
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
