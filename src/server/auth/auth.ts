import "server-only";

import { nextCookies } from "better-auth/next-js";

import { env } from "@/lib/env";
import { resolveAppUrl, resolveTrustedOrigins } from "@/lib/env-schema";
import { db } from "@/server/db";

import { createAuth } from "./create-auth";

export const auth = createAuth({
  db,
  secret: env.BETTER_AUTH_SECRET,
  baseURL: resolveAppUrl(env),
  trustedOrigins: resolveTrustedOrigins(env),
  rateLimitEnabled: env.NODE_ENV === "production",
  // nextCookies lets Server Actions set the session cookie; it must be the last plugin.
  plugins: [nextCookies()],
});
