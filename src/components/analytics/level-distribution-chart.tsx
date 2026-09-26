"use client";

import { useState } from "react";

type Level = { levelId: string; label: string; points: number; count: number };

type LevelDistributionChartProps = {
  title: string;
  levels: Level[];
  scored: number;
};

/**
 * How many graded submissions landed on each level of one criterion: horizontal bars from a
 * shared baseline, one series (so no legend; the caption names it), value at each bar's tip.
 * It is a real table, so screen readers and keyboard users get the same numbers; hovering or
 * focusing a row shows the share of students.
 */
export default function LevelDistributionChart({
  title,
  levels,
  scored,
}: LevelDistributionChartProps) {
  const [active, setActive] = useState<string | null>(null);
  const peak = Math.max(1, ...levels.map((l) => l.count));
  const ordered = [...levels].sort((a, b) => b.points - a.points);

  return (
    <table className="w-full border-separate border-spacing-y-0.5 text-sm">
      <caption className="sr-only">Level distribution for {title}</caption>
      <thead className="sr-only">
        <tr>
          <th scope="col">Level</th>
          <th scope="col">Students</th>
        </tr>
      </thead>
      <tbody>
        {ordered.map((l) => {
          const share = scored ? Math.round((l.count / scored) * 100) : 0;
          const detail = `${l.label} (${l.points} ${l.points === 1 ? "point" : "points"}): ${l.count} of ${scored} (${share}%)`;
          const isActive = active === l.levelId;
          return (
            <tr
              key={l.levelId}
              tabIndex={0}
              aria-label={detail}
              onMouseEnter={() => setActive(l.levelId)}
              onMouseLeave={() => setActive(null)}
              onFocus={() => setActive(l.levelId)}
              onBlur={() => setActive(null)}
              className="outline-none focus-visible:ring-3 focus-visible:ring-ring/50"
            >
              <th
                scope="row"
                className="w-2/5 py-1 pr-3 text-left font-normal break-words text-muted-foreground"
              >
                <span className="text-foreground">{l.label}</span> · {l.points}
              </th>
              <td className="relative py-1">
                <div className="flex items-center gap-2">
                  {/* Hit target is the whole row; the bar itself is decoration. */}
                  <div
                    aria-hidden
                    className="h-5 rounded-r-[4px] bg-[var(--chart-series-1)] transition-opacity"
                    style={{
                      width: l.count ? `${(l.count / peak) * 100}%` : "0",
                      maxWidth: "calc(100% - 3rem)",
                      opacity: active && !isActive ? 0.45 : 1,
                    }}
                  />
                  <span className="tabular-nums">{l.count}</span>
                </div>
                {isActive ? (
                  <div
                    role="tooltip"
                    className="pointer-events-none absolute -top-8 left-0 z-10 rounded-md border bg-popover px-2 py-1 text-xs whitespace-nowrap text-popover-foreground shadow-sm"
                  >
                    {detail}
                  </div>
                ) : null}
              </td>
            </tr>
          );
        })}
      </tbody>
    </table>
  );
}
