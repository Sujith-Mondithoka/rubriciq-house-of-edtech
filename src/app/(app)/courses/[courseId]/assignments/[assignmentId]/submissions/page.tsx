import { cn } from "cn";
import { InboxIcon } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";

import { EmptyState } from "@/components/common/empty-state";
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
      <header className="grid gap-3">
        <Link
          href={base}
          className="w-fit text-sm text-muted-foreground underline-offset-4 hover:text-foreground hover:underline"
        >
          ← {assignment.title}
        </Link>
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div className="grid gap-1">
            <h2 className="page-title">Grading queue</h2>
            <p className="max-w-2xl text-sm text-muted-foreground">
              {canRelease
                ? "Grade each submission, then release reviewed grades to students."
                : "Grade each submission. The instructor releases grades to students."}
              {canUseAi
                ? " AI drafts are suggestions: open each one, check it, and save it before release."
                : ""}
            </p>
          </div>
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
        {anyPending ? (
          <AutoRefresh label="AI drafts are running. This list updates by itself." />
        ) : null}
      </header>

      <nav aria-label="Filter by status" className="-mx-1 overflow-x-auto px-1 pb-1">
        <ul className="flex w-max gap-1 rounded-lg bg-muted p-1">
          {tabs.map((t) => {
            const active = t.status === filter;
            return (
              <li key={t.label}>
                <Link
                  href={hrefFor(t.status)}
                  aria-current={active ? "page" : undefined}
                  className={cn(
                    "inline-flex h-8 items-center gap-1 rounded-md px-3 text-sm whitespace-nowrap outline-none focus-visible:ring-3 focus-visible:ring-ring/50",
                    active
                      ? "bg-card font-medium text-foreground shadow-sm"
                      : "text-foreground/75 hover:text-foreground",
                  )}
                >
                  {t.label} <span className="text-muted-foreground tabular-nums">({t.n})</span>
                </Link>
              </li>
            );
          })}
        </ul>
      </nav>

      {queue.items.length ? (
        <div className="card-surface overflow-hidden">
          <div
            aria-hidden
            className="hidden grid-cols-[minmax(0,2fr)_minmax(0,1.3fr)_minmax(0,1fr)_7rem] gap-4 border-b bg-muted/50 px-4 py-2 text-xs font-medium text-muted-foreground md:grid"
          >
            <span>Student</span>
            <span>Status</span>
            <span>Score</span>
            <span className="text-right">Action</span>
          </div>
          <ul className="divide-y" aria-label="Students">
            {queue.items.map((item) => {
              const run = runFor(item);
              const needsWork = item.status === "SUBMITTED" || item.status === "AI_DRAFTED";
              return (
                <li
                  key={item.studentId}
                  className="grid gap-3 px-4 py-3.5 md:grid-cols-[minmax(0,2fr)_minmax(0,1.3fr)_minmax(0,1fr)_7rem] md:items-center md:gap-4"
                >
                  <div className="flex min-w-0 items-center gap-3">
                    <span
                      aria-hidden
                      className="grid size-9 shrink-0 place-items-center rounded-full bg-accent text-xs font-semibold text-accent-foreground"
                    >
                      {initials(item.name)}
                    </span>
                    <div className="grid min-w-0">
                      <span className="truncate font-medium">{item.name}</span>
                      <span className="truncate text-sm text-muted-foreground">
                        {item.submittedAt ? (
                          <>
                            Submitted <LocalDateTime iso={item.submittedAt.toISOString()} /> ·{" "}
                            {item.wordCount} words
                          </>
                        ) : (
                          item.email
                        )}
                      </span>
                    </div>
                  </div>
                  <div className="flex flex-wrap items-center gap-1.5">
                    <QueueStatusBadge status={item.status} />
                    {run ? <AiRunBadge run={run} /> : null}
                    {item.isLate ? (
                      <span className="inline-flex h-6 items-center rounded-full bg-destructive/10 px-2.5 text-xs font-medium text-destructive">
                        Late
                      </span>
                    ) : null}
                  </div>
                  <p className="text-sm tabular-nums">
                    {item.totalScore !== null ? (
                      <>
                        <span className="font-medium">{item.totalScore}</span>
                        <span className="text-muted-foreground">
                          {" "}
                          / {assignment.maxScore} points
                        </span>
                      </>
                    ) : (
                      <span className="text-muted-foreground md:hidden">No score yet</span>
                    )}
                  </p>
                  <div className="flex md:justify-end">
                    {item.submissionId ? (
                      <Button asChild size="lg" variant={needsWork ? "default" : "outline"}>
                        <Link
                          href={`${base}/submissions/${item.submissionId}`}
                          aria-label={`${item.status === "RELEASED" ? "View" : "Grade"} ${item.name}`}
                        >
                          {item.status === "RELEASED" ? "View" : "Grade"}
                        </Link>
                      </Button>
                    ) : null}
                  </div>
                  {run?.status === "FAILED" ? (
                    <div className="flex flex-wrap items-center gap-2 rounded-lg bg-destructive/5 px-3 py-2 text-sm md:col-span-4">
                      <span>
                        AI draft failed because {aiFailureReason(run.errorCode)}. Retry or grade
                        manually.
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
                </li>
              );
            })}
          </ul>
        </div>
      ) : (
        <EmptyState icon={InboxIcon} title="Nothing here">
          {EMPTY[filter ?? "ALL"]}
        </EmptyState>
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

function initials(name: string) {
  const parts = name
    .replace(/\(.*?\)/g, "")
    .trim()
    .split(/\s+/);
  return ((parts[0]?.[0] ?? "") + (parts[1]?.[0] ?? "")).toUpperCase() || "?";
}
