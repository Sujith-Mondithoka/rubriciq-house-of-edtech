import { z } from "zod";

const postgresUrl = z
  .string()
  .trim()
  .refine((value) => /^postgres(ql)?:\/\//.test(value), "must be a postgres:// connection string");

const emptyToUndefined = (value: unknown) => (value === "" ? undefined : value);

/** A stable Gemini Flash model that is available on the free API tier. */
export const DEFAULT_GEMINI_MODEL = "gemini-3.8-flash";
export const MOCK_MODEL = "mock-grader";

export const serverEnvSchema = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  // Pooled connection used by the app at runtime.
  DATABASE_URL: postgresUrl,
  // Signs session cookies. Generate with: openssl rand -base64 32
  BETTER_AUTH_SECRET: z.string().min(32, "must be at least 32 characters"),
  // Public origin of the app. Optional: falls back to Vercel's deployment URL, then localhost.
  BETTER_AUTH_URL: z.preprocess(emptyToUndefined, z.url().optional()),
  // Set automatically by Vercel (host names without a scheme).
  VERCEL_URL: z.preprocess(emptyToUndefined, z.string().optional()),
  VERCEL_BRANCH_URL: z.preprocess(emptyToUndefined, z.string().optional()),
  // AI drafts: "gemini" (needs the API key; without it the AI UI is hidden) or "mock" (tests).
  AI_PROVIDER: z.preprocess(emptyToUndefined, z.enum(["gemini", "mock"]).default("gemini")),
  GOOGLE_GENERATIVE_AI_API_KEY: z.preprocess(emptyToUndefined, z.string().min(1).optional()),
  GEMINI_MODEL: z.preprocess(
    emptyToUndefined,
    z
      .string()
      .regex(/^[a-z0-9][a-z0-9.-]*$/, "must be a Gemini model id")
      .default(DEFAULT_GEMINI_MODEL),
  ),
  // Most AI runs one course may start per UTC day.
  AI_DAILY_CAP_PER_COURSE: z.preprocess(
    emptyToUndefined,
    z.coerce.number().int().min(0).max(10_000).default(200),
  ),
});

export type ServerEnv = z.infer<typeof serverEnvSchema>;

/** Validates environment variables and fails fast with a readable message. */
export function parseServerEnv(source: Record<string, string | undefined>): ServerEnv {
  const result = serverEnvSchema.safeParse(source);
  if (!result.success) {
    throw new Error(`Invalid environment variables:\n${z.prettifyError(result.error)}`);
  }
  return result.data;
}

/** The app's own origin, used as Better Auth's base URL. */
export function resolveAppUrl(env: ServerEnv): string {
  if (env.BETTER_AUTH_URL) return env.BETTER_AUTH_URL.replace(/\/$/, "");
  if (env.VERCEL_URL) return `https://${env.VERCEL_URL}`;
  return "http://localhost:3000";
}

export type AiConfig = {
  /** False when Gemini is chosen but no API key is set: the AI UI is hidden. */
  available: boolean;
  provider: "gemini" | "mock";
  model: string;
  dailyCap: number;
};

export function resolveAiConfig(env: ServerEnv): AiConfig {
  const mock = env.AI_PROVIDER === "mock";
  return {
    available: mock || Boolean(env.GOOGLE_GENERATIVE_AI_API_KEY),
    provider: env.AI_PROVIDER,
    model: mock ? MOCK_MODEL : env.GEMINI_MODEL,
    dailyCap: env.AI_DAILY_CAP_PER_COURSE,
  };
}

/** Origins allowed to call the auth API (the deployment URL and its branch alias). */
export function resolveTrustedOrigins(env: ServerEnv): string[] {
  const origins = [resolveAppUrl(env)];
  for (const host of [env.VERCEL_URL, env.VERCEL_BRANCH_URL]) {
    if (host) origins.push(`https://${host}`);
  }
  return [...new Set(origins)];
}
