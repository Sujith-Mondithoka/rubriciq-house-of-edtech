import { z } from "zod";

/**
 * What the model must return. Kept free of length/range constraints (not every provider
 * supports them in structured output); postprocess enforces the limits instead.
 */
export const aiGradeOutputSchema = z.object({
  criteria: z.array(
    z.object({
      criterionId: z.string().describe("The criterionId exactly as given in the rubric"),
      levelId: z.string().describe("One levelId from this criterion's levels"),
      feedback: z.string().describe("1–3 sentences to the student about this criterion"),
      evidence: z
        .array(z.string())
        .describe("Up to 3 short quotes copied character-for-character from the submission"),
      confidence: z.number().describe("0 to 1: how sure you are about the chosen level"),
    }),
  ),
  overallFeedback: z.string().describe("2–4 sentences of overall feedback to the student"),
});

export type AiGradeOutput = z.infer<typeof aiGradeOutputSchema>;

export type AiRubricCriterion = {
  id: string;
  title: string;
  description: string;
  levels: { id: string; label: string; points: number; descriptor: string }[];
};

export type AiGradeRequest = {
  assignmentTitle: string;
  instructions: string;
  rubric: AiRubricCriterion[];
  content: string;
};

export type AiUsage = { inputTokens?: number; outputTokens?: number };

/** A model client: returns an object matching `aiGradeOutputSchema`, or throws one of the errors below. */
export type AiProvider = {
  model: string;
  grade(
    request: AiGradeRequest,
    signal: AbortSignal,
  ): Promise<{ output: AiGradeOutput; usage: AiUsage }>;
};

/** The model answered, but not in the required shape. Not retried. */
export class AiInvalidOutputError extends Error {
  constructor(readonly raw: unknown) {
    super("The AI response did not match the required format.");
    this.name = "AiInvalidOutputError";
  }
}

/** A provider/network failure. Retried once when `retryable`. */
export class AiProviderError extends Error {
  constructor(
    message: string,
    readonly retryable: boolean,
  ) {
    super(message);
    this.name = "AiProviderError";
  }
}
