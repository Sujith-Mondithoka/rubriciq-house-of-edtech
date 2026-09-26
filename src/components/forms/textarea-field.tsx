import type { ComponentProps } from "react";

import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";

type TextareaFieldProps = ComponentProps<typeof Textarea> & {
  id: string;
  label: string;
  error?: string;
  hint?: string;
};

/** Labelled textarea with its hint and error linked through aria-describedby. */
export function TextareaField({ id, label, error, hint, ...props }: TextareaFieldProps) {
  const hintId = `${id}-hint`;
  const errorId = `${id}-error`;
  const describedBy = [hint ? hintId : null, error ? errorId : null].filter(Boolean).join(" ");

  return (
    <div className="grid gap-2">
      <Label htmlFor={id}>{label}</Label>
      <Textarea
        id={id}
        aria-invalid={error ? true : undefined}
        aria-describedby={describedBy || undefined}
        {...props}
      />
      {hint ? (
        <p id={hintId} className="text-sm text-muted-foreground">
          {hint}
        </p>
      ) : null}
      {error ? (
        <p id={errorId} className="text-sm text-destructive">
          {error}
        </p>
      ) : null}
    </div>
  );
}
