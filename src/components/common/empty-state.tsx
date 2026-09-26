import type { LucideIcon } from "lucide-react";
import type { ReactNode } from "react";

type EmptyStateProps = {
  icon: LucideIcon;
  title: string;
  children?: ReactNode;
  action?: ReactNode;
  /** Smaller variant for use inside cards. */
  compact?: boolean;
};

/** A calm, consistent "nothing here yet" block: icon, short title, one line of guidance. */
export function EmptyState({ icon: Icon, title, children, action, compact }: EmptyStateProps) {
  return (
    <div
      className={
        compact
          ? "grid justify-items-center gap-2 rounded-lg border border-dashed px-4 py-6 text-center"
          : "grid justify-items-center gap-3 rounded-xl border border-dashed bg-card/50 px-6 py-10 text-center"
      }
    >
      <span
        aria-hidden
        className="grid size-10 place-items-center rounded-full bg-accent text-accent-foreground"
      >
        <Icon className="size-5" />
      </span>
      <p className="font-medium">{title}</p>
      {children ? <div className="max-w-md text-sm text-muted-foreground">{children}</div> : null}
      {action}
    </div>
  );
}
