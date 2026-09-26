import { ListChecksIcon } from "lucide-react";

import { EmptyState } from "@/components/common/empty-state";

type RubricViewProps = {
  criteria: {
    id: string;
    title: string;
    description: string;
    levels: { id: string; label: string; points: number; descriptor: string }[];
  }[];
  maxScore: number;
};

/** Read-only rubric for everyone who can see the assignment. User text renders as plain text. */
export function RubricView({ criteria, maxScore }: RubricViewProps) {
  if (!criteria.length) {
    return <EmptyState icon={ListChecksIcon} title="No rubric yet" compact />;
  }
  return (
    <div className="grid gap-3">
      <ol className="grid gap-3">
        {criteria.map((c, index) => {
          const top = Math.max(...c.levels.map((l) => l.points));
          return (
            <li key={c.id} className="card-surface grid gap-3 p-4 sm:p-5">
              <div className="flex flex-wrap items-baseline justify-between gap-2">
                <h3 className="font-semibold break-words">
                  <span className="text-muted-foreground tabular-nums">{index + 1}.</span> {c.title}
                </h3>
                <span className="text-sm text-muted-foreground tabular-nums">{top} points</span>
              </div>
              {c.description ? (
                <p className="text-sm whitespace-pre-wrap text-muted-foreground">{c.description}</p>
              ) : null}
              <ul className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
                {[...c.levels]
                  .sort((a, b) => b.points - a.points)
                  .map((l) => (
                    <li key={l.id} className="rounded-lg border bg-muted/40 p-3">
                      <p className="flex justify-between gap-2 text-sm font-medium">
                        <span className="break-words">{l.label}</span>
                        <span className="tabular-nums">{l.points}</span>
                      </p>
                      {l.descriptor ? (
                        <p className="mt-1 text-xs whitespace-pre-wrap text-muted-foreground">
                          {l.descriptor}
                        </p>
                      ) : null}
                    </li>
                  ))}
              </ul>
            </li>
          );
        })}
      </ol>
      <p className="text-right text-sm text-muted-foreground">
        Total: <strong className="text-foreground">{maxScore}</strong> points
      </p>
    </div>
  );
}
