"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { useRouter } from "next/navigation";
import { useForm } from "react-hook-form";
import { toast } from "sonner";

import { applyFieldErrors } from "@/components/forms/apply-field-errors";
import { TextareaField } from "@/components/forms/textarea-field";
import { TextField } from "@/components/forms/text-field";
import { Button } from "@/components/ui/button";
import type { ServerAction } from "@/lib/result";
import {
  COURSE_DESCRIPTION_MAX,
  COURSE_NAME_MAX,
  createCourseSchema,
  type CreateCourseInput,
} from "@/lib/validation/course.schema";

type CourseFormProps =
  | { mode: "create"; action: ServerAction<{ courseId: string }> }
  | {
      mode: "edit";
      courseId: string;
      defaultValues: CreateCourseInput;
      action: ServerAction<{ courseId: string }>;
    };

/** Create a course, or edit its name and description in settings. */
export function CourseForm(props: CourseFormProps) {
  const router = useRouter();
  const {
    register,
    handleSubmit,
    setError,
    reset,
    formState: { errors, isSubmitting, isDirty },
  } = useForm<CreateCourseInput>({
    resolver: zodResolver(createCourseSchema),
    defaultValues: props.mode === "edit" ? props.defaultValues : { name: "", description: "" },
  });

  const onSubmit = handleSubmit(async (values) => {
    const input = props.mode === "edit" ? { ...values, courseId: props.courseId } : values;
    const result = await props.action(input);
    if (!result.ok) {
      if (!applyFieldErrors(result.fieldErrors, setError, ["name", "description"])) {
        toast.error(result.message);
      }
      return;
    }
    if (props.mode === "create") {
      toast.success("Course created");
      router.push(`/courses/${result.data.courseId}`);
    } else {
      toast.success("Course details saved");
      reset(values);
    }
  });

  return (
    <form onSubmit={onSubmit} noValidate className="grid gap-4">
      <TextField
        id="course-name"
        label="Course name"
        maxLength={COURSE_NAME_MAX}
        autoComplete="off"
        error={errors.name?.message}
        {...register("name")}
      />
      <TextareaField
        id="course-description"
        label="Description (optional)"
        rows={4}
        maxLength={COURSE_DESCRIPTION_MAX}
        hint={`Up to ${COURSE_DESCRIPTION_MAX} characters. Students see this on the course page.`}
        error={errors.description?.message}
        {...register("description")}
      />
      <div>
        <Button
          type="submit"
          size="lg"
          disabled={isSubmitting || (props.mode === "edit" && !isDirty)}
          aria-busy={isSubmitting}
        >
          {props.mode === "create"
            ? isSubmitting
              ? "Creating…"
              : "Create course"
            : isSubmitting
              ? "Saving…"
              : "Save changes"}
        </Button>
      </div>
    </form>
  );
}
