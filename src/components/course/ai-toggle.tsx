"use client";

import { useOptimistic, useTransition } from "react";
import { toast } from "sonner";

import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import type { ServerAction } from "@/lib/result";

type AiToggleProps = {
  courseId: string;
  aiEnabled: boolean;
  action: ServerAction<{ aiEnabled: boolean }>;
};

export function AiToggle({ courseId, aiEnabled, action }: AiToggleProps) {
  const [optimistic, setOptimistic] = useOptimistic(aiEnabled);
  const [pending, startTransition] = useTransition();

  const onChange = (next: boolean) =>
    startTransition(async () => {
      setOptimistic(next);
      const result = await action({ courseId, aiEnabled: next });
      if (!result.ok) {
        toast.error(result.message);
        return;
      }
      toast.success(result.data.aiEnabled ? "AI drafts turned on" : "AI drafts turned off");
    });

  return (
    <div className="flex items-start justify-between gap-4">
      <div className="grid gap-1">
        <Label htmlFor="ai-enabled">AI grading drafts</Label>
        <p id="ai-enabled-hint" className="text-sm text-muted-foreground">
          When on, graders can ask Google Gemini to draft scores and feedback. Students are told on
          the course page. When off, AI buttons are hidden and no work is sent to AI.
        </p>
      </div>
      <Switch
        id="ai-enabled"
        checked={optimistic}
        disabled={pending}
        aria-describedby="ai-enabled-hint"
        onCheckedChange={onChange}
      />
    </div>
  );
}
