import { z } from "zod";

const postgresUrl = z
  .string()
  .trim()
  .refine((value) => /^postgres(ql)?:\/\//.test(value), "must be a postgres:// connection string");

export const serverEnvSchema = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  // Pooled connection used by the app at runtime.
  DATABASE_URL: postgresUrl,
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
