import { z } from "zod";

const postgresUrl = z
  .string()
  .trim()
  .refine((value) => /^postgres(ql)?:\/\//.test(value), "must be a postgres:// connection string");

const emptyToUndefined = (value: unknown) => (value === "" ? undefined : value);

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

/** Origins allowed to call the auth API (the deployment URL and its branch alias). */
export function resolveTrustedOrigins(env: ServerEnv): string[] {
  const origins = [resolveAppUrl(env)];
  for (const host of [env.VERCEL_URL, env.VERCEL_BRANCH_URL]) {
    if (host) origins.push(`https://${host}`);
  }
  return [...new Set(origins)];
}
