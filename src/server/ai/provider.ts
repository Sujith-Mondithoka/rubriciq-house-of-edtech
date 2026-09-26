import "server-only";

import { env } from "@/lib/env";
import { resolveAiConfig } from "@/lib/env-schema";

import { createGeminiProvider } from "./gemini-provider";
import { createMockProvider } from "./mock-provider";
import type { AiProvider } from "./types";

/** `AI_PROVIDER=gemini|mock`; without a Gemini key, AI is unavailable and its UI hidden. */
export const aiConfig = resolveAiConfig(env);

export function getAiProvider(): AiProvider | null {
  if (!aiConfig.available) return null;
  if (aiConfig.provider === "mock") return createMockProvider();
  return createGeminiProvider({ apiKey: env.GOOGLE_GENERATIVE_AI_API_KEY!, model: aiConfig.model });
}
