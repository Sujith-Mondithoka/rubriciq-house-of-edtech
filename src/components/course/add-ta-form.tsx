"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { useForm } from "react-hook-form";
import { toast } from "sonner";
import { z } from "zod";

import { applyFieldErrors } from "@/components/forms/apply-field-errors";
import { TextField } from "@/components/forms/text-field";
import { Button } from "@/components/ui/button";
import type { ServerAction } from "@/lib/result";
import { addTaSchema } from "@/lib/validation/course.schema";

const formSchema = addTaSchema.pick({ email: true });
type FormValues = z.input<typeof formSchema>;

type AddTaFormProps = { courseId: string; action: ServerAction<{ name: string }> };

export function AddTaForm({ courseId, action }: AddTaFormProps) {
  const {
    register,
    handleSubmit,
    setError,
    reset,
    formState: { errors, isSubmitting },
  } = useForm<FormValues>({ resolver: zodResolver(formSchema), defaultValues: { email: "" } });

  const onSubmit = handleSubmit(async (values) => {
    const result = await action({ courseId, email: values.email });
    if (!result.ok) {
      if (!applyFieldErrors(result.fieldErrors, setError, ["email"])) toast.error(result.message);
      return;
    }
    toast.success(`${result.data.name} added as a TA`);
    reset();
  });

  return (
    <form onSubmit={onSubmit} noValidate className="flex flex-col gap-3 sm:flex-row sm:items-start">
      <div className="flex-1">
        <TextField
          id="ta-email"
          label="Add a TA by email"
          type="email"
          autoComplete="off"
          hint="They need a RubricIQ account first. TAs can grade but cannot release grades."
          error={errors.email?.message}
          {...register("email")}
        />
      </div>
      <Button
        type="submit"
        size="lg"
        className="sm:mt-6.5"
        disabled={isSubmitting}
        aria-busy={isSubmitting}
      >
        {isSubmitting ? "Adding…" : "Add TA"}
      </Button>
    </form>
  );
}
