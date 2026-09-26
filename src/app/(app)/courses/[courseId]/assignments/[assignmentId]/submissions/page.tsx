import { cn } from "cn";
import type { Metadata } from "next";
import Link from "next/link";

import { LocalDateTime } from "@/components/common/local-date-time";
import { AiDraftButton } from "@/components/grading/ai-draft-button";
import { aiFailureReason, AiRunBadge } from "@/components/grading/ai-run-status";
import { AutoRefresh } from "@/components/grading/auto-refresh";
import { QUEUE_STATUS_LABELS, QueueStatusBadge } from "@/components/grading/queue-status-badge";
import { ReleaseGradesButton } from "@/components/grading/release-grades-button";
import { PaginationNav } from "@/components/layout/pagination-nav";
import { Button } from "@/components/ui/button";
import { parsePage } from "@/lib/pagination";
import {
  parseQueueFilter,
  QUEUE_STATUSES,
  type QueueStatus,
  RELEASE_BATCH_MAX,
} from "@/lib/validation/grade.schema";
import { generateAiDraftsAction } from "@/server/actions/ai.actions";
import { releaseGradesAction } from "@/server/actions/grade.actions";
import { aiConfig } from "@/server/ai/provider";
import { loadAssignmentForGrading } from "@/server/authz/load-course";
import { can } from "@/server/authz/policy";
import { db } from "@/server/db";
import { type AiRunSummary, getLatestRuns, sweepStaleRuns } from "@/server/services/ai.service";
import {
  countGradingQueue,
  listGradingQueue,
  listReleasable,
  type QueueItem,
} from "@/server/services/grade.service";

/** AI drafts started here run after the response (`after()`), within this limit. */
export const maxDuration = 300;

type Props = PageProps<"/courses/[courseId]/assignments/[assignmentId]/submissions">;

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { courseId, assignmentId } = await params;
  const { assignment } = await loadAssignmentForGrading(courseId, assignmentId);
  return { title: `Grading: ${assignment.title}` };
}

const EMPTY: Record<QueueStatus | "ALL", string> = {
  ALL: "No students have joined this course yet.",
  NOT_SUBMITTED: "Every student has submitted.",
  SUBMITTED: "Nothing is waiting to be graded.",
  AI_DRAFTED: "No AI drafts are waiting for review.",
  REVIEWED: "No reviewed grades are waiting for release.",
  RELEASED: "No grades have been released yet.",
};

