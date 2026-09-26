"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { useRouter } from "next/navigation";
import { useForm } from "react-hook-form";
import { toast } from "sonner";
import { z } from "zod";

import { useIsClient } from "@/components/common/local-date-time";
import { applyFieldErrors } from "@/components/forms/apply-field-errors";
import { TextareaField } from "@/components/forms/textarea-field";
import { TextField } from "@/components/forms/text-field";
import { Button } from "@/components/ui/button";
import { fromLocalInputValue, toLocalInputValue } from "@/lib/dates";
import type { ServerAction } from "@/lib/result";
import { ASSIGNMENT_TITLE_MAX, INSTRUCTIONS_MAX } from "@/lib/validation/assignment.schema";

const formSchema = z.object({
  title: z
    .string()
    .trim()
    .min(1, "Enter a title")
    .max(ASSIGNMENT_TITLE_MAX, `Use at most ${ASSIGNMENT_TITLE_MAX} characters`),
  instructions: z
    .string()
    .trim()
    .max(INSTRUCTIONS_MAX, `Use at most ${INSTRUCTIONS_MAX.toLocaleString("en")} characters`),
  dueLocal: z
    .string()
    .refine((value) => fromLocalInputValue(value) !== null, "Choose a due date and time"),
  allowLate: z.boolean(),
});
type FormValues = z.infer<typeof formSchema>;

type Saved = { courseId: string; assignmentId: string };

type AssignmentFormProps =
  | { mode: "create"; courseId: string; action: ServerAction<Saved> }
  | {
      mode: "edit";
      assignmentId: string;
      defaults: { title: string; instructions: string; dueAt: string; allowLate: boolean };
      action: ServerAction<Saved>;
    };

/**
 * The due date is typed in the browser's time zone and sent as a UTC ISO string, so the form
 * renders only in the browser (the server does not know the user's time zone).
 */
export function AssignmentForm(props: AssignmentFormProps) {
  const isClient = useIsClient();
  if (!isClient) {
    return <div className="h-96 animate-pulse rounded-xl bg-muted" aria-hidden />;
  }
  return <AssignmentFormInner {...props} />;
}

function AssignmentFormInner(props: AssignmentFormProps) {
  const router = useRouter();
  const timeZone = Intl.DateTimeFormat().resolvedOptions().timeZone;
  const {
    register,
    handleSubmit,
    setError,
    formState: { errors, isSubmitting },
  } = useForm<FormValues>({
    resolver: zodResolver(formSchema),
    defaultValues:
      props.mode === "edit"
        ? {
            title: props.defaults.title,
            instructions: props.defaults.instructions,
            dueLocal: toLocalInputValue(new Date(props.defaults.dueAt)),
            allowLate: props.defaults.allowLate,
          }
        : { title: "", instructions: "", dueLocal: "", allowLate: false },
  });

  const onSubmit = handleSubmit(async ({ dueLocal, ...values }) => {
    const dueAt = fromLocalInputValue(dueLocal)!.toISOString();
    const input =
      props.mode === "create"
        ? { courseId: props.courseId, ...values, dueAt }
        : { assignmentId: props.assignmentId, ...values, dueAt };
    const result = await props.action(input);
    if (!result.ok) {
      const marked = applyFieldErrors(result.fieldErrors, setError, [
        "title",
        "instructions",
        "allowLate",
      ]);
      if (result.fieldErrors?.dueAt) {
        setError("dueLocal", { type: "server", message: result.fieldErrors.dueAt[0] });
      } else if (!marked) {
        toast.error(result.message);
      }
      return;
    }
    toast.success(props.mode === "create" ? "Assignment created" : "Assignment saved");
    const { courseId, assignmentId } = result.data;
    router.push(
      props.mode === "create"
        ? `/courses/${courseId}/assignments/${assignmentId}/rubric`
        : `/courses/${courseId}/assignments/${assignmentId}`,
    );
  });

  return (
    <form onSubmit={onSubmit} noValidate className="grid gap-4">
      <TextField
        id="assignment-title"
        label="Title"
        maxLength={ASSIGNMENT_TITLE_MAX}
        autoComplete="off"
        error={errors.title?.message}
        {...register("title")}
      />
      <TextareaField
        id="assignment-instructions"
        label="Instructions"
        rows={8}
        maxLength={INSTRUCTIONS_MAX}
        hint="What students should write. Shown as plain text."
        error={errors.instructions?.message}
        {...register("instructions")}
      />
      <TextField
        id="assignment-due"
        label="Due date and time"
        type="datetime-local"
        hint={`In your time zone (${timeZone}).`}
        error={errors.dueLocal?.message}
        {...register("dueLocal")}
      />
      <div className="flex items-start gap-3">
        <input
          id="assignment-allow-late"
          type="checkbox"
          className="mt-1 size-4 accent-primary focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none"
          aria-describedby="assignment-allow-late-hint"
          {...register("allowLate")}
        />
        <div className="grid gap-1">
          <label htmlFor="assignment-allow-late" className="text-sm font-medium">
            Accept late submissions
          </label>
          <p id="assignment-allow-late-hint" className="text-sm text-muted-foreground">
            Students can still submit after the deadline; their work is marked late.
          </p>
        </div>
      </div>
      <div>
        <Button type="submit" size="lg" disabled={isSubmitting} aria-busy={isSubmitting}>
          {isSubmitting
            ? "Saving…"
            : props.mode === "create"
              ? "Create and add rubric"
              : "Save changes"}
        </Button>
      </div>
    </form>
  );
}
