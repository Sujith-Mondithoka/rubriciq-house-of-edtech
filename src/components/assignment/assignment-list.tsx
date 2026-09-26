import { CalendarClockIcon, ChevronRightIcon, ClipboardListIcon } from "lucide-react";
import Link from "next/link";
import type { ReactNode } from "react";

import { EmptyState } from "@/components/common/empty-state";
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
      <EmptyState icon={ClipboardListIcon} title={emptyTitle}>
        {emptyHint}
      </EmptyState>
    );
  }
  return (
    <ul className="card-surface divide-y overflow-hidden">
      {items.map((a) => (
        <li
          key={a.id}
          className="group relative flex items-center gap-4 px-4 py-3.5 focus-within:bg-muted/50 hover:bg-muted/50"
        >
          <div className="grid min-w-0 flex-1 gap-1.5">
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
            <p className="flex flex-wrap items-center gap-x-3 gap-y-1 text-sm text-muted-foreground">
              <span className="inline-flex items-center gap-1">
                <CalendarClockIcon aria-hidden className="size-3.5" />
                Due <LocalDateTime iso={a.dueAt.toISOString()} />
              </span>
              <span className="tabular-nums">{a.maxScore} points</span>
            </p>
          </div>
          <ChevronRightIcon
            aria-hidden
            className="size-4 shrink-0 text-muted-foreground transition-transform group-hover:translate-x-0.5"
          />
        </li>
      ))}
    </ul>
  );
}