export default async function GradingQueuePage({ params, searchParams }: Props) {
  const { courseId, assignmentId } = await params;
  const query = await searchParams;
  const { member, state, assignment } = await loadAssignmentForGrading(courseId, assignmentId);
  const filter = parseQueueFilter(query.status);
  const pageRequest = parsePage(query.page, 50);
  const ref = { courseId: assignment.courseId, assignmentId: assignment.id };

  const canRelease = can(member, "grade:release", { course: state, grade: { status: "DRAFT" } });
  const canUseAi = aiConfig.available && can(member, "ai:run", { course: state });
  // Lost AI runs (PENDING > 5 min) become FAILED before the queue is shown.
  await sweepStaleRuns(db, assignment.id, new Date());
  const [queue, counts, releasable] = await Promise.all([
    listGradingQueue(db, ref, filter, pageRequest),
    countGradingQueue(db, ref),
    canRelease ? listReleasable(db, assignment.id, RELEASE_BATCH_MAX) : [],
  ]);
  const runs = canUseAi
    ? await getLatestRuns(
        db,
        queue.items.flatMap((i) => (i.submissionId ? [i.submissionId] : [])),
      )
    : new Map<string, AiRunSummary>();
  // Only runs that still matter: a person's grade supersedes any AI run.
  const runFor = (item: QueueItem) => {
    const run = item.submissionId ? runs.get(item.submissionId) : undefined;
    return run && (item.status === "SUBMITTED" || item.status === "AI_DRAFTED") ? run : undefined;
  };
  const anyPending = queue.items.some((i) => runFor(i)?.status === "PENDING");
  const total = Object.values(counts).reduce((a, b) => a + b, 0);
  const base = `/courses/${courseId}/assignments/${assignment.id}`;
  const hrefFor = (status: QueueStatus | null, page = 1) => {
    const params = new URLSearchParams();
    if (status) params.set("status", status);
    if (page > 1) params.set("page", String(page));
    const qs = params.toString();
    return `${base}/submissions${qs ? `?${qs}` : ""}`;
  };
  const tabs: { status: QueueStatus | null; label: string; n: number }[] = [
    { status: null, label: "All", n: total },
    ...QUEUE_STATUSES.map((s) => ({ status: s, label: QUEUE_STATUS_LABELS[s], n: counts[s] })),
  ];

  return (
    <div className="grid gap-6">
      <header className="grid gap-2">
        <Link
          href={base}
          className="text-sm text-muted-foreground underline-offset-4 hover:underline"
        >
          ← {assignment.title}
        </Link>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h2 className="text-xl font-semibold">Grading queue</h2>
          <div className="flex flex-wrap gap-2">
            {canUseAi && counts.SUBMITTED > 0 ? (
              <AiDraftButton
                assignmentId={assignment.id}
                label="Generate AI drafts"
                action={generateAiDraftsAction}
              />
            ) : null}
            {canRelease ? (
              <ReleaseGradesButton
                assignmentId={assignment.id}
                grades={releasable}
                action={releaseGradesAction}
              />
            ) : null}
          </div>
        </div>
        <p className="text-sm text-muted-foreground">
          {canRelease
            ? "Grade each submission, then release reviewed grades to students."
            : "Grade each submission. The instructor releases grades to students."}
          {canUseAi
            ? " AI drafts are suggestions: open each one, check it, and save it before release."
            : ""}
        </p>
        {anyPending ? (
          <AutoRefresh label="AI drafts are running. This list updates by itself." />
        ) : null}
      </header>

      <nav aria-label="Filter by status" className="-mx-1 overflow-x-auto">
        <ul className="flex gap-1 border-b">
          {tabs.map((t) => {
            const active = t.status === filter;
            return (
              <li key={t.label}>
                <Link
                  href={hrefFor(t.status)}
                  aria-current={active ? "page" : undefined}
                  className={cn(
                    "-mb-px inline-flex h-10 items-center gap-1 border-b-2 px-3 text-sm font-medium whitespace-nowrap outline-none focus-visible:rounded-md focus-visible:ring-3 focus-visible:ring-ring/50",
                    active
                      ? "border-foreground text-foreground"
                      : "border-transparent text-muted-foreground hover:text-foreground",
                  )}
                >
                  {t.label} <span className="text-muted-foreground">({t.n})</span>
                </Link>
              </li>
            );
          })}
        </ul>
      </nav>

      {queue.items.length ? (
        <ul className="divide-y rounded-xl border" aria-label="Students">
          {queue.items.map((item) => (
            <li
              key={item.studentId}
              className="grid gap-2 p-4 sm:grid-cols-[1fr_auto] sm:items-center"
            >
              <div className="grid gap-1">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="font-medium break-words">{item.name}</span>
                  <QueueStatusBadge status={item.status} />
                  {runFor(item) ? <AiRunBadge run={runFor(item)!} /> : null}
                  {item.isLate ? <span className="text-sm text-destructive">Late</span> : null}
                </div>
                {runFor(item)?.status === "FAILED" ? (
                  <div className="flex flex-wrap items-center gap-2 text-sm">
                    <span>
                      AI draft failed because {aiFailureReason(runFor(item)!.errorCode)}. Retry or
                      grade manually.
                    </span>
                    <AiDraftButton
                      assignmentId={assignment.id}
                      submissionIds={[item.submissionId!]}
                      label="Retry"
                      ariaLabel={`Retry AI draft for ${item.name}`}
                      action={generateAiDraftsAction}
                    />
                  </div>
                ) : null}
                <p className="text-sm break-all text-muted-foreground">{item.email}</p>
                {item.submittedAt ? (
                  <p className="text-sm text-muted-foreground">
                    Submitted <LocalDateTime iso={item.submittedAt.toISOString()} /> ·{" "}
                    {item.wordCount} words
                    {item.totalScore !== null
                      ? ` · ${item.totalScore} / ${assignment.maxScore} points`
                      : ""}
                  </p>
                ) : null}
              </div>
              {item.submissionId ? (
                <Button asChild variant={item.status === "SUBMITTED" ? "default" : "outline"}>
                  <Link
                    href={`${base}/submissions/${item.submissionId}`}
                    aria-label={`${item.status === "RELEASED" ? "View" : "Grade"} ${item.name}`}
                  >
                    {item.status === "RELEASED" ? "View" : "Grade"}
                  </Link>
                </Button>
              ) : null}
            </li>
          ))}
        </ul>
      ) : (
        <div className="rounded-xl border border-dashed p-8 text-center">
          <p className="font-medium">Nothing here</p>
          <p className="mt-1 text-sm text-muted-foreground">{EMPTY[filter ?? "ALL"]}</p>
        </div>
      )}

      <PaginationNav
        page={queue.page}
        hasMore={queue.hasMore}
        hrefFor={(page) => hrefFor(filter, page)}
        label="Queue pages"
      />
    </div>
  );
}
