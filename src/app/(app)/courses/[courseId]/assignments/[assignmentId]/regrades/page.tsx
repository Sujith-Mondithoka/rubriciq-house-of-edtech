import { cn } from "cn";
import type { Metadata } from "next";
import Link from "next/link";

import { LocalDateTime } from "@/components/common/local-date-time";
import { PaginationNav } from "@/components/layout/pagination-nav";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { parsePage } from "@/lib/pagination";
import { parseRegradeFilter, type RegradeFilter } from "@/lib/validation/regrade.schema";
import { loadAssignmentForGrading } from "@/server/authz/load-course";
import { db } from "@/server/db";
import { countRegrades, listRegrades } from "@/server/services/regrade.service";

type Props = PageProps<"/courses/[courseId]/assignments/[assignmentId]/regrades">;

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { courseId, assignmentId } = await params;
  const { assignment } = await loadAssignmentForGrading(courseId, assignmentId);
  return { title: `Regrades: ${assignment.title}` };
}

const STATUS_LABELS = { OPEN: "Open", ACCEPTED: "Accepted", REJECTED: "Not changed" } as const;

export default async function RegradesPage({ params, searchParams }: Props) {
  const { courseId, assignmentId } = await params;
  const query = await searchParams;
  const { member, assignment } = await loadAssignmentForGrading(courseId, assignmentId);
  const filter = parseRegradeFilter(query.status);
  const pageRequest = parsePage(query.page, 50);
  const [list, counts] = await Promise.all([
    listRegrades(db, assignment.id, filter, pageRequest),
    countRegrades(db, assignment.id),
  ]);
  const base = `/courses/${courseId}/assignments/${assignment.id}`;
  const hrefFor = (status: RegradeFilter, page = 1) =>
    `${base}/regrades?status=${status}${page > 1 ? `&page=${page}` : ""}`;

  return (
    <div className="grid gap-6">
      <header className="grid gap-2">
        <Link
          href={base}
          className="text-sm text-muted-foreground underline-offset-4 hover:underline"
        >
          ← {assignment.title}
        </Link>
        <h2 className="text-xl font-semibold">Regrade requests</h2>
        <p className="text-sm text-muted-foreground">
          {member.role === "INSTRUCTOR"
            ? "Open a request to review the answer, then accept (changing levels) or keep the grade."
            : "The instructor resolves regrade requests. You can review them here."}
        </p>
      </header>

      <nav aria-label="Filter by status" className="-mx-1 overflow-x-auto">
        <ul className="flex gap-1 border-b">
          {(["OPEN", "RESOLVED"] as const).map((s) => (
            <li key={s}>
              <Link
                href={hrefFor(s)}
                aria-current={s === filter ? "page" : undefined}
                className={cn(
                  "-mb-px inline-flex h-10 items-center gap-1 border-b-2 px-3 text-sm font-medium whitespace-nowrap outline-none focus-visible:rounded-md focus-visible:ring-3 focus-visible:ring-ring/50",
                  s === filter
                    ? "border-foreground text-foreground"
                    : "border-transparent text-muted-foreground hover:text-foreground",
                )}
              >
                {s === "OPEN" ? "Open" : "Resolved"}{" "}
                <span className="text-muted-foreground">({counts[s]})</span>
              </Link>
            </li>
          ))}
        </ul>
      </nav>

      {list.items.length ? (
        <ul className="divide-y rounded-xl border" aria-label="Regrade requests">
          {list.items.map((r) => (
            <li key={r.id} className="grid gap-2 p-4 sm:grid-cols-[1fr_auto] sm:items-center">
              <div className="grid gap-1">
                <p className="flex flex-wrap items-center gap-2">
                  <span className="font-medium break-words">{r.studentName}</span>
                  <Badge variant={r.status === "OPEN" ? "secondary" : "outline"}>
                    {STATUS_LABELS[r.status]}
                  </Badge>
                  <span className="text-sm text-muted-foreground">
                    {r.criterionTitle ?? "Whole grade"} ·{" "}
                    <LocalDateTime iso={r.createdAt.toISOString()} />
                  </span>
                </p>
                <p className="line-clamp-2 text-sm whitespace-pre-wrap">{r.reason}</p>
              </div>
              <Button asChild variant={r.status === "OPEN" ? "default" : "outline"}>
                <Link
                  href={`${base}/submissions/${r.submissionId}`}
                  aria-label={`${r.status === "OPEN" ? "Review" : "View"} request from ${r.studentName}`}
                >
                  {r.status === "OPEN" ? "Review" : "View"}
                </Link>
              </Button>
            </li>
          ))}
        </ul>
      ) : (
        <div className="rounded-xl border border-dashed p-8 text-center">
          <p className="font-medium">Nothing here</p>
          <p className="mt-1 text-sm text-muted-foreground">
            {filter === "OPEN" ? "No open regrade requests." : "No resolved requests yet."}
          </p>
        </div>
      )}

      <PaginationNav
        page={list.page}
        hasMore={list.hasMore}
        hrefFor={(page) => hrefFor(filter, page)}
        label="Regrade pages"
      />
    </div>
  );
}
