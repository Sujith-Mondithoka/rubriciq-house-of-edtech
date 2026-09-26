import { Badge } from "@/components/ui/badge";

type Own = { status: "DRAFT" | "SUBMITTED"; isLate: boolean; released?: boolean } | undefined;

/** The student's own status on an assignment, always as text (not colour alone). */
export function SubmissionStatusBadge({ own }: { own: Own }) {
  if (!own) return <Badge variant="outline">Not started</Badge>;
  if (own.status === "DRAFT") return <Badge variant="secondary">Draft saved</Badge>;
  if (own.released) return <Badge variant="default">Graded</Badge>;
  return (
    <Badge variant={own.isLate ? "destructive" : "default"}>
      {own.isLate ? "Submitted late" : "Submitted"}
    </Badge>
  );
}
