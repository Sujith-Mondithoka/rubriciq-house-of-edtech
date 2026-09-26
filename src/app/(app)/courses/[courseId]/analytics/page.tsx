import { cn } from "cn";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";

import { LevelDistributionChartLazy } from "@/components/analytics/level-distribution-chart-lazy";
import { loadCourseForMember } from "@/server/authz/load-course";
import { can } from "@/server/authz/policy";
import { db } from "@/server/db";
import {
  getAssignmentAnalytics,
  listAnalyzableAssignments,
} from "@/server/services/analytics.service";

type Props = PageProps<"/courses/[courseId]/analytics">;

export const metadata: Metadata = { title: "Analytics" };

export default async function AnalyticsPage({ params, searchParams }: Props) {
  const { course, member, state } = await loadCourseForMember((await params).courseId);
  if (!can(member, "analytics:view", { course: state })) notFound();
  const query = await searchParams;
  const assignments = await listAnalyzableAssignments(db, course.id);
  const requested = Array.isArray(query.assignment) ? query.assignment[0] : query.assignment;
  // Only this course's assignments can be picked (anything else falls back to the first).
  const selected = assignments.find((a) => a.id === requested) ?? assignments[0];
  const data = selected ? await getAssignmentAnalytics(db, selected.id, selected.maxScore) : null;

  return (
    <div className="grid gap-6">
      <header className="grid gap-1">
        <h2 className="text-xl font-semibold">Analytics</h2>
        <p className="text-sm text-muted-foreground">
          Per-criterion results over grades a person has confirmed (reviewed or released).
          Unreviewed AI drafts are not counted.
        </p>
      </header>

      {!selected || !data ? (
        <div className="rounded-xl border border-dashed p-8 text-center">
          <p className="font-medium">No data yet</p>
          <p className="mt-1 text-sm text-muted-foreground">
            Analytics appear once an assignment is published and graded.
          </p>
        </div>
      ) : (
        <>
          <nav aria-label="Assignment" className="-mx-1 overflow-x-auto">
            <ul className="flex gap-1 border-b">
              {assignments.map((a) => (
                <li key={a.id}>
                  <Link
                    href={`/courses/${course.id}/analytics?assignment=${a.id}`}
                    aria-current={a.id === selected.id ? "page" : undefined}
                    className={cn(
                      "-mb-px inline-flex h-10 max-w-64 items-center border-b-2 px-3 text-sm font-medium outline-none focus-visible:rounded-md focus-visible:ring-3 focus-visible:ring-ring/50",
                      a.id === selected.id
                        ? "border-foreground text-foreground"
                        : "border-transparent text-muted-foreground hover:text-foreground",
                    )}
                  >
                    <span className="truncate">{a.title}</span>
                  </Link>
                </li>
              ))}
            </ul>
          </nav>

          <dl className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            {(
              [
                ["Submitted", String(data.submitted)],
                ["Graded", `${data.graded}${data.released ? ` (${data.released} released)` : ""}`],
                ["Average", data.average === null ? "–" : `${data.average} / ${data.maxScore}`],
                ["Range", data.min === null ? "–" : `${data.min}–${data.max}`],
              ] as const
            ).map(([label, value]) => (
              <div key={label} className="rounded-lg bg-muted/50 p-3">
                <dt className="text-sm text-muted-foreground">{label}</dt>
                <dd className="text-xl font-semibold tabular-nums">{value}</dd>
              </div>
            ))}
          </dl>

          {data.graded === 0 ? (
            <p className="rounded-xl border border-dashed p-6 text-center text-sm text-muted-foreground">
              No confirmed grades for this assignment yet.
            </p>
          ) : (
            <ol className="grid gap-4 md:grid-cols-2">
              {data.criteria.map((c) => (
                <li key={c.criterionId} className="grid gap-3 rounded-xl border p-4">
                  <div className="flex flex-wrap items-baseline justify-between gap-2">
                    <h3 className="font-medium break-words">{c.title}</h3>
                    <p className="text-sm">
                      Average{" "}
                      <strong className="tabular-nums">
                        {c.average === null ? "–" : `${c.average} / ${c.maxPoints}`}
                      </strong>
                    </p>
                  </div>
                  <LevelDistributionChartLazy title={c.title} levels={c.levels} scored={c.scored} />
                  <p className="text-xs text-muted-foreground">
                    {c.scored} {c.scored === 1 ? "submission" : "submissions"} scored on this
                    criterion
                  </p>
                </li>
              ))}
            </ol>
          )}
        </>
      )}
    </div>
  );
}
