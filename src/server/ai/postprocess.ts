import { FEEDBACK_MAX } from "@/lib/validation/grade.schema";

import { type AiGradeOutput, AiInvalidOutputError } from "./types";

/** Confidence given to a criterion whose evidence could not be verified (below LOW_CONFIDENCE). */
const UNVERIFIED_CONFIDENCE = 0.3;
const MAX_EVIDENCE = 3;
const MAX_QUOTE = 300;

type Rubric = { id: string; levels: { id: string; points: number }[] }[];

export type DraftScore = {
  criterionId: string;
  levelId: string;
  points: number;
  feedback: string;
  evidence: string[];
  confidence: number;
};

export type ProcessedDraft = {
  scores: DraftScore[];
  overallFeedback: string;
  /** Criteria left unscored because the model chose a level outside the criterion. */
  rejectedCriteria: string[];
  droppedQuotes: number;
};

const clamp01 = (n: number) => (Number.isFinite(n) ? Math.min(1, Math.max(0, n)) : 0);

/**
 * Checks the model's answer against the rubric and the submission:
 * - levels must belong to their criterion (otherwise the criterion stays unscored);
 * - evidence quotes must appear verbatim in the submission (otherwise they are dropped and the
 *   criterion is marked low-confidence);
 * - points come from the rubric, never from the model.
 * Throws when not a single criterion could be scored.
 */
export function postprocess(
  output: AiGradeOutput,
  rubric: Rubric,
  content: string,
): ProcessedDraft {
  const scores: DraftScore[] = [];
  const rejectedCriteria: string[] = [];
  let droppedQuotes = 0;

  for (const criterion of rubric) {
    const answer = output.criteria.find((c) => c.criterionId === criterion.id);
    const level = criterion.levels.find((l) => l.id === answer?.levelId);
    if (!answer || !level) {
      rejectedCriteria.push(criterion.id);
      continue;
    }
    const quotes = answer.evidence.map((q) => q.trim()).filter((q) => q.length > 0);
    const verified = quotes.filter((q) => q.length <= MAX_QUOTE && content.includes(q));
    const dropped = quotes.length - verified.length;
    droppedQuotes += dropped;
    const confidence = clamp01(answer.confidence);
    scores.push({
      criterionId: criterion.id,
      levelId: level.id,
      points: level.points,
      feedback: answer.feedback.trim().slice(0, FEEDBACK_MAX),
      evidence: [...new Set(verified)].slice(0, MAX_EVIDENCE),
      confidence: dropped > 0 ? Math.min(confidence, UNVERIFIED_CONFIDENCE) : confidence,
    });
  }

  if (!scores.length) throw new AiInvalidOutputError(output);
  return {
    scores,
    overallFeedback: output.overallFeedback.trim().slice(0, FEEDBACK_MAX),
    rejectedCriteria,
    droppedQuotes,
  };
}
