import { cn } from "cn";

type Own = { status: "DRAFT" | "SUBMITTED"; isLate: boolean; released?: boolean } | undefined;

const pill =
  "inline-flex h-6 w-fit shrink-0 items-center gap-1.5 rounded-full px-2.5 text-xs font-medium whitespace-nowrap";

function Pill({ label, className, dot }: { label: string; className: string; dot: string }) {
  return (
    <span className={cn(pill, className)}>
      <span aria-hidden className={cn("size-1.5 rounded-full", dot)} />
      {label}
    </span>
  );
}

/** The student's own status on an assignment, always as text (not colour alone). */
export function SubmissionStatusBadge({ own }: { own: Own }) {
  if (!own) {
    return (
      <Pill
        label="Not started"
        className="border text-foreground/80"
        dot="bg-muted-foreground/50"
      />
    );
  }
  if (own.status === "DRAFT") {
    return (
      <Pill
        label="Draft saved"
        className="bg-muted text-muted-foreground"
        dot="bg-muted-foreground/60"
      />
    );
  }
  if (own.released) {
    return <Pill label="Graded" className="bg-success/10 text-success" dot="bg-success" />;
  }
  return own.isLate ? (
    <Pill
      label="Submitted late"
      className="bg-destructive/10 text-destructive"
      dot="bg-destructive"
    />
  ) : (
    <Pill label="Submitted" className="bg-accent text-accent-foreground" dot="bg-primary" />
  );
}
