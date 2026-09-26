import Link from "next/link";

import { SiteHeader } from "@/components/layout/site-header";
import { Button } from "@/components/ui/button";

export default function NotFound() {
  return (
    <>
      <SiteHeader />
      <main
        id="main"
        className="mx-auto flex w-full max-w-6xl flex-1 flex-col items-start gap-3 px-4 py-16"
      >
        <h1 className="text-2xl font-semibold">Page not found</h1>
        <p className="text-muted-foreground">
          The page you are looking for does not exist or you do not have access to it.
        </p>
        <Button asChild size="lg">
          <Link href="/">Go to the home page</Link>
        </Button>
      </main>
    </>
  );
}
