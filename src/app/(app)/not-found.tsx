import Link from "next/link";

import { Button } from "@/components/ui/button";

/** Rendered inside the app shell; also used when a user is not a member of a course. */
export default function AppNotFound() {
  return (
    <div className="grid justify-items-start gap-3">
      <h1 className="text-2xl font-semibold">Not found</h1>
      <p className="text-muted-foreground">
        This page does not exist, or you do not have access to it. If you expected to see a course,
        ask your instructor for its join code.
      </p>
      <Button asChild size="lg">
        <Link href="/dashboard">Back to your courses</Link>
      </Button>
    </div>
  );
}
