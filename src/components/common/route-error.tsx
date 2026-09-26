"use client";

import { useEffect } from "react";

import { Button } from "@/components/ui/button";

type RouteErrorProps = { error: Error & { digest?: string }; reset: () => void };

/** The body of every error boundary: a generic message, the reference, and a retry. */
export function RouteError({ error, reset }: RouteErrorProps) {
  useEffect(() => {
    // The server already logged the details; the digest links the two.
    console.error(error.digest ?? error.message);
  }, [error]);

  return (
    <div role="alert" className="grid justify-items-start gap-3">
      <h1 className="text-xl font-semibold">Something went wrong</h1>
      <p className="text-muted-foreground">
        We could not load this page. Please try again.
        {error.digest ? ` (Reference: ${error.digest})` : null}
      </p>
      <Button onClick={reset} size="lg">
        Try again
      </Button>
    </div>
  );
}
