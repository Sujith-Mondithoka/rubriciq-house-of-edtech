"use client";

import { CopyIcon, RefreshCwIcon } from "lucide-react";
import { toast } from "sonner";

import { ConfirmDialog } from "@/components/forms/confirm-dialog";
import { Button } from "@/components/ui/button";
import type { ServerAction } from "@/lib/result";

type JoinCodePanelProps = {
  courseId: string;
  joinCode: string;
  /** Only the Instructor of an active course can regenerate. */
  regenerateAction?: ServerAction<{ joinCode: string }>;
};

export function JoinCodePanel({ courseId, joinCode, regenerateAction }: JoinCodePanelProps) {
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(joinCode);
      toast.success("Join code copied");
    } catch {
      toast.error("Could not copy. Select the code and copy it manually.");
    }
  };

  return (
    <div className="flex flex-wrap items-center gap-3">
      <p className="grid gap-0.5">
        <span className="text-sm text-muted-foreground">Join code</span>
        <span className="font-mono text-xl font-semibold tracking-widest select-all">
          {joinCode}
        </span>
      </p>
      <div className="flex flex-wrap gap-2">
        <Button type="button" variant="outline" size="lg" onClick={copy}>
          <CopyIcon aria-hidden />
          Copy
        </Button>
        {regenerateAction ? (
          <ConfirmDialog
            trigger={
              <Button type="button" variant="outline" size="lg">
                <RefreshCwIcon aria-hidden />
                New code
              </Button>
            }
            title="Generate a new join code?"
            description="The current code stops working immediately. People who already joined stay in the course."
            confirmLabel="Generate new code"
            pendingLabel="Generating…"
            onConfirm={async () => {
              const result = await regenerateAction({ courseId });
              if (!result.ok) {
                toast.error(result.message);
                return false;
              }
              toast.success(`New join code: ${result.data.joinCode}`);
              return true;
            }}
          />
        ) : null}
      </div>
    </div>
  );
}
