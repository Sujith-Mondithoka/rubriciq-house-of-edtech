import { Badge } from "@/components/ui/badge";

type Role = "INSTRUCTOR" | "TA" | "STUDENT";

export const ROLE_LABELS: Record<Role, string> = {
  INSTRUCTOR: "Instructor",
  TA: "TA",
  STUDENT: "Student",
};

export function RoleBadge({ role }: { role: Role }) {
  return <Badge variant={role === "STUDENT" ? "outline" : "secondary"}>{ROLE_LABELS[role]}</Badge>;
}

export function ArchivedBadge() {
  return <Badge variant="outline">Archived</Badge>;
}
