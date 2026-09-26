import type { Metadata } from "next";
import Link from "next/link";

import { LocalDateTime } from "@/components/common/local-date-time";
import { AiDraftButton } from "@/components/grading/ai-draft-button";
import { aiFailureReason } from "@/components/grading/ai-run-status";
import { AutoRefresh } from "@/components/grading/auto-refresh";
import { GradeHistory } from "@/components/grading/grade-history";
import { GradeView } from "@/components/grading/grade-view";
import { RegradeStatus } from "@/components/regrade/regrade-status";
import { ResolveRegradeForm } from "@/components/regrade/resolve-regrade-form";
import { GraderPanel } from "@/components/grading/grader-panel";
import { QueueStatusBadge } from "@/components/grading/queue-status-badge";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { highlightSegments } from "@/lib/highlight";
import { generateAiDraftsAction } from "@/server/actions/ai.actions";
import { releaseGradesAction, saveGradeAction } from "@/server/actions/grade.actions";
import { resolveRegradeAction } from "@/server/actions/regrade.actions";
import { aiConfig } from "@/server/ai/provider";
import { loadSubmissionForGrading } from "@/server/authz/load-course";
import { can } from "@/server/authz/policy";
import { db } from "@/server/db";
import { getAiSuggestedLevels, getLatestRuns, sweepStaleRuns } from "@/server/services/ai.service";
import { getRubric } from "@/server/services/assignment.service";
import { getGradeForStaff } from "@/server/services/grade.service";
import { getGradeHistory, getRegradeForSubmission } from "@/server/services/regrade.service";
import { getUserName } from "@/server/services/user.service";

/** AI drafts started here run after the response (`after()`), within this limit. */
export const maxDuration = 300;

type Props = PageProps<"/courses/[courseId]/assignments/[assignmentId]/submissions/[submissionId]">;

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { courseId, assignmentId, submissionId } = await params;
  const { assignment } = await loadSubmissionForGrading(courseId, assignmentId, submissionId);
  return { title: `Grade: ${assignment.title}` };
}

function initials(name: string) {
  const parts = name
    .replace(/\(.*?\)/g, "")
    .trim()
    .split(/\s+/);
  return ((parts[0]?.[0] ?? "") + (parts[1]?.[0] ?? "")).toUpperCase() || "?";
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
  const suggested = grade
    ? await getAiSuggestedLevels(db, submission.id)
    : new Map<string, string>();
  const regrade = grade ? await getRegradeForSubmission(db, submission.id) : null;
  const history = grade ? await getGradeHistory(db, grade.id, regrade?.id ?? null) : [];
  const canResolve = regrade !== null && can(member, "regrade:resolve", { course: state, regrade });
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
      <header className="grid gap-3">
        <Link
          href={queueHref}
          className="w-fit text-sm text-muted-foreground underline-offset-4 hover:text-foreground hover:underline"
        >
          ← Grading queue
        </Link>
        <div className="flex flex-wrap items-center gap-3">
          <span
            aria-hidden
            className="grid size-10 place-items-center rounded-full bg-accent text-sm font-semibold text-accent-foreground"
          >
            {initials(studentName ?? "Student")}
          </span>
          <div className="grid gap-0.5">
            <div className="flex flex-wrap items-center gap-2">
              <h2 className="page-title break-words">{studentName ?? "Student"}</h2>
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
          </div>
        </div>
      </header>

      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.1fr)] lg:items-start">
        <section
          aria-labelledby="student-work-heading"
          // Scrollable on large screens, so it must be reachable with the keyboard.
          tabIndex={0}
          className="card-surface grid gap-0 overflow-hidden outline-none focus-visible:ring-3 focus-visible:ring-ring/50 lg:sticky lg:top-20 lg:max-h-[calc(100vh-6rem)] lg:overflow-y-auto"
        >
          <div className="sticky top-0 flex items-center justify-between gap-2 border-b bg-card/95 px-5 py-3 backdrop-blur">
            <h3 id="student-work-heading" className="font-semibold">
              Student&apos;s answer
            </h3>
            {evidence?.length ? (
              <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
                <span
                  aria-hidden
                  className="inline-block h-3 w-4 rounded-[3px] border-b-2 border-primary/60 bg-[var(--highlight)]"
                />
                Highlighted: passages the AI quoted as evidence.
              </p>
            ) : null}
          </div>
          <div className="px-5 py-4 font-serif text-[15px] leading-7 break-words whitespace-pre-wrap">
            {highlightSegments(submission.content, evidence ?? []).map((segment, i) =>
              segment.highlighted ? <mark key={i}>{segment.text}</mark> : segment.text,
            )}
          </div>
        </section>

        <section aria-labelledby="grade-heading" className="grid gap-4">
          <h3 id="grade-heading" className="section-title">
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
              {regrade ? (
                <RegradeStatus
                  regrade={regrade}
                  criterionTitle={criteria.find((c) => c.id === regrade.criterionId)?.title ?? null}
                  audience="staff"
                />
              ) : null}
              {regrade && canResolve ? (
                <ResolveRegradeForm
                  key={grade.version}
                  regradeId={regrade.id}
                  version={grade.version}
                  criteria={criteria}
                  current={Object.fromEntries(
                    criteria.map((c) => [
                      c.id,
                      grade.scores.find((s) => s.criterionId === c.id)?.levelId ?? null,
                    ]),
                  )}
                  focusCriterionId={regrade.criterionId}
                  maxScore={assignment.maxScore}
                  action={resolveRegradeAction}
                />
              ) : null}
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
              suggested={Object.fromEntries(suggested)}
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
          <GradeHistory entries={history} />
        </section>
      </div>
    </div>
  );
}
