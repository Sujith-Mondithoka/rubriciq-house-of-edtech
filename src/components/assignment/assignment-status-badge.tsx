import { cn } from "cn";

type Status = "DRAFT" | "PUBLISHED" | "CLOSED";

const LABELS: Record<Status, string> = { DRAFT: "Draft", PUBLISHED: "Published", CLOSED: "Closed" };

const STYLES: Record<Status, { pill: string; dot: string }> = {
  DRAFT: { pill: "border border-dashed text-muted-foreground", dot: "bg-muted-foreground/50" },
  PUBLISHED: { pill: "bg-accent text-accent-foreground", dot: "bg-primary" },
  CLOSED: { pill: "bg-muted text-muted-foreground", dot: "bg-muted-foreground/60" },
};

/** Assignment state as text with a dot (never colour alone). */
export function AssignmentStatusBadge({ status }: { status: Status }) {
  const s = STYLES[status];
  return (
    <span
      className={cn(
        "inline-flex h-6 w-fit shrink-0 items-center gap-1.5 rounded-full px-2.5 text-xs font-medium whitespace-nowrap",
        s.pill,
      )}
    >
      <span aria-hidden className={cn("size-1.5 rounded-full", s.dot)} />
      {LABELS[status]}
    </span>
  );
}
