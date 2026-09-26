import { LocalDateTime } from "@/components/common/local-date-time";
import { Badge } from "@/components/ui/badge";

type RegradeStatusProps = {
  regrade: {
    status: "OPEN" | "ACCEPTED" | "REJECTED";
    reason: string;
    response: string | null;
    createdAt: Date;
    resolvedAt: Date | null;
  };
  criterionTitle: string | null;
  /** "you" for the student, the student's name for staff. */
  audience: "student" | "staff";
};

const LABELS = { OPEN: "Open", ACCEPTED: "Accepted", REJECTED: "Not changed" } as const;

/** A regrade request and its outcome, as plain text (never HTML). */
export function RegradeStatus({ regrade, criterionTitle, audience }: RegradeStatusProps) {
  return (
    <div className="grid gap-3 rounded-xl border p-4">
      <p className="flex flex-wrap items-center gap-2">
        <span className="font-medium">Regrade request</span>
        <Badge variant={regrade.status === "OPEN" ? "secondary" : "outline"}>
          {LABELS[regrade.status]}
        </Badge>
        <span className="text-sm text-muted-foreground">
          {criterionTitle ?? "Whole grade"} · sent{" "}
          <LocalDateTime iso={regrade.createdAt.toISOString()} />
        </span>
      </p>
      <div className="grid gap-1">
        <p className="text-sm text-muted-foreground">
          {audience === "student" ? "Your reason" : "Student's reason"}
        </p>
        <p className="whitespace-pre-wrap">{regrade.reason}</p>
      </div>
      {regrade.status === "OPEN" ? (
        <p className="text-sm text-muted-foreground">
          {audience === "student"
            ? "Waiting for your instructor. You will see the outcome here."
            : "Waiting for the instructor's decision."}
        </p>
      ) : (
        <div className="grid gap-1">
          <p className="text-sm text-muted-foreground">
            {regrade.status === "ACCEPTED"
              ? "Accepted: the grade was updated"
              : "Reviewed: the grade stays the same"}
            {regrade.resolvedAt ? (
              <>
                {" "}
                on <LocalDateTime iso={regrade.resolvedAt.toISOString()} />
              </>
            ) : null}
          </p>
          {regrade.response ? <p className="whitespace-pre-wrap">{regrade.response}</p> : null}
        </div>
      )}
    </div>
  );
}
