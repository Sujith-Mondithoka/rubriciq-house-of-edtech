/** Below this, the grader UI flags an AI-drafted criterion for a careful check. */
export const LOW_CONFIDENCE = 0.6;

export function isLowConfidence(confidence: number | null | undefined): boolean {
  return confidence !== null && confidence !== undefined && confidence < LOW_CONFIDENCE;
}
