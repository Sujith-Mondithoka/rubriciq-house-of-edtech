"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { cn } from "cn";
import { SparklesIcon, TriangleAlertIcon } from "lucide-react";
import { useEffect, useState } from "react";
import { Controller, useForm, useWatch } from "react-hook-form";
import { toast } from "sonner";

import { ConfirmDialog } from "@/components/forms/confirm-dialog";
import { TextareaField } from "@/components/forms/textarea-field";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { isLowConfidence } from "@/lib/confidence";
import { missingCriteria, totalPoints } from "@/lib/grading";
import type { ServerAction } from "@/lib/result";
import { FEEDBACK_MAX, type GradeFormInput, gradeFormSchema } from "@/lib/validation/grade.schema";

type Level = { id: string; label: string; points: number; descriptor: string };
type Criterion = { id: string; title: string; description: string; levels: Level[] };

type Saved = { version: number; totalScore: number };

type AiDetails = {
  source: "AI" | "HUMAN" | "AI_EDITED";
  confidence: number | null;
  evidence: string[];
};

/** Where the criterion's score came from, how sure the AI was, and the quotes it relied on. */
function AiSuggestion({ ai }: { ai: AiDetails | undefined }) {
  if (!ai) return null;
  const low = isLowConfidence(ai.confidence);
  return (
    <div className="grid gap-2">
      <p className="flex flex-wrap items-center gap-2">
        <Badge variant="secondary" className="gap-1">
          <SparklesIcon aria-hidden />
          {ai.source === "AI_EDITED" ? "AI suggestion, edited" : "AI suggestion"}
        </Badge>
        {low ? (
          <Badge className="gap-1 border-warning/30 bg-warning/10 text-warning">
            <TriangleAlertIcon aria-hidden />
            Low confidence: check carefully
          </Badge>
        ) : null}
      </p>
      {ai.evidence.length ? (
        <details className="group rounded-lg bg-muted/60 text-sm">
          <summary className="cursor-pointer list-none rounded-lg px-3 py-2 text-muted-foreground outline-none select-none focus-visible:ring-3 focus-visible:ring-ring/50 [&::-webkit-details-marker]:hidden">
            <span className="inline-block transition-transform group-open:rotate-90" aria-hidden>
              ›
            </span>{" "}
            Evidence ({ai.evidence.length}), highlighted in the answer
          </summary>
          <ul className="grid gap-1.5 px-3 pb-3">
            {ai.evidence.map((quote) => (
              <li
                key={quote}
                className="border-l-2 border-primary/50 pl-2.5 font-serif break-words"
              >
                “{quote}”
              </li>
            ))}
          </ul>
        </details>
      ) : (
        <p className="text-sm text-muted-foreground">No verified evidence quotes.</p>
      )}
    </div>
  );
}

type GraderPanelProps = {
  submissionId: string;
  assignmentId: string;
  criteria: Criterion[];
  maxScore: number;
  initial: {
    version: number;
    reviewed: boolean;
    overallFeedback: string;
    scores: {
      criterionId: string;
      levelId: string | null;
      feedback: string;
      /** Staff-only AI details for this criterion (absent for manual scores). */
      ai?: AiDetails;
    }[];
  };
  /** The level the AI originally suggested per criterion (staff only). */
  suggested?: Record<string, string>;
  canRelease: boolean;
  saveAction: ServerAction<Saved>;
  releaseAction: ServerAction<{ released: number }>;
};

