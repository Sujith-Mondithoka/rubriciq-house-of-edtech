import { MOCK_MODEL } from "@/lib/env-schema";
import { countWords } from "@/lib/text";

import {
  type AiGradeOutput,
  aiGradeOutputSchema,
  AiInvalidOutputError,
  type AiProvider,
  AiProviderError,
} from "./types";

/**
 * A deterministic stand-in for Gemini, used by tests and `AI_PROVIDER=mock`. Markers in the
 * submission text trigger failure paths:
 * `[mock:fail]` provider error · `[mock:invalid]` malformed output ·
 * `[mock:slow]` never answers (times out) · `[mock:fabricate]` adds a quote that is not in the text.
 */
export function createMockProvider({ latencyMs = 300 }: { latencyMs?: number } = {}): AiProvider {
  return {
    model: MOCK_MODEL,
    async grade(request, signal) {
      await wait(request.content.includes("[mock:slow]") ? 10 * 60_000 : latencyMs, signal);
      if (request.content.includes("[mock:fail]")) {
        throw new AiProviderError("Mock provider unavailable (503)", true);
      }
      if (request.content.includes("[mock:invalid]")) {
        throw new AiInvalidOutputError({ unexpected: "not a grade" });
      }

      const words = countWords(request.content);
      const firstSentence = request.content
        .trim()
        .match(/^[^.!?\n]{1,200}[.!?]?/)?.[0]
        ?.trim();
      const output: AiGradeOutput = {
        criteria: request.rubric.map((c, index) => {
          const levels = [...c.levels].sort((a, b) => a.points - b.points);
          const pick =
            words < 25 ? 0 : words < 80 ? Math.floor((levels.length - 1) / 2) : levels.length - 1;
          const level = levels[Math.min(pick, levels.length - 1)]!;
          const evidence = firstSentence ? [firstSentence] : [];
          if (request.content.includes("[mock:fabricate]")) {
            evidence.push("A sentence the student never wrote.");
          }
          return {
            criterionId: c.id,
            levelId: level.id,
            feedback: `Mock feedback on ${c.title}: the work matches "${level.label}".`,
            evidence,
            // Every other criterion is low-confidence so the UI flag is exercised.
            confidence: index % 2 === 0 ? 0.85 : 0.45,
          };
        }),
        overallFeedback: `Mock overall feedback for a ${words}-word submission.`,
      };
      return {
        output: aiGradeOutputSchema.parse(output),
        usage: { inputTokens: words * 2, outputTokens: 120 },
      };
    },
  };
}

function wait(ms: number, signal: AbortSignal) {
  return new Promise<void>((resolve, reject) => {
    if (signal.aborted) return reject(signal.reason);
    const timer = setTimeout(resolve, ms);
    signal.addEventListener(
      "abort",
      () => {
        clearTimeout(timer);
        reject(signal.reason);
      },
      { once: true },
    );
  });
}
