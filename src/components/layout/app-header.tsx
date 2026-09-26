import { PendingButton } from "@/components/forms/pending-button";
import { signOutAction } from "@/server/actions/auth.actions";
import type { CurrentUser } from "@/server/auth/session";

import { Brand } from "./brand";

function initials(name: string) {
  const parts = name
    .replace(/\(.*?\)/g, "")
    .trim()
    .split(/\s+/);
  return ((parts[0]?.[0] ?? "") + (parts[1]?.[0] ?? "")).toUpperCase() || "?";
}

export function AppHeader({ user }: { user: CurrentUser }) {
  return (
    <header className="sticky top-0 z-30 border-b bg-card/85 backdrop-blur supports-[backdrop-filter]:bg-card/70">
      <div className="mx-auto flex h-14 max-w-6xl items-center justify-between gap-4 px-4">
        <Brand href="/dashboard" />
        <div className="flex min-w-0 items-center gap-3">
          <p className="flex min-w-0 items-center gap-2 text-sm">
            <span
              aria-hidden
              className="grid size-7 shrink-0 place-items-center rounded-full bg-accent text-xs font-semibold text-accent-foreground"
            >
              {initials(user.name)}
            </span>
            <span className="sr-only">Signed in as </span>
            <span className="hidden truncate text-muted-foreground sm:inline">{user.name}</span>
          </p>
          <form action={signOutAction}>
            <PendingButton variant="outline" size="lg" pendingLabel="Signing out…">
              Sign out
            </PendingButton>
          </form>
        </div>
      </div>
    </header>
  );
}
