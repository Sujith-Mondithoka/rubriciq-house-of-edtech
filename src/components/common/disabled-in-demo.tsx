import { LockIcon } from "lucide-react";

import { Button } from "@/components/ui/button";

type DisabledInDemoProps = {
  /** A stable, unique id on the page (used to link the reason to the button). */
  id: string;
  label: string;
  variant?: "default" | "outline" | "destructive";
};

/**
 * A control that is off for demo accounts on the shared demo course. The reason is visible
 * text (not colour alone) and is announced with the button through aria-describedby.
 */
export function DisabledInDemo({ id, label, variant = "outline" }: DisabledInDemoProps) {
  const reasonId = `${id}-demo-reason`;
  return (
    <div className="flex flex-wrap items-center gap-2">
      <Button type="button" size="lg" variant={variant} disabled aria-describedby={reasonId}>
        {label}
      </Button>
      <span id={reasonId} className="inline-flex items-center gap-1 text-sm text-muted-foreground">
        <LockIcon aria-hidden className="size-3.5" />
        Disabled in the demo
      </span>
    </div>
  );
}
