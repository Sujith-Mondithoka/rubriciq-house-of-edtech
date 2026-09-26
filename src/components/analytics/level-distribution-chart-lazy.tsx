"use client";

import dynamic from "next/dynamic";

/** Charts load in their own bundle, after the numbers they summarise. */
export const LevelDistributionChartLazy = dynamic(() => import("./level-distribution-chart"), {
  ssr: false,
  loading: () => (
    <div role="status" className="grid gap-1">
      <span className="sr-only">Loading chart…</span>
      <div className="h-24 animate-pulse rounded-lg bg-muted" />
    </div>
  ),
});
