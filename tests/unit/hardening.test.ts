import { describe, expect, it } from "vitest";

import { isAuthorizedCron } from "@/lib/cron-auth";
import { buildCsp, SECURITY_HEADERS } from "@/lib/csp";
import { parseServerEnv } from "@/lib/env-schema";
import { isDemoCourse, isDemoLocked } from "@/server/authz/demo";
import { DEMO_JOIN_CODE, DEMO_USERS } from "@/server/db/demo-accounts";
import { retryMessage } from "@/server/services/rate-limit.service";

const SECRET = "s".repeat(40);

describe("cron authorisation", () => {
  it("accepts only the exact bearer secret", () => {
    expect(isAuthorizedCron(`Bearer ${SECRET}`, SECRET)).toBe(true);
    expect(isAuthorizedCron(`Bearer ${SECRET}x`, SECRET)).toBe(false);
    expect(isAuthorizedCron(SECRET, SECRET)).toBe(false);
    expect(isAuthorizedCron(null, SECRET)).toBe(false);
  });

  it("is closed when no secret is configured", () => {
    expect(isAuthorizedCron("Bearer ", undefined)).toBe(false);
    expect(isAuthorizedCron("Bearer anything", "")).toBe(false);
  });

  it("CRON_SECRET must be long when set", () => {
    const base = { DATABASE_URL: "postgres://x/y", BETTER_AUTH_SECRET: "s".repeat(32) };
    expect(() => parseServerEnv({ ...base, CRON_SECRET: "short" })).toThrow();
    expect(parseServerEnv({ ...base, CRON_SECRET: SECRET }).CRON_SECRET).toBe(SECRET);
    expect(parseServerEnv({ ...base, CRON_SECRET: "" }).CRON_SECRET).toBeUndefined();
  });
});

describe("content security policy", () => {
  it("requires the nonce for scripts and blocks framing and plugins", () => {
    const csp = buildCsp("abc123");
    expect(csp).toContain("script-src 'self' 'nonce-abc123' 'strict-dynamic'");
    expect(csp).not.toContain("unsafe-eval");
    expect(csp).toContain("frame-ancestors 'none'");
    expect(csp).toContain("object-src 'none'");
    expect(csp).toContain("upgrade-insecure-requests");
  });

  it("allows eval only in development (React debugging)", () => {
    expect(buildCsp("n", { dev: true })).toContain("'unsafe-eval'");
  });

  it("sends the standard security headers", () => {
    const keys = SECURITY_HEADERS.map((h) => h.key);
    expect(keys).toEqual(
      expect.arrayContaining([
        "X-Content-Type-Options",
        "X-Frame-Options",
        "Referrer-Policy",
        "Strict-Transport-Security",
      ]),
    );
  });
});

describe("demo course protection", () => {
  const demoCourse = { createdBy: DEMO_USERS.instructor.id, joinCode: DEMO_JOIN_CODE };

  it("locks only the seeded demo course, and only for demo accounts", () => {
    expect(isDemoCourse(demoCourse)).toBe(true);
    expect(isDemoLocked(demoCourse, DEMO_USERS.instructor.id)).toBe(true);
    expect(isDemoLocked(demoCourse, "someone-else")).toBe(false);
    // A course the demo instructor created during a visit is theirs to change.
    expect(isDemoLocked({ ...demoCourse, joinCode: "ABCD2345" }, DEMO_USERS.instructor.id)).toBe(
      false,
    );
  });
});

describe("rate limit message", () => {
  it("rounds up to whole minutes", () => {
    expect(retryMessage(1)).toBe("Too many requests. Please try again in 1 minute.");
    expect(retryMessage(61_000)).toBe("Too many requests. Please try again in 2 minutes.");
  });
});
