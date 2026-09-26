import { Badge } from "@/components/ui/badge";

type Status = "DRAFT" | "PUBLISHED" | "CLOSED";

const LABELS: Record<Status, string> = { DRAFT: "Draft", PUBLISHED: "Published", CLOSED: "Closed" };

export function AssignmentStatusBadge({ status }: { status: Status }) {
  return <Badge variant={status === "PUBLISHED" ? "default" : "outline"}>{LABELS[status]}</Badge>;
}
