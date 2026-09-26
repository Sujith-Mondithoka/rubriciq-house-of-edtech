"use client";

import type { ComponentProps } from "react";
import { useFormStatus } from "react-dom";

import { Button } from "@/components/ui/button";

type PendingButtonProps = Omit<ComponentProps<typeof Button>, "type"> & { pendingLabel: string };

/** Submit button for Server Action forms: disables itself and announces progress. */
export function PendingButton({ pendingLabel, children, disabled, ...props }: PendingButtonProps) {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" disabled={pending || disabled} aria-busy={pending} {...props}>
      {pending ? pendingLabel : children}
    </Button>
  );
}
