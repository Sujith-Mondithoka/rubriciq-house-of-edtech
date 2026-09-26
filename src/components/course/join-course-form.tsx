"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { useRouter } from "next/navigation";
import { useForm } from "react-hook-form";
import { toast } from "sonner";

import { applyFieldErrors } from "@/components/forms/apply-field-errors";
import { TextField } from "@/components/forms/text-field";
import { Button } from "@/components/ui/button";
import type { ServerAction } from "@/lib/result";
import { joinCourseSchema, type JoinCourseInput } from "@/lib/validation/course.schema";

type JoinResult = { courseId: string; courseName: string; alreadyMember: boolean };

export function JoinCourseForm({ action }: { action: ServerAction<JoinResult> }) {
  const router = useRouter();
  const {
    register,
    handleSubmit,
    setError,
    formState: { errors, isSubmitting },
  } = useForm<JoinCourseInput>({
    resolver: zodResolver(joinCourseSchema),
    defaultValues: { joinCode: "" },
  });

  const onSubmit = handleSubmit(async (values) => {
    const result = await action(values);
    if (!result.ok) {
      if (!applyFieldErrors(result.fieldErrors, setError, ["joinCode"])) {
        toast.error(result.message);
      }
      return;
    }
    toast.success(
      result.data.alreadyMember
        ? `You are already in ${result.data.courseName}`
        : `Joined ${result.data.courseName}`,
    );
    router.push(`/courses/${result.data.courseId}`);
  });

  return (
    <form onSubmit={onSubmit} noValidate className="flex flex-col gap-3 sm:flex-row sm:items-start">
      <div className="flex-1">
        <TextField
          id="join-code"
          label="Join code"
          autoComplete="off"
          autoCapitalize="characters"
          spellCheck={false}
          placeholder="e.g. DEMO2026"
          hint="Ask your instructor for the course join code."
          error={errors.joinCode?.message}
          {...register("joinCode")}
        />
      </div>
      <Button
        type="submit"
        size="lg"
        className="sm:mt-6.5"
        disabled={isSubmitting}
        aria-busy={isSubmitting}
      >
        {isSubmitting ? "Joining…" : "Join course"}
      </Button>
    </form>
  );
}
