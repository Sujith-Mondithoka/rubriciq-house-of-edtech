import { PendingButton } from "@/components/forms/pending-button";
import { signOutAction } from "@/server/actions/auth.actions";
import type { CurrentUser } from "@/server/auth/session";

import { Brand } from "./brand";

export function AppHeader({ user }: { user: CurrentUser }) {
  return (
    <header className="border-b">
      <div className="mx-auto flex h-14 max-w-5xl items-center justify-between gap-4 px-4">
        <Brand href="/dashboard" />
        <div className="flex min-w-0 items-center gap-3">
          <p className="truncate text-sm text-muted-foreground">
            <span className="sr-only">Signed in as </span>
            {user.name}
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
