"use client";

import dynamic from "next/dynamic";

/** The rubric builder is the heaviest form in the app, so it loads in its own bundle. */
export const RubricBuilderLazy = dynamic(() => import("./rubric-builder"), {
  ssr: false,
  loading: () => (
    <div role="status" className="grid gap-4">
      <span className="sr-only">Loading the rubric builder…</span>
      <div className="h-64 animate-pulse rounded-xl bg-muted" />
    </div>
  ),
});
