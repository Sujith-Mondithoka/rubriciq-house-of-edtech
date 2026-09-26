"use client";

import { useSyncExternalStore } from "react";

const noop = () => () => {};

/** True only in the browser, after hydration (safe for time-zone dependent rendering). */
export function useIsClient(): boolean {
  return useSyncExternalStore(
    noop,
    () => true,
    () => false,
  );
}

const format = (date: Date, timeZone?: string) =>
  new Intl.DateTimeFormat("en", { dateStyle: "medium", timeStyle: "short", timeZone }).format(date);

/**
 * A UTC instant shown in the viewer's time zone. The server renders UTC (labelled), and the
 * browser switches to local time right after hydration without a mismatch.
 */
export function LocalDateTime({ iso }: { iso: string }) {
  const isClient = useIsClient();
  const date = new Date(iso);
  return (
    <time dateTime={iso} title={date.toISOString()}>
      {isClient ? format(date) : `${format(date, "UTC")} UTC`}
    </time>
  );
}
