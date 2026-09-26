import { Badge } from "@/components/ui/badge";

export type RunState = {
  status: "PENDING" | "SUCCEEDED" | "FAILED";
  errorCode: "TIMEOUT" | "PROVIDER" | "INVALID_OUTPUT" | "CAP" | "STALE" | null;
};

const REASONS: Record<NonNullable<RunState["errorCode"]>, string> = {
  TIMEOUT: "the AI took too long to answer",
  PROVIDER: "the AI provider returned an error",
  INVALID_OUTPUT: "the AI answer could not be used",
  CAP: "the daily AI limit was reached",
  STALE: "it stopped responding",
};

export function aiFailureReason(code: RunState["errorCode"]) {
  return code ? REASONS[code] : "of an unknown error";
}

/** Status of the latest AI run, in words (not colour alone). */
export function AiRunBadge({ run }: { run: RunState }) {
  if (run.status === "PENDING") return <Badge variant="secondary">AI drafting…</Badge>;
  if (run.status === "FAILED") return <Badge variant="destructive">AI draft failed</Badge>;
  return null;
}
