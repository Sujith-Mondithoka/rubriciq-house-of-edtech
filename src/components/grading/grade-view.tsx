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

/** A released grade, read-only. Shows only what the student may see (no AI details). */
export function GradeView({ criteria, grade, maxScore, headingLevel = "h3" }: GradeViewProps) {
  const Heading = headingLevel;
  const scoreFor = new Map(grade.scores.map((s) => [s.criterionId, s]));
  return (
    <div className="grid gap-4">
      <div className="flex flex-wrap items-baseline justify-between gap-2 rounded-xl bg-muted/50 p-4">
        <p className="text-lg">
          Score:{" "}
          <strong className="text-2xl">
            {grade.totalScore} / {maxScore}
          </strong>
        </p>
        {grade.releasedAt ? (
          <p className="text-sm text-muted-foreground">
            Released <LocalDateTime iso={grade.releasedAt.toISOString()} />
          </p>
        ) : null}
      </div>
      {grade.overallFeedback ? (
        <div className="grid gap-1">
          <Heading className="font-medium">Overall feedback</Heading>
          <p className="whitespace-pre-wrap">{grade.overallFeedback}</p>
        </div>
      ) : null}
      <ol className="grid gap-3">
        {criteria.map((c, index) => {
          const score = scoreFor.get(c.id);
          const level = c.levels.find((l) => l.id === score?.levelId);
          const top = Math.max(...c.levels.map((l) => l.points));
          return (
            <li key={c.id} className="grid gap-2 rounded-xl border p-4">
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
              {score?.feedback ? (
                <p className="text-sm whitespace-pre-wrap">{score.feedback}</p>
              ) : null}
            </li>
          );
        })}
      </ol>
    </div>
  );
}
