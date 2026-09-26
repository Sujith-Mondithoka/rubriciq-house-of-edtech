import Link from "next/link";

import { Button } from "@/components/ui/button";

import { Brand } from "./brand";

/** Header for public pages. Static: it does not read the session. */
export function SiteHeader() {
  return (
    <header className="sticky top-0 z-30 border-b bg-card/85 backdrop-blur supports-[backdrop-filter]:bg-card/70">
      <div className="mx-auto flex h-14 max-w-6xl items-center justify-between gap-4 px-4">
        <Brand />
        <nav aria-label="Account">
          <ul className="flex items-center gap-2">
            <li>
              <Button asChild variant="ghost" size="lg">
                <Link href="/sign-in">Sign in</Link>
              </Button>
            </li>
            <li>
              <Button asChild size="lg">
                <Link href="/sign-up">Create account</Link>
              </Button>
            </li>
          </ul>
        </nav>
      </div>
    </header>
  );
}
