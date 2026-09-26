"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { ArrowDownIcon, ArrowUpIcon, PlusIcon, Trash2Icon } from "lucide-react";
import { useRouter } from "next/navigation";
import {
  type Control,
  type FieldErrors,
  type UseFormRegister,
  useFieldArray,
  useForm,
  useWatch,
} from "react-hook-form";
import { toast } from "sonner";
import { z } from "zod";

import { TextareaField } from "@/components/forms/textarea-field";
import { TextField } from "@/components/forms/text-field";
import { Button } from "@/components/ui/button";
import type { ServerAction } from "@/lib/result";
import {
  CRITERION_DESCRIPTION_MAX,
  CRITERION_TITLE_MAX,
  LEVEL_DESCRIPTOR_MAX,
  LEVEL_LABEL_MAX,
  MAX_CRITERIA,
  MAX_LEVELS,
  MIN_LEVELS,
  POINTS_MAX,
  rubricMaxScore,
  saveRubricSchema,
} from "@/lib/validation/assignment.schema";

const formSchema = z.object({ criteria: saveRubricSchema.shape.criteria });
type RubricForm = z.infer<typeof formSchema>;
type Criterion = RubricForm["criteria"][number];

const newCriterion = (): Criterion => ({
  title: "",
  description: "",
  levels: [
    { label: "Beginning", points: 0, descriptor: "" },
    { label: "Developing", points: 5, descriptor: "" },
    { label: "Proficient", points: 10, descriptor: "" },
  ],
});

type RubricBuilderProps = {
  assignmentId: string;
  courseId: string;
  initialCriteria: Criterion[];
  action: ServerAction<{ maxScore: number }>;
};

export default function RubricBuilder({
  assignmentId,
  courseId,
  initialCriteria,
  action,
}: RubricBuilderProps) {
  const router = useRouter();
  const {
    control,
    register,
    handleSubmit,
    formState: { errors, isSubmitting, isDirty },
    reset,
  } = useForm<RubricForm>({
    resolver: zodResolver(formSchema),
    defaultValues: { criteria: initialCriteria.length ? initialCriteria : [newCriterion()] },
  });
  const criteria = useFieldArray({ control, name: "criteria" });
  const watched = useWatch({ control, name: "criteria" });
  const maxScore = rubricMaxScore(
    (watched ?? []).map((c) => ({
      levels: (c?.levels ?? []).filter((l) => Number.isFinite(l?.points)),
    })),
  );

  const onSubmit = handleSubmit(async (values) => {
    const result = await action({ assignmentId, criteria: values.criteria });
    if (!result.ok) {
      toast.error(result.message);
      return;
    }
    toast.success(`Rubric saved · ${result.data.maxScore} points`);
    reset(values);
    router.push(`/courses/${courseId}/assignments/${assignmentId}`);
  });

  return (
    <form onSubmit={onSubmit} noValidate className="grid gap-4">
      <ol className="grid gap-4">
        {criteria.fields.map((field, index) => (
          <li key={field.id} className="grid gap-4 rounded-xl border p-4">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <h3 className="font-medium">Criterion {index + 1}</h3>
              <div className="flex gap-1">
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  disabled={index === 0}
                  onClick={() => criteria.move(index, index - 1)}
                  aria-label={`Move criterion ${index + 1} up`}
                >
                  <ArrowUpIcon aria-hidden />
                </Button>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  disabled={index === criteria.fields.length - 1}
                  onClick={() => criteria.move(index, index + 1)}
                  aria-label={`Move criterion ${index + 1} down`}
                >
                  <ArrowDownIcon aria-hidden />
                </Button>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  disabled={criteria.fields.length === 1}
                  onClick={() => criteria.remove(index)}
                  aria-label={`Remove criterion ${index + 1}`}
                >
                  <Trash2Icon aria-hidden />
                </Button>
              </div>
            </div>
            <TextField
              id={`criteria-${index}-title`}
              label="Title"
              maxLength={CRITERION_TITLE_MAX}
              autoComplete="off"
              error={errors.criteria?.[index]?.title?.message}
              {...register(`criteria.${index}.title`)}
            />
            <TextareaField
              id={`criteria-${index}-description`}
              label="What this criterion assesses (optional)"
              rows={2}
              maxLength={CRITERION_DESCRIPTION_MAX}
              error={errors.criteria?.[index]?.description?.message}
              {...register(`criteria.${index}.description`)}
            />
            <LevelsEditor
              control={control}
              register={register}
              errors={errors}
              criterionIndex={index}
            />
          </li>
        ))}
      </ol>

      {errors.criteria?.root?.message || errors.criteria?.message ? (
        <p role="alert" className="text-sm text-destructive">
          {errors.criteria?.root?.message ?? errors.criteria?.message}
        </p>
      ) : null}

      <div className="flex flex-wrap items-center justify-between gap-3">
        <Button
          type="button"
          variant="outline"
          size="lg"
          disabled={criteria.fields.length >= MAX_CRITERIA}
          onClick={() => criteria.append(newCriterion())}
        >
          <PlusIcon aria-hidden />
          Add criterion
        </Button>
        <p className="text-sm" aria-live="polite">
          Max score: <strong>{maxScore}</strong> points
        </p>
      </div>

      <div className="sticky bottom-0 -mx-4 flex gap-2 border-t bg-background/95 px-4 py-3 backdrop-blur">
        <Button type="submit" size="lg" disabled={isSubmitting} aria-busy={isSubmitting}>
          {isSubmitting ? "Saving…" : "Save rubric"}
        </Button>
        {isDirty ? (
          <span className="self-center text-sm text-muted-foreground">Unsaved changes</span>
        ) : null}
      </div>
    </form>
  );
}

