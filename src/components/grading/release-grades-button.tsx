"use client";

import { toast } from "sonner";

import { ConfirmDialog } from "@/components/forms/confirm-dialog";
import { Button } from "@/components/ui/button";
import type { ServerAction } from "@/lib/result";

type ReleaseGradesButtonProps = {
  assignmentId: string;
  /** Exactly the grades (and versions) shown to the instructor. */
  grades: { submissionId: string; version: number }[];
  action: ServerAction<{ released: number }>;
};

/** Bulk release behind a confirmation. All listed grades are released, or none. */
export function ReleaseGradesButton({ assignmentId, grades, action }: ReleaseGradesButtonProps) {
  const n = grades.length;
  const noun = n === 1 ? "grade" : "grades";
  return (
    <ConfirmDialog
      trigger={
        <Button type="button" size="lg" disabled={!n}>
          Release {n} reviewed {noun}
        </Button>
      }
      title={`Release ${n} ${noun}?`}
      description={`Students see their score and feedback right away. A released grade can only change through a regrade request.`}
      confirmLabel={`Release ${n} ${noun}`}
      pendingLabel="Releasing…"
      onConfirm={async () => {
        const result = await action({ assignmentId, grades });
        if (!result.ok) {
          toast.error(result.message);
          return false;
        }
        toast.success(
          `Released ${result.data.released} ${result.data.released === 1 ? "grade" : "grades"}`,
        );
        return true;
      }}
    />
  );
}
