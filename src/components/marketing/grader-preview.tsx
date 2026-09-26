import { CheckIcon, SparklesIcon, TriangleAlertIcon } from "lucide-react";

const levels = [
  { label: "Missing", points: 0 },
  { label: "Developing", points: 4 },
  { label: "Proficient", points: 7 },
  { label: "Excellent", points: 10 },
];

/**
 * A static picture of the grader, built in HTML/CSS so it stays sharp, themed and light.
 * Decorative: screen readers get the one-line description instead of the fake UI.
 */
export function GraderPreview() {
  return (
    <figure
      role="img"
      aria-label="Preview of the grader: the student's essay with AI-quoted evidence highlighted, next to rubric levels with the AI's suggestion and the teacher's choice."
      className="card-surface overflow-hidden shadow-xl shadow-primary/5"
    >
      <div aria-hidden className="grid">
        <div className="flex items-center justify-between gap-3 border-b bg-muted/60 px-4 py-2.5">
          <div className="flex items-center gap-2">
            <span className="grid size-6 place-items-center rounded-full bg-accent text-[10px] font-semibold text-accent-foreground">
              AR
            </span>
            <span className="text-sm font-medium">Ananya Rao</span>
            <span className="rounded-full bg-accent px-2 py-0.5 text-[11px] font-medium text-accent-foreground">
              AI drafted
            </span>
          </div>
          <span className="text-xs text-muted-foreground">Essay · 163 words</span>
        </div>

        <div className="grid sm:grid-cols-[1fr_1.1fr]">
          <div className="hidden border-r p-4 font-serif text-[13px] leading-relaxed text-muted-foreground sm:block">
            <p>
              <mark>Remote learning should remain an option in higher education</mark>, not because
              it is easier, but because it widens access without lowering standards.
            </p>
            <p className="mt-3">
              First, remote options serve students whom campus timetables exclude.{" "}
              <mark>38% of part-time students said they had missed a class</mark> because of work
              shifts.
            </p>
            <p className="mt-3">Second, well-designed online courses can match…</p>
          </div>

          <div className="grid content-start gap-3 p-4">
            <div className="flex items-baseline justify-between">
              <p className="text-sm font-semibold">Thesis and argument</p>
              <p className="text-xs text-muted-foreground">10 points</p>
            </div>
            <div className="grid grid-cols-2 gap-1.5">
              {levels.map((l) => {
                const chosen = l.points === 10;
                const suggested = l.points === 7;
                return (
                  <div
                    key={l.label}
                    className={
                      chosen
                        ? "relative rounded-lg border-2 border-primary bg-accent px-2.5 py-2"
                        : "relative rounded-lg border px-2.5 py-2"
                    }
                  >
                    <p className="flex items-center gap-1 text-xs font-medium">
                      {chosen ? <CheckIcon className="size-3 text-primary" /> : null}
                      {l.label}
                    </p>
                    <p className="text-[11px] text-muted-foreground">{l.points} pts</p>
                    {suggested ? (
                      <span className="absolute top-1.5 right-1.5 inline-flex items-center gap-0.5 rounded-full border bg-card px-1.5 text-[10px] font-medium">
                        <SparklesIcon className="size-2.5" />
                        AI
                      </span>
                    ) : null}
                  </div>
                );
              })}
            </div>
            <p className="rounded-lg bg-muted/70 p-2.5 text-xs leading-relaxed">
              <span className="font-medium">Feedback:</span> A precise, arguable claim that you
              sustain to the conclusion.
            </p>
            <p className="flex items-center gap-1.5 text-[11px] text-warning">
              <TriangleAlertIcon className="size-3" />
              Evidence and support: low confidence, check carefully
            </p>
            <div className="mt-1 flex items-center justify-between border-t pt-3">
              <p className="text-sm">
                Total <span className="font-semibold tabular-nums">26 / 30</span>
              </p>
              <span className="rounded-md bg-primary px-3 py-1.5 text-xs font-medium text-primary-foreground">
                Release grade
              </span>
            </div>
          </div>
        </div>
      </div>
    </figure>
  );
}
