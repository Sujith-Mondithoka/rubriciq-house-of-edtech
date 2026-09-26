import { LocalDateTime } from "@/components/common/local-date-time";

type GradeViewProps = {
  criteria: {
    id: string;
    title: string;
    levels: { id: string; label: string; points: number }[];
  }[];
  grade: {
    totalScore: number;
    overallFeedback: string;
    releasedAt: Date | null;
    scores: { criterionId: string; levelId: string | null; points: number; feedback: string }[];
  };
  maxScore: number;
  headingLevel?: "h3" | "h4";
};

function Meter({ value, max, label }: { value: number; max: number; label: string }) {
  const pct = max ? Math.round((value / max) * 100) : 0;
  return (
    <div
      role="meter"
      aria-label={label}
      aria-valuemin={0}
      aria-valuemax={max}
      aria-valuenow={value}
      className="h-1.5 w-full overflow-hidden rounded-full bg-muted"
    >
      <div className="h-full rounded-full bg-primary" style={{ width: `${pct}%` }} />
    </div>
  );
}

/** A released grade, read-only. Shows only what the student may see (no AI details). */
export function GradeView({ criteria, grade, maxScore, headingLevel = "h3" }: GradeViewProps) {
  const Heading = headingLevel;
  const scoreFor = new Map(grade.scores.map((s) => [s.criterionId, s]));
  const pct = maxScore ? Math.round((grade.totalScore / maxScore) * 100) : 0;
  return (
    <div className="card-surface grid gap-0 overflow-hidden">
      <div className="grid gap-3 border-b bg-gradient-to-br from-accent/70 to-card p-5 sm:flex sm:items-end sm:justify-between">
        <div className="grid gap-1">
          <p className="text-sm text-muted-foreground">Score</p>
          <p className="flex items-baseline gap-2">
            <strong className="text-4xl font-semibold tracking-tight tabular-nums">
              {grade.totalScore} / {maxScore}
            </strong>
            <span className="text-sm text-muted-foreground tabular-nums">{pct}%</span>
          </p>
        </div>
        {grade.releasedAt ? (
          <p className="text-sm text-muted-foreground">
            Released <LocalDateTime iso={grade.releasedAt.toISOString()} />
          </p>
        ) : null}
      </div>

      {grade.overallFeedback ? (
        <div className="grid gap-1 border-b p-5">
          <Heading className="text-sm font-medium text-muted-foreground">Overall feedback</Heading>
          <p className="leading-relaxed whitespace-pre-wrap">{grade.overallFeedback}</p>
        </div>
      ) : null}

      <ol className="divide-y">
        {criteria.map((c, index) => {
          const score = scoreFor.get(c.id);
          const level = c.levels.find((l) => l.id === score?.levelId);
          const top = Math.max(...c.levels.map((l) => l.points));
          return (
            <li key={c.id} className="grid gap-2.5 p-5">
              <div className="flex flex-wrap items-baseline justify-between gap-2">
                <Heading className="font-medium break-words">
                  {index + 1}. {c.title}
                </Heading>
                <span className="text-sm">
                  {level ? (
                    <>
                      <span className="font-medium">{level.label}</span> · {score!.points} / {top}
                    </>
                  ) : (
                    <span className="text-muted-foreground">Not scored</span>
                  )}
                </span>
              </div>
              <Meter value={score?.points ?? 0} max={top} label={`${c.title} score`} />
              {score?.feedback ? (
                <p className="text-sm leading-relaxed whitespace-pre-wrap text-foreground/90">
                  {score.feedback}
                </p>
              ) : null}
            </li>
          );
        })}
      </ol>
    </div>
  );
}
