import { BookOpenIcon, GraduationCapIcon, type LucideIcon, UsersIcon } from "lucide-react";

import { PendingButton } from "@/components/forms/pending-button";
import type { DemoRole } from "@/lib/validation/auth.schema";
import { signInAsDemo } from "@/server/actions/auth.actions";

const DEMO_ROLES: { role: DemoRole; label: string; description: string; icon: LucideIcon }[] = [
  {
    role: "instructor",
    label: "Instructor",
    description: "Build rubrics, grade and release.",
    icon: GraduationCapIcon,
  },
  {
    role: "ta",
    label: "TA",
    description: "Grade with AI drafts; cannot release.",
    icon: UsersIcon,
  },
  {
    role: "student",
    label: "Student",
    description: "Submit work and read feedback.",
    icon: BookOpenIcon,
  },
];

/** One-click sign-in to the seeded demo accounts (works without JavaScript). */
export function DemoLoginButtons() {
  return (
    <ul className="grid gap-3 sm:grid-cols-3">
      {DEMO_ROLES.map(({ role, label, description, icon: Icon }, index) => (
        <li key={role}>
          <form action={signInAsDemo} className="card-surface flex h-full flex-col gap-3 p-4">
            <input type="hidden" name="role" value={role} />
            <div className="flex items-center gap-3">
              <span
                aria-hidden
                className="grid size-9 place-items-center rounded-lg bg-accent text-accent-foreground"
              >
                <Icon className="size-4.5" />
              </span>
              <div>
                <p className="font-medium">{label}</p>
                <p id={`demo-${role}-description`} className="text-sm text-muted-foreground">
                  {description}
                </p>
              </div>
            </div>
            <PendingButton
              variant={index === 0 ? "default" : "outline"}
              size="lg"
              className="mt-auto w-full"
              pendingLabel="Signing in…"
              aria-describedby={`demo-${role}-description`}
            >
              Try as {label}
            </PendingButton>
          </form>
        </li>
      ))}
    </ul>
  );
}
