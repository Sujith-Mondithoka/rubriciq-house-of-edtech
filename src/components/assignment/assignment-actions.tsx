"use client";

import { useRouter } from "next/navigation";
import { toast } from "sonner";

import { ConfirmDialog } from "@/components/forms/confirm-dialog";
import { Button } from "@/components/ui/button";
import type { ServerAction } from "@/lib/result";

type Ref = { courseId: string; assignmentId: string };

type AssignmentActionsProps = {
  assignmentId: string;
  courseId: string;
  status: "DRAFT" | "PUBLISHED" | "CLOSED";
  canDelete: boolean;
  hasRubric: boolean;
  publishAction: ServerAction<Ref>;
  closeAction: ServerAction<Ref>;
  deleteAction: ServerAction<Ref>;
};

/** Publish / close / delete, each behind a confirmation. */
export function AssignmentActions({
  assignmentId,
  courseId,
  status,
  canDelete,
  hasRubric,
  publishAction,
  closeAction,
  deleteAction,
}: AssignmentActionsProps) {
  const router = useRouter();

  const run = async (action: ServerAction<Ref>, success: string) => {
    const result = await action({ assignmentId });
    if (!result.ok) {
      toast.error(result.message);
      return false;
    }
    toast.success(success);
    return true;
  };

  return (
    <div className="flex flex-wrap gap-2">
      {status === "DRAFT" ? (
        <ConfirmDialog
          trigger={
            <Button type="button" size="lg" disabled={!hasRubric}>
              Publish
            </Button>
          }
          title="Publish this assignment?"
          description="Students in the course can see it and submit. The rubric is locked after publishing and cannot be changed."
          confirmLabel="Publish"
          pendingLabel="Publishing…"
          onConfirm={() => run(publishAction, "Assignment published")}
        />
      ) : null}
      {status === "PUBLISHED" ? (
        <ConfirmDialog
          trigger={
            <Button type="button" variant="outline" size="lg">
              Close submissions
            </Button>
          }
          title="Close this assignment?"
          description="Students can no longer submit or edit their work, even if late work is allowed. This cannot be undone."
          confirmLabel="Close submissions"
          pendingLabel="Closing…"
          onConfirm={() => run(closeAction, "Assignment closed")}
        />
      ) : null}
      {canDelete ? (
        <ConfirmDialog
          trigger={
            <Button type="button" variant="destructive" size="lg">
              Delete draft
            </Button>
          }
          title="Delete this draft?"
          description="The assignment and its rubric are permanently deleted. This cannot be undone."
          confirmLabel="Delete"
          pendingLabel="Deleting…"
          destructive
          onConfirm={async () => {
            const ok = await run(deleteAction, "Draft deleted");
            if (ok) router.push(`/courses/${courseId}`);
            return ok;
          }}
        />
      ) : null}
    </div>
  );
}
