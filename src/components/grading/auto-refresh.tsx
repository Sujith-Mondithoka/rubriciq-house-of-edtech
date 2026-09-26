"use client";

import { useRouter } from "next/navigation";
import { useEffect } from "react";

const INTERVAL_MS = 3000;
/** Past this, the stale sweep has marked the run FAILED anyway. */
const GIVE_UP_MS = 6 * 60 * 1000;

/** Polls the server while AI drafts are running (rendered only when a run is PENDING). */
export function AutoRefresh({ label }: { label: string }) {
  const router = useRouter();
  useEffect(() => {
    const timer = setInterval(() => router.refresh(), INTERVAL_MS);
    const stop = setTimeout(() => clearInterval(timer), GIVE_UP_MS);
    return () => {
      clearInterval(timer);
      clearTimeout(stop);
    };
  }, [router]);
  return (
    <p role="status" className="text-sm text-muted-foreground">
      {label}
    </p>
  );
}
