"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { useForm } from "react-hook-form";
import { toast } from "sonner";
import { z } from "zod";

import { applyFieldErrors } from "@/components/forms/apply-field-errors";
import { TextareaField } from "@/components/forms/textarea-field";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import type { ServerAction } from "@/lib/result";
import { REASON_MAX, createRegradeSchema } from "@/lib/validation/regrade.schema";

const formSchema = z
  .object({ criterionId: z.string(), reason: createRegradeSchema.shape.reason })
  .strict();
type FormValues = z.input<typeof formSchema>;

type RegradeRequestFormProps = {
  submissionId: string;
  criteria: { id: string; title: string }[];
  action: ServerAction<unknown>;
};

/** The student's one regrade request for a released grade. */
export function RegradeRequestForm({ submissionId, criteria, action }: RegradeRequestFormProps) {
  const {
    register,
    handleSubmit,
    setError,
    formState: { errors, isSubmitting },
  } = useForm<FormValues>({
    resolver: zodResolver(formSchema),
    defaultValues: { criterionId: "", reason: "" },
  });

  const onSubmit = handleSubmit(async (values) => {
    const result = await action({
      submissionId,
      criterionId: values.criterionId || null,
      reason: values.reason,
    });
    if (!result.ok) {
      if (!applyFieldErrors(result.fieldErrors, setError, ["criterionId", "reason"])) {
        toast.error(result.message);
      }
      return;
    }
    toast.success("Regrade request sent");
  });

  const criterionError = errors.criterionId?.message;
  return (
    <form onSubmit={onSubmit} noValidate className="grid gap-3 rounded-xl border p-4">
      <div className="grid gap-2">
        <Label htmlFor="regrade-criterion">What should be looked at again?</Label>
        <select
          id="regrade-criterion"
          className="h-10 rounded-lg border border-input bg-transparent px-2.5 text-base outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 md:text-sm dark:bg-input/30"
          aria-invalid={criterionError ? true : undefined}
          aria-describedby={criterionError ? "regrade-criterion-error" : undefined}
          {...register("criterionId")}
        >
          <option value="">The whole grade</option>
          {criteria.map((c) => (
            <option key={c.id} value={c.id}>
              {c.title}
            </option>
          ))}
        </select>
        {criterionError ? (
          <p id="regrade-criterion-error" className="text-sm text-destructive">
            {criterionError}
          </p>
        ) : null}
      </div>
      <TextareaField
        id="regrade-reason"
        label="Why should it be regraded?"
        hint="Point to the part of your answer and the rubric level you think fits."
        rows={4}
        maxLength={REASON_MAX}
        error={errors.reason?.message}
        {...register("reason")}
      />
      <Button
        type="submit"
        size="lg"
        className="justify-self-start"
        disabled={isSubmitting}
        aria-busy={isSubmitting}
      >
        {isSubmitting ? "Sending…" : "Request regrade"}
      </Button>
    </form>
  );
}
