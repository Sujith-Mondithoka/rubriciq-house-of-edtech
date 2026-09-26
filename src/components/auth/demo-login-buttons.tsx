import { PendingButton } from "@/components/forms/pending-button";
import type { DemoRole } from "@/lib/validation/auth.schema";
import { signInAsDemo } from "@/server/actions/auth.actions";

const DEMO_ROLES: { role: DemoRole; label: string; description: string }[] = [
  { role: "instructor", label: "Instructor", description: "Build rubrics, grade and release." },
  { role: "ta", label: "TA", description: "Grade with AI drafts; cannot release." },
  { role: "student", label: "Student", description: "Submit work and read feedback." },
];

/** One-click sign-in to the seeded demo accounts (works without JavaScript). */
export function DemoLoginButtons() {
  return (
    <ul className="grid gap-3 sm:grid-cols-3">
      {DEMO_ROLES.map(({ role, label, description }) => (
        <li key={role}>
          <form action={signInAsDemo} className="flex h-full flex-col gap-2">
            <input type="hidden" name="role" value={role} />
            <PendingButton
              variant="outline"
              size="lg"
              className="w-full"
              pendingLabel="Signing in…"
              aria-describedby={`demo-${role}-description`}
            >
              Try as {label}
            </PendingButton>
            <p id={`demo-${role}-description`} className="text-sm text-muted-foreground">
              {description}
            </p>
          </form>
        </li>
      ))}
    </ul>
  );
}
