"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { cn } from "cn";
import { TriangleAlertIcon } from "lucide-react";
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

/** The AI's suggestion for one criterion: where it came from, how sure it was, and why. */
function AiSuggestion({ ai }: { ai: AiDetails | undefined }) {
  if (!ai) return null;
  const low = isLowConfidence(ai.confidence);
  return (
    <div className="grid gap-2 rounded-lg bg-muted/40 p-3 text-sm">
      <p className="flex flex-wrap items-center gap-2">
        <Badge variant="secondary">
          {ai.source === "AI_EDITED" ? "AI suggestion, edited" : "AI suggestion"}
        </Badge>
        {low ? (
          <Badge variant="destructive">
            <TriangleAlertIcon aria-hidden />
            Low confidence: check carefully
          </Badge>
        ) : null}
      </p>
      {ai.evidence.length ? (
        <div className="grid gap-1">
          <p className="text-muted-foreground">Evidence (highlighted in the answer):</p>
          <ul className="grid gap-1">
            {ai.evidence.map((quote) => (
              <li key={quote} className="border-l-2 pl-2 font-serif break-words italic">
                “{quote}”
              </li>
            ))}
          </ul>
        </div>
      ) : (
        <p className="text-muted-foreground">No verified evidence quotes.</p>
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
  const {
    control,
    register,
    handleSubmit,
    reset,
    formState: { errors, isDirty, isSubmitting },
  } = useForm<GradeFormInput>({
    resolver: zodResolver(gradeFormSchema),
    defaultValues: {
      overallFeedback: initial.overallFeedback,
      scores: criteria.map((c) => ({
        criterionId: c.id,
        levelId: scoreFor.get(c.id)?.levelId ?? null,
        feedback: scoreFor.get(c.id)?.feedback ?? "",
      })),
    },
  });

  const watched = useWatch({ control, name: "scores" }) ?? [];
  const pointsOf = new Map(criteria.flatMap((c) => c.levels.map((l) => [l.id, l.points])));
  const total = totalPoints(
    watched.map((s) => ({ points: (s?.levelId && pointsOf.get(s.levelId)) || 0 })),
  );
  const missing = missingCriteria(
    criteria.map((c) => c.id),
    watched.map((s) => ({ criterionId: s?.criterionId ?? "", levelId: s?.levelId ?? null })),
  );

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

  const releaseBlocker = isDirty
    ? "Save your changes before releasing."
    : !version || !reviewed
      ? "Save the grade before releasing."
      : missing.length
        ? `Score every criterion before releasing (${missing.length} left).`
        : null;

  return (
    <form onSubmit={onSave} noValidate className="grid gap-4" aria-label="Grade">
      <div
        className="sticky top-0 z-10 flex flex-wrap items-center justify-between gap-2 rounded-xl border bg-background/95 p-3 backdrop-blur"
        aria-live="polite"
      >
        <p>
          Total:{" "}
          <strong>
            {total} / {maxScore}
          </strong>
        </p>
        <p className="text-sm text-muted-foreground">
          {isDirty ? "Unsaved changes" : version ? "All changes saved" : "Not graded yet"}
        </p>
      </div>

      {criteria.map((c, index) => {
        const top = Math.max(...c.levels.map((l) => l.points));
        const feedbackError = errors.scores?.[index]?.feedback?.message;
        return (
          <fieldset key={c.id} className="grid gap-3 rounded-xl border p-4">
            <legend className="px-1 font-medium break-words">
              {index + 1}. {c.title}{" "}
              <span className="font-normal text-muted-foreground">({top} points)</span>
            </legend>
            {c.description ? (
              <p className="text-sm whitespace-pre-wrap text-muted-foreground">{c.description}</p>
            ) : null}
            <AiSuggestion ai={aiFor.get(c.id)} />
            <Controller
              control={control}
              name={`scores.${index}.levelId`}
              render={({ field }) => (
                <div className="grid gap-2">
                  {[...c.levels]
                    .sort((a, b) => b.points - a.points)
                    .map((l) => {
                      const id = `level-${c.id}-${l.id}`;
                      const checked = field.value === l.id;
                      return (
                        <label
                          key={l.id}
                          htmlFor={id}
                          className={cn(
                            "flex cursor-pointer gap-3 rounded-lg border p-3 has-focus-visible:ring-3 has-focus-visible:ring-ring/50",
                            checked ? "border-foreground bg-muted/60" : "hover:bg-muted/40",
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
                            className="mt-1 size-4 accent-foreground"
                          />
                          <span className="grid gap-0.5">
                            <span className="text-sm font-medium">
                              {l.label} · {l.points} {l.points === 1 ? "point" : "points"}
                            </span>
                            {l.descriptor ? (
                              <span className="text-sm whitespace-pre-wrap text-muted-foreground">
                                {l.descriptor}
                              </span>
                            ) : null}
                          </span>
                        </label>
                      );
                    })}
                  {field.value ? (
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      className="justify-self-start"
                      onClick={() => field.onChange(null)}
                    >
                      Clear level
                    </Button>
                  ) : null}
                </div>
              )}
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

      <TextareaField
        id="overall-feedback"
        label="Overall feedback"
        rows={4}
        maxLength={FEEDBACK_MAX}
        error={errors.overallFeedback?.message}
        {...register("overallFeedback")}
      />

      <div className="flex flex-wrap items-center gap-2">
        <Button
          type="submit"
          size="lg"
          disabled={isSubmitting || (!isDirty && version > 0)}
          aria-busy={isSubmitting}
        >
          {isSubmitting ? "Saving…" : "Save grade"}
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
      </div>
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
    </form>
  );
}
