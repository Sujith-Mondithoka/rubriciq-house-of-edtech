"use client";

import { SparklesIcon } from "lucide-react";
import { useTransition } from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import type { ServerAction } from "@/lib/result";

type AiDraftButtonProps = {
  assignmentId: string;
  /** Omit for "all eligible submissions". */
  submissionIds?: string[];
  label: string;
  variant?: "default" | "outline" | "secondary";
  /** Accessible name when the visible label is short (e.g. "Retry" in a list). */
  ariaLabel?: string;
  action: ServerAction<{ runIds: string[] }>;
};

/** Starts AI drafts; the page then polls until they finish. */
export function AiDraftButton({
  assignmentId,
  submissionIds,
  label,
  variant = "outline",
  ariaLabel,
  action,
}: AiDraftButtonProps) {
  const [pending, start] = useTransition();
  return (
    <Button
      type="button"
      size="lg"
      variant={variant}
      disabled={pending}
      aria-busy={pending}
      aria-label={ariaLabel}
      onClick={() =>
        start(async () => {
          const result = await action(
            submissionIds ? { assignmentId, submissionIds } : { assignmentId },
          );
          if (!result.ok) {
            toast.error(result.message);
            return;
          }
          const n = result.data.runIds.length;
          toast.success(`Started ${n} AI ${n === 1 ? "draft" : "drafts"}`);
        })
      }
    >
      <SparklesIcon aria-hidden />
      {pending ? "Starting…" : label}
    </Button>
  );
}
