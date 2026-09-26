import { type BetterAuthPlugin, betterAuth } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { APIError, createAuthMiddleware } from "better-auth/api";

import { PASSWORD_MAX, PASSWORD_MIN, signUpSchema } from "@/lib/validation/auth.schema";
import type { Db } from "@/server/db/client";
import * as schema from "@/server/db/schema";

const DAY_SECONDS = 60 * 60 * 24;

export const AUTH_RATE_LIMITS = {
  signIn: { window: 60, max: 5 },
  signUp: { window: 60 * 60, max: 5 },
} as const;

type CreateAuthOptions = {
  db: Db;
  secret: string;
  baseURL: string;
  trustedOrigins: string[];
  rateLimitEnabled: boolean;
  plugins?: BetterAuthPlugin[];
};

/**
 * Builds the Better Auth instance. Kept free of Next.js imports so integration tests
 * can exercise the real configuration against a test database.
 */
export function createAuth({
  db,
  secret,
  baseURL,
  trustedOrigins,
  rateLimitEnabled,
  plugins = [],
}: CreateAuthOptions) {
  return betterAuth({
    appName: "RubricIQ",
    secret,
    baseURL,
    trustedOrigins,
    database: drizzleAdapter(db, { provider: "pg", schema }),
    emailAndPassword: {
      enabled: true,
      minPasswordLength: PASSWORD_MIN,
      maxPasswordLength: PASSWORD_MAX,
      autoSignIn: true,
    },
    session: {
      expiresIn: 7 * DAY_SECONDS,
      updateAge: DAY_SECONDS,
    },
    rateLimit: {
      enabled: rateLimitEnabled,
      // Stored in Postgres so limits hold across serverless instances.
      storage: "database",
      window: 60,
      max: 100,
      customRules: {
        "/sign-in/email": AUTH_RATE_LIMITS.signIn,
        "/sign-up/email": AUTH_RATE_LIMITS.signUp,
      },
    },
    hooks: {
      // Server-side validation of sign-up input with the same schema the form uses.
      before: createAuthMiddleware(async (ctx) => {
        if (ctx.path !== "/sign-up/email") return;
        const result = signUpSchema.safeParse(ctx.body);
        if (!result.success) {
          throw new APIError("BAD_REQUEST", {
            message: result.error.issues[0]?.message ?? "Invalid sign-up details",
          });
        }
        return { context: { body: result.data } };
      }),
    },
    plugins,
  });
}
