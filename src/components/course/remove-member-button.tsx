"use client";

import { toast } from "sonner";

import { ConfirmDialog } from "@/components/forms/confirm-dialog";
import { Button } from "@/components/ui/button";
import type { ServerAction } from "@/lib/result";

type RemoveMemberButtonProps = {
  memberId: string;
  name: string;
  roleLabel: string;
  action: ServerAction<{ courseId: string }>;
};

export function RemoveMemberButton({ memberId, name, roleLabel, action }: RemoveMemberButtonProps) {
  return (
    <ConfirmDialog
      trigger={
        <Button type="button" variant="outline" size="sm">
          Remove<span className="sr-only"> {name}</span>
        </Button>
      }
      title={`Remove ${name}?`}
      description={`They lose access to this course as a ${roleLabel.toLowerCase()}. Their existing submissions and grades are kept.`}
      confirmLabel="Remove"
      pendingLabel="Removing…"
      destructive
      onConfirm={async () => {
        const result = await action({ memberId });
        if (!result.ok) {
          toast.error(result.message);
          return false;
        }
        toast.success(`${name} removed`);
        return true;
      }}
    />
  );
}
