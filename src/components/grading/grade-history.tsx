import { LocalDateTime } from "@/components/common/local-date-time";

type Entry = {
  id: string;
  action: string;
  actorName: string | null;
  createdAt: Date;
  metadata: Record<string, unknown> | null;
};

function describe(entry: Entry): string {
  const m = entry.metadata ?? {};
  switch (entry.action) {
    case "grade.ai_drafted":
      return `AI draft stored (${String(m.totalScore ?? "?")} points)`;
    case "grade.saved":
      return `Grade saved (${String(m.totalScore ?? "?")} points, version ${String(m.version ?? "?")})`;
    case "grade.released":
      return "Grade released to the student";
    case "grade.regraded":
      return `Grade changed by regrade: ${String(m.totalBefore ?? "?")} → ${String(m.totalAfter ?? "?")} points`;
    case "regrade.requested":
      return "Student requested a regrade";
    case "regrade.resolved":
      return m.decision === "ACCEPTED" ? "Regrade accepted" : "Regrade answered: grade kept";
    default:
      return entry.action;
  }
}

/** The audit trail of a grade, newest first (staff only). */
export function GradeHistory({ entries }: { entries: Entry[] }) {
  if (!entries.length) return null;
  return (
    <section aria-labelledby="history-heading" className="grid gap-2">
      <h3 id="history-heading" className="font-medium">
        History
      </h3>
      <ol className="grid gap-1 text-sm">
        {entries.map((e) => (
          <li key={e.id} className="flex flex-wrap gap-x-2 border-l-2 pl-3">
            <span>{describe(e)}</span>
            <span className="text-muted-foreground">
              · {e.actorName ?? "System"} · <LocalDateTime iso={e.createdAt.toISOString()} />
            </span>
          </li>
        ))}
      </ol>
    </section>
  );
}
