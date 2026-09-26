"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { cn } from "cn";
import { useState, useTransition } from "react";
import { Controller, useForm, useWatch } from "react-hook-form";
import { toast } from "sonner";
import { z } from "zod";

import { TextareaField } from "@/components/forms/textarea-field";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import type { ServerAction } from "@/lib/result";
import { FEEDBACK_MAX } from "@/lib/validation/grade.schema";
import { resolveRegradeSchema } from "@/lib/validation/regrade.schema";

type Criterion = {
  id: string;
  title: string;
  levels: { id: string; label: string; points: number }[];
};

type ResolveRegradeFormProps = {
  regradeId: string;
  version: number;
  criteria: Criterion[];
  /** Current level per criterion. */
  current: Record<string, string | null>;
  /** The criterion the student asked about (listed first), or null for the whole grade. */
  focusCriterionId: string | null;
  maxScore: number;
  action: ServerAction<{ status: string; totalScore: number }>;
};

const formSchema = z.object({
  decision: resolveRegradeSchema.shape.decision,
  response: resolveRegradeSchema.shape.response,
  levels: z.record(z.string(), z.string().nullable()),
});
type FormValues = z.infer<typeof formSchema>;

/** Accept (changing levels) or keep the grade, with a response to the student. */
export function ResolveRegradeForm({
  regradeId,
  version,
  criteria,
  current,
  focusCriterionId,
  maxScore,
  action,
}: ResolveRegradeFormProps) {
  const [confirming, setConfirming] = useState<FormValues | null>(null);
  const [pending, start] = useTransition();
  const {
    control,
    register,
    handleSubmit,
    setError,
    formState: { errors },
  } = useForm<FormValues>({
    resolver: zodResolver(formSchema),
    defaultValues: { decision: "REJECTED", response: "", levels: current },
  });
  const decision = useWatch({ control, name: "decision" });
  const levels = useWatch({ control, name: "levels" }) ?? current;
  const pointsOf = new Map(criteria.flatMap((c) => c.levels.map((l) => [l.id, l.points])));
  const total = Object.values(levels).reduce(
    (sum, id) => sum + (id ? (pointsOf.get(id) ?? 0) : 0),
    0,
  );
  const changes = criteria
    .filter((c) => levels[c.id] && levels[c.id] !== current[c.id])
    .map((c) => ({ criterionId: c.id, levelId: levels[c.id]! }));
  const ordered = [...criteria].sort(
    (a, b) => Number(b.id === focusCriterionId) - Number(a.id === focusCriterionId),
  );

  const onSubmit = handleSubmit((values) => {
    if (values.decision === "ACCEPTED" && !changes.length) {
      setError("decision", { message: "Change at least one level to accept, or keep the grade." });
      return;
    }
    setConfirming(values);
  });

  const submit = () =>
    start(async () => {
      if (!confirming) return;
      const result = await action({
        regradeId,
        version,
        decision: confirming.decision,
        response: confirming.response,
        changes: confirming.decision === "ACCEPTED" ? changes : [],
      });
      setConfirming(null);
      if (!result.ok) {
        toast.error(result.message);
        return;
      }
      toast.success(
        result.data.status === "ACCEPTED"
          ? `Regrade accepted: new score ${result.data.totalScore} / ${maxScore}`
          : "Regrade answered: grade unchanged",
      );
    });

  return (
    <form onSubmit={onSubmit} noValidate className="grid gap-4 rounded-xl border p-4">
      <h4 className="font-medium">Resolve the request</h4>
      <fieldset className="grid gap-2">
        <legend className="mb-2 text-sm font-medium">Decision</legend>
        {(
          [
            ["REJECTED", "Keep the grade"],
            ["ACCEPTED", "Accept and change levels"],
          ] as const
        ).map(([value, label]) => (
          <label key={value} className="flex items-center gap-2 text-sm">
            <input
              type="radio"
              value={value}
              className="size-4 accent-foreground"
              aria-describedby={errors.decision ? "decision-error" : undefined}
              {...register("decision")}
            />
            {label}
          </label>
        ))}
        {errors.decision ? (
          <p id="decision-error" className="text-sm text-destructive">
            {errors.decision.message}
          </p>
        ) : null}
      </fieldset>

      {decision === "ACCEPTED"
        ? ordered.map((c) => (
            <fieldset key={c.id} className="grid gap-2 rounded-lg border p-3">
              <legend className="px-1 text-sm font-medium break-words">
                {c.title}
                {c.id === focusCriterionId ? " (requested)" : ""}
              </legend>
              <Controller
                control={control}
                name={`levels.${c.id}`}
                render={({ field }) => (
                  <div className="grid gap-1">
                    {[...c.levels]
                      .sort((a, b) => b.points - a.points)
                      .map((l) => (
                        <label
                          key={l.id}
                          className={cn(
                            "flex items-center gap-2 rounded-md p-2 text-sm",
                            field.value === l.id && "bg-muted/60",
                          )}
                        >
                          <input
                            type="radio"
                            name={field.name}
                            value={l.id}
                            checked={field.value === l.id}
                            onChange={() => field.onChange(l.id)}
                            className="size-4 accent-foreground"
                          />
                          {l.label} · {l.points} {l.points === 1 ? "point" : "points"}
                          {current[c.id] === l.id ? (
                            <span className="text-muted-foreground">(current)</span>
                          ) : null}
                        </label>
                      ))}
                  </div>
                )}
              />
            </fieldset>
          ))
        : null}

      <TextareaField
        id="regrade-response"
        label="Response to the student"
        rows={3}
        maxLength={FEEDBACK_MAX}
        error={errors.response?.message}
        {...register("response")}
      />
      <p className="text-sm" aria-live="polite">
        {decision === "ACCEPTED"
          ? `New total: ${total} / ${maxScore}`
          : "The grade stays the same."}
      </p>
      <Button type="submit" size="lg" className="justify-self-start" disabled={pending}>
        Resolve request
      </Button>

      <AlertDialog
        open={confirming !== null}
        onOpenChange={(open) => !open && !pending && setConfirming(null)}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              {confirming?.decision === "ACCEPTED"
                ? "Change the released grade?"
                : "Keep the grade?"}
            </AlertDialogTitle>
            <AlertDialogDescription>
              {confirming?.decision === "ACCEPTED"
                ? `The student's score becomes ${total} / ${maxScore} and they see your response. This is recorded in the audit log.`
                : "The student sees your response. The request is closed and cannot be raised again."}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={pending}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              disabled={pending}
              aria-busy={pending}
              onClick={(event) => {
                event.preventDefault();
                submit();
              }}
            >
              {pending
                ? "Saving…"
                : confirming?.decision === "ACCEPTED"
                  ? "Update grade"
                  : "Keep grade"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </form>
  );
}
