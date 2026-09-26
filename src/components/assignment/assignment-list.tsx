import Link from "next/link";
import type { ReactNode } from "react";

import { LocalDateTime } from "@/components/common/local-date-time";

import { AssignmentStatusBadge } from "./assignment-status-badge";

type Item = {
  id: string;
  title: string;
  status: "DRAFT" | "PUBLISHED" | "CLOSED";
  dueAt: Date;
  maxScore: number;
};

type AssignmentListProps = {
  courseId: string;
  items: Item[];
  /** Extra per-row content, e.g. the student's own submission status. */
  renderMeta?: (item: Item) => ReactNode;
  emptyTitle: string;
  emptyHint: string;
};

export function AssignmentList({
  courseId,
  items,
  renderMeta,
  emptyTitle,
  emptyHint,
}: AssignmentListProps) {
  if (!items.length) {
    return (
      <div className="rounded-xl border border-dashed p-8 text-center">
        <p className="font-medium">{emptyTitle}</p>
        <p className="mt-1 text-sm text-muted-foreground">{emptyHint}</p>
      </div>
    );
  }
  return (
    <ul className="divide-y rounded-xl border">
      {items.map((a) => (
        <li
          key={a.id}
          className="relative grid gap-1 p-4 focus-within:bg-muted/40 hover:bg-muted/40"
        >
          <div className="flex flex-wrap items-center gap-2">
            <Link
              href={`/courses/${courseId}/assignments/${a.id}`}
              className="font-medium break-words outline-none after:absolute after:inset-0 focus-visible:underline"
            >
              {a.title}
            </Link>
            <AssignmentStatusBadge status={a.status} />
            {renderMeta?.(a)}
          </div>
          <p className="text-sm text-muted-foreground">
            Due <LocalDateTime iso={a.dueAt.toISOString()} /> · {a.maxScore} points
          </p>
        </li>
      ))}
    </ul>
  );
}
