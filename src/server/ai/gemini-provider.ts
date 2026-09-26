import { createGoogleGenerativeAI } from "@ai-sdk/google";
import { APICallError, generateText, NoObjectGeneratedError, Output } from "ai";

import { buildPrompt, SYSTEM_PROMPT } from "./prompt";
import {
  aiGradeOutputSchema,
  AiInvalidOutputError,
  type AiProvider,
  AiProviderError,
} from "./types";

/**
 * Gemini through the Vercel AI SDK. Structured output is constrained by the Zod schema
 * (`generateText` + `Output.object`, the AI SDK 7 replacement for `generateObject`).
 * Retries and the timeout are handled by the caller, so the SDK's own retries are off.
 */
export function createGeminiProvider({
  apiKey,
  model,
}: {
  apiKey: string;
  model: string;
}): AiProvider {
  const google = createGoogleGenerativeAI({ apiKey });
  return {
    model,
    async grade(request, signal) {
      try {
        const result = await generateText({
          model: google(model),
          system: SYSTEM_PROMPT,
          prompt: buildPrompt(request),
          output: Output.object({ schema: aiGradeOutputSchema, name: "rubric_grade" }),
          temperature: 0.2,
          maxRetries: 0,
          abortSignal: signal,
        });
        if (!result.output) throw new AiInvalidOutputError(result.text);
        return {
          output: result.output,
          usage: {
            inputTokens: result.usage.inputTokens,
            outputTokens: result.usage.outputTokens,
          },
        };
      } catch (error) {
        if (error instanceof AiInvalidOutputError) throw error;
        if (NoObjectGeneratedError.isInstance(error))
          throw new AiInvalidOutputError(error.text ?? null);
        if (APICallError.isInstance(error)) {
          throw new AiProviderError(
            `Gemini API error${error.statusCode ? ` (${error.statusCode})` : ""}`,
            error.isRetryable,
          );
        }
        throw error;
      }
    },
  };
}
