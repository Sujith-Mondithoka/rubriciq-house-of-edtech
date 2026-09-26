/** Pure grading rules shared by the server and the grader UI. */

export type ScoreSource = "AI" | "HUMAN" | "AI_EDITED";

/** A grade's total is the sum of the chosen levels' points (computed on the server). */
export function totalPoints(scores: { points: number }[]): number {
  return scores.reduce((sum, s) => sum + s.points, 0);
}

/** Criteria that still need a level before the grade can be released. */
export function missingCriteria(
  criterionIds: string[],
  scores: { criterionId: string; levelId: string | null }[],
): string[] {
  const scored = new Set(scores.filter((s) => s.levelId !== null).map((s) => s.criterionId));
  return criterionIds.filter((id) => !scored.has(id));
}

/**
 * Where a saved score came from. An AI suggestion the grader keeps as-is stays AI; once they
 * change the level or the feedback it becomes AI_EDITED (and stays that way).
 */
export function nextScoreSource(
  existing: { source: ScoreSource; levelId: string | null; feedback: string } | undefined,
  next: { levelId: string | null; feedback: string },
): ScoreSource {
  if (!existing || existing.source === "HUMAN") return "HUMAN";
  if (existing.source === "AI_EDITED") return "AI_EDITED";
  const unchanged = existing.levelId === next.levelId && existing.feedback === next.feedback;
  return unchanged ? "AI" : "AI_EDITED";
}
