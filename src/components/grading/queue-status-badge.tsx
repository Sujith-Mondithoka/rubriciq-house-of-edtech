import { cn } from "cn";

import type { QueueStatus } from "@/lib/validation/grade.schema";

export const QUEUE_STATUS_LABELS: Record<QueueStatus, string> = {
  NOT_SUBMITTED: "Not submitted",
  SUBMITTED: "Needs grading",
  AI_DRAFTED: "AI drafted",
  REVIEWED: "Reviewed",
  RELEASED: "Released",
};

const styles: Record<QueueStatus, { pill: string; dot: string }> = {
  NOT_SUBMITTED: { pill: "bg-muted text-muted-foreground", dot: "bg-muted-foreground/50" },
  SUBMITTED: { pill: "bg-accent text-accent-foreground", dot: "bg-primary" },
  AI_DRAFTED: { pill: "bg-warning/10 text-warning", dot: "bg-warning" },
  REVIEWED: { pill: "bg-secondary text-secondary-foreground", dot: "bg-foreground/60" },
  RELEASED: { pill: "bg-success/10 text-success", dot: "bg-success" },
};

/** Grading status as text with a colour dot (never colour alone). */
export function QueueStatusBadge({ status }: { status: QueueStatus }) {
  const s = styles[status];
  return (
    <span
      className={cn(
        "inline-flex h-6 w-fit shrink-0 items-center gap-1.5 rounded-full px-2.5 text-xs font-medium whitespace-nowrap",
        s.pill,
      )}
    >
      <span aria-hidden className={cn("size-1.5 rounded-full", s.dot)} />
      {QUEUE_STATUS_LABELS[status]}
    </span>
  );
}