/** The right-hand side of the split view: pick a level and write feedback per criterion. */
export function GraderPanel({
  submissionId,
  assignmentId,
  criteria,
  maxScore,
  initial,
  suggested = {},
  canRelease,
  saveAction,
  releaseAction,
}: GraderPanelProps) {
  const [version, setVersion] = useState(initial.version);
  const [reviewed, setReviewed] = useState(initial.reviewed);
  const scoreFor = new Map(initial.scores.map((s) => [s.criterionId, s]));
  const aiFor = new Map(
    initial.scores
      .filter((s) => s.ai && s.ai.source !== "HUMAN")
      .map((s) => [s.criterionId, s.ai!]),
  );
  const serverValues: GradeFormInput = {
    overallFeedback: initial.overallFeedback,
    scores: criteria.map((c) => ({
      criterionId: c.id,
      levelId: scoreFor.get(c.id)?.levelId ?? null,
      feedback: scoreFor.get(c.id)?.feedback ?? "",
    })),
  };
  const {
    control,
    register,
    handleSubmit,
    reset,
    formState: { errors, isDirty, isSubmitting },
  } = useForm<GradeFormInput>({
    resolver: zodResolver(gradeFormSchema),
    // Server data that changes while the page is open (e.g. an AI draft arriving) flows into
    // the form without remounting it, so an open confirmation dialog stays open. Fields the
    // grader is editing are kept.
    values: serverValues,
    resetOptions: { keepDirtyValues: true },
  });

  // Adopt a newer server version only when nothing is being edited; otherwise the next save
  // reports the conflict. After our own save the versions already match.
  const [seenVersion, setSeenVersion] = useState(initial.version);
  if (initial.version !== seenVersion) {
    setSeenVersion(initial.version);
    if (initial.version !== version && !isDirty) {
      setVersion(initial.version);
      setReviewed(initial.reviewed);
    }
  }

  const watched = useWatch({ control, name: "scores" }) ?? [];
  const pointsOf = new Map(criteria.flatMap((c) => c.levels.map((l) => [l.id, l.points])));
  const total = totalPoints(
    watched.map((s) => ({ points: (s?.levelId && pointsOf.get(s.levelId)) || 0 })),
  );
  const missing = missingCriteria(
    criteria.map((c) => c.id),
    watched.map((s) => ({ criterionId: s?.criterionId ?? "", levelId: s?.levelId ?? null })),
  );
  const scoredCount = criteria.length - missing.length;

  // Warn before leaving with unsaved scores.
  useEffect(() => {
    if (!isDirty) return;
    const onBeforeUnload = (event: BeforeUnloadEvent) => event.preventDefault();
    window.addEventListener("beforeunload", onBeforeUnload);
    return () => window.removeEventListener("beforeunload", onBeforeUnload);
  }, [isDirty]);

  const onSave = handleSubmit(async (values) => {
    const result = await saveAction({ submissionId, version, ...values });
    if (!result.ok) {
      if (result.code === "CONFLICT") {
        toast.error(result.message, {
          action: { label: "Reload", onClick: () => window.location.reload() },
          duration: 15_000,
        });
      } else {
        toast.error(result.message);
      }
      return;
    }
    setVersion(result.data.version);
    setReviewed(true);
    reset(values);
    toast.success(`Grade saved (${result.data.totalScore} / ${maxScore})`);
  });

  // An AI draft nobody has saved yet: a person must save it (even unchanged) before release.
  const unreviewedDraft = version > 0 && !reviewed;
  const releaseBlocker = isDirty
    ? "Save your changes before releasing."
    : unreviewedDraft
      ? "Accept and save the AI draft before releasing."
      : !version
        ? "Save the grade before releasing."
        : missing.length
          ? `Score every criterion before releasing (${missing.length} left).`
          : null;

  return (
    <form onSubmit={onSave} noValidate className="grid gap-4" aria-label="Grade">
      {criteria.map((c, index) => {
        const top = Math.max(...c.levels.map((l) => l.points));
        const feedbackError = errors.scores?.[index]?.feedback?.message;
        const aiLevel = c.levels.find((l) => l.id === suggested[c.id]);
        return (
          <fieldset key={c.id} className="card-surface grid gap-4 p-4 sm:p-5">
            <legend className="sr-only">
              {index + 1}. {c.title} ({top} points)
            </legend>
            <div className="grid gap-1" aria-hidden>
              <div className="flex items-baseline justify-between gap-3">
                <p className="font-semibold break-words">
                  <span className="text-muted-foreground tabular-nums">{index + 1}.</span> {c.title}
                </p>
                <p className="shrink-0 text-sm text-muted-foreground tabular-nums">{top} points</p>
              </div>
              {c.description ? (
                <p className="text-sm whitespace-pre-wrap text-muted-foreground">{c.description}</p>
              ) : null}
            </div>
            <AiSuggestion ai={aiFor.get(c.id)} />
            <Controller
              control={control}
              name={`scores.${index}.levelId`}
              render={({ field }) => {
                const chosen = c.levels.find((l) => l.id === field.value);
                return (
                  <div className="grid gap-2">
                    <div className="grid gap-2 sm:grid-cols-2">
                      {[...c.levels]
                        .sort((a, b) => b.points - a.points)
                        .map((l) => {
                          const id = `level-${c.id}-${l.id}`;
                          const checked = field.value === l.id;
                          const isAi = aiLevel?.id === l.id;
                          return (
                            <label
                              key={l.id}
                              htmlFor={id}
                              className={cn(
                                "relative flex cursor-pointer gap-3 rounded-lg border p-3 transition-colors has-focus-visible:ring-3 has-focus-visible:ring-ring/50",
                                checked
                                  ? "border-primary bg-accent ring-1 ring-primary"
                                  : "hover:border-foreground/25 hover:bg-muted/50",
                              )}
                            >
                              <input
                                id={id}
                                type="radio"
                                name={field.name}
                                value={l.id}
                                checked={checked}
                                onChange={() => field.onChange(l.id)}
                                onBlur={field.onBlur}
                                className="mt-0.5 size-4 shrink-0 cursor-pointer appearance-none rounded-full border border-input bg-card outline-none checked:border-primary checked:bg-primary checked:shadow-[inset_0_0_0_3px_var(--card)]"
                              />
                              <span className="grid min-w-0 gap-0.5 pr-8">
                                <span className="text-sm font-medium">
                                  {l.label} · {l.points} {l.points === 1 ? "point" : "points"}
                                </span>
                                {l.descriptor ? (
                                  <span className="text-xs whitespace-pre-wrap text-muted-foreground">
                                    {l.descriptor}
                                  </span>
                                ) : null}
                              </span>
                              {isAi ? (
                                <span className="absolute top-2 right-2 inline-flex items-center gap-0.5 rounded-full border bg-card px-1.5 py-0.5 text-[11px] font-medium text-muted-foreground">
                                  <SparklesIcon aria-hidden className="size-3" />
                                  AI
                                  <span className="sr-only"> suggested this level</span>
                                </span>
                              ) : null}
                            </label>
                          );
                        })}
                    </div>
                    <div className="flex flex-wrap items-center justify-between gap-2 text-sm">
                      <p className="text-muted-foreground" aria-live="polite">
                        {aiLevel && chosen && aiLevel.id !== chosen.id
                          ? `AI suggested ${aiLevel.label}; your choice: ${chosen.label}.`
                          : aiLevel && chosen
                            ? `Matches the AI suggestion (${aiLevel.label}).`
                            : chosen
                              ? null
                              : "Not scored yet."}
                      </p>
                      {field.value ? (
                        <Button
                          type="button"
                          variant="ghost"
                          size="sm"
                          onClick={() => field.onChange(null)}
                        >
                          Clear level
                        </Button>
                      ) : null}
                    </div>
                  </div>
                );
              }}
            />
            <TextareaField
              id={`feedback-${c.id}`}
              label={`Feedback on ${c.title}`}
              rows={3}
              maxLength={FEEDBACK_MAX}
              error={feedbackError}
              {...register(`scores.${index}.feedback`)}
            />
          </fieldset>
        );
      })}

      <div className="card-surface p-4 sm:p-5">
        <TextareaField
          id="overall-feedback"
          label="Overall feedback"
          rows={4}
          maxLength={FEEDBACK_MAX}
          error={errors.overallFeedback?.message}
          {...register("overallFeedback")}
        />
      </div>

      {/* Always-visible summary and actions while scrolling through the criteria. */}
      <div className="sticky bottom-0 z-10 -mx-1 grid gap-3 rounded-xl border bg-card/95 p-3 shadow-lg backdrop-blur sm:p-4">
        <div className="flex flex-wrap items-center justify-between gap-2" aria-live="polite">
          <p>
            Total:{" "}
            <strong className="text-lg tabular-nums">
              {total} / {maxScore}
            </strong>{" "}
            <span className="ml-1 text-sm text-muted-foreground">
              {scoredCount} of {criteria.length} scored
            </span>
          </p>
          <p className="text-sm text-muted-foreground">
            {isDirty ? "Unsaved changes" : version ? "All changes saved" : "Not graded yet"}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Button
            type="submit"
            size="lg"
            // Unchanged saves are pointless once a person has reviewed the grade, but an
            // unreviewed AI draft must be savable as-is (that is how a teacher accepts it).
            disabled={isSubmitting || (!isDirty && version > 0 && reviewed)}
            aria-busy={isSubmitting}
          >
            {isSubmitting
              ? "Saving…"
              : unreviewedDraft && !isDirty
                ? "Accept and save"
                : "Save grade"}
          </Button>
          {canRelease ? (
            <ConfirmDialog
              trigger={
                <Button
                  type="button"
                  variant="outline"
                  size="lg"
                  disabled={Boolean(releaseBlocker) || isSubmitting}
                  aria-describedby={releaseBlocker ? "release-blocker" : undefined}
                >
                  Release grade
                </Button>
              }
              title="Release this grade?"
              description={`The student sees ${total} / ${maxScore} and all feedback right away. After release, the grade can only change through a regrade request.`}
              confirmLabel="Release grade"
              pendingLabel="Releasing…"
              onConfirm={async () => {
                const result = await releaseAction({
                  assignmentId,
                  grades: [{ submissionId, version }],
                });
                if (!result.ok) {
                  toast.error(result.message);
                  return false;
                }
                toast.success("Grade released");
                return true;
              }}
            />
          ) : null}
          {canRelease && releaseBlocker ? (
            <p id="release-blocker" className="text-sm text-muted-foreground">
              {releaseBlocker}
            </p>
          ) : null}
          {!canRelease ? (
            <p className="text-sm text-muted-foreground">
              The instructor reviews and releases grades to students.
            </p>
          ) : null}
        </div>
      </div>
    </form>
  );
}
