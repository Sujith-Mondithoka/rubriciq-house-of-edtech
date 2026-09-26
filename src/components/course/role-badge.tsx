type Role = "INSTRUCTOR" | "TA" | "STUDENT";

export const ROLE_LABELS: Record<Role, string> = {
  INSTRUCTOR: "Instructor",
  TA: "TA",
  STUDENT: "Student",
};

const pill =
  "inline-flex h-6 w-fit shrink-0 items-center rounded-full px-2.5 text-xs font-medium whitespace-nowrap";

export function RoleBadge({ role }: { role: Role }) {
  return (
    <span
      className={`${pill} ${role === "STUDENT" ? "border text-foreground/80" : "bg-secondary text-secondary-foreground"}`}
    >
      {ROLE_LABELS[role]}
    </span>
  );
}

export function ArchivedBadge() {
  return <span className={`${pill} bg-muted text-muted-foreground`}>Archived</span>;
}
