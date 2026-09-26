import { Badge } from "@/components/ui/badge";
import type { QueueStatus } from "@/lib/validation/grade.schema";

export const QUEUE_STATUS_LABELS: Record<QueueStatus, string> = {
  NOT_SUBMITTED: "Not submitted",
  SUBMITTED: "Needs grading",
  AI_DRAFTED: "AI drafted",
  REVIEWED: "Reviewed",
  RELEASED: "Released",
};

const variants = {
  NOT_SUBMITTED: "outline",
  SUBMITTED: "secondary",
  AI_DRAFTED: "secondary",
  REVIEWED: "outline",
  RELEASED: "default",
} as const;

/** Grading status as text, never colour alone. */
export function QueueStatusBadge({ status }: { status: QueueStatus }) {
  return <Badge variant={variants[status]}>{QUEUE_STATUS_LABELS[status]}</Badge>;
}