function LevelsEditor({
  control,
  register,
  errors,
  criterionIndex,
}: {
  control: Control<RubricForm>;
  register: UseFormRegister<RubricForm>;
  errors: FieldErrors<RubricForm>;
  criterionIndex: number;
}) {
  const levels = useFieldArray({ control, name: `criteria.${criterionIndex}.levels` });
  const levelErrors = errors.criteria?.[criterionIndex]?.levels;
  const groupId = `criteria-${criterionIndex}-levels`;

  return (
    <fieldset className="grid gap-3" aria-describedby={`${groupId}-hint`}>
      <legend className="text-sm font-medium">Levels</legend>
      <p id={`${groupId}-hint`} className="text-sm text-muted-foreground">
        {MIN_LEVELS}–{MAX_LEVELS} levels, each with different whole points from 0 to {POINTS_MAX}.
      </p>
      <ul className="grid gap-3">
        {levels.fields.map((field, index) => {
          const prefix = `criteria-${criterionIndex}-levels-${index}`;
          return (
            <li
              key={field.id}
              className="grid gap-3 rounded-lg bg-muted/40 p-3 sm:grid-cols-[1fr_7rem_auto]"
            >
              <TextField
                id={`${prefix}-label`}
                label={`Level ${index + 1} label`}
                maxLength={LEVEL_LABEL_MAX}
                autoComplete="off"
                error={levelErrors?.[index]?.label?.message}
                {...register(`criteria.${criterionIndex}.levels.${index}.label`)}
              />
              <TextField
                id={`${prefix}-points`}
                label="Points"
                type="number"
                inputMode="numeric"
                min={0}
                max={POINTS_MAX}
                step={1}
                error={levelErrors?.[index]?.points?.message}
                {...register(`criteria.${criterionIndex}.levels.${index}.points`, {
                  valueAsNumber: true,
                })}
              />
              <Button
                type="button"
                variant="ghost"
                size="icon"
                className="sm:mt-6.5"
                disabled={levels.fields.length <= MIN_LEVELS}
                onClick={() => levels.remove(index)}
                aria-label={`Remove level ${index + 1}`}
              >
                <Trash2Icon aria-hidden />
              </Button>
              <div className="sm:col-span-3">
                <TextareaField
                  id={`${prefix}-descriptor`}
                  label="Descriptor (optional)"
                  rows={2}
                  maxLength={LEVEL_DESCRIPTOR_MAX}
                  error={levelErrors?.[index]?.descriptor?.message}
                  {...register(`criteria.${criterionIndex}.levels.${index}.descriptor`)}
                />
              </div>
            </li>
          );
        })}
      </ul>
      {levelErrors?.root?.message || levelErrors?.message ? (
        <p className="text-sm text-destructive">
          {levelErrors?.root?.message ?? levelErrors?.message}
        </p>
      ) : null}
      <div>
        <Button
          type="button"
          variant="outline"
          size="sm"
          disabled={levels.fields.length >= MAX_LEVELS}
          onClick={() => levels.append({ label: "", points: NaN, descriptor: "" })}
        >
          <PlusIcon aria-hidden />
          Add level
        </Button>
      </div>
    </fieldset>
  );
}
