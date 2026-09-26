import { describe, expect, it } from "vitest";

import { parseServerEnv, resolveAppUrl, resolveTrustedOrigins } from "@/lib/env-schema";

const valid = {
  DATABASE_URL: "postgresql://u:p@host/db?sslmode=require",
  BETTER_AUTH_SECRET: "x".repeat(32),
};

describe("parseServerEnv", () => {
  it("accepts a valid environment and defaults NODE_ENV", () => {
    const env = parseServerEnv(valid);
    expect(env).toMatchObject({ ...valid, NODE_ENV: "development" });
    expect(env.BETTER_AUTH_URL).toBeUndefined();
  });

  it("also accepts the postgres:// scheme", () => {
    const env = parseServerEnv({ ...valid, DATABASE_URL: "postgres://u:p@host/db" });
    expect(env.DATABASE_URL).toBe("postgres://u:p@host/db");
  });

  it("fails with a readable message when required values are missing", () => {
    expect(() => parseServerEnv({})).toThrow(
      /Invalid environment variables[\s\S]*DATABASE_URL[\s\S]*BETTER_AUTH_SECRET/,
    );
  });

  it("rejects non-postgres URLs", () => {
    expect(() => parseServerEnv({ ...valid, DATABASE_URL: "mysql://u:p@host/db" })).toThrow(
      /postgres:\/\/ connection string/,
    );
  });

  it("rejects a short auth secret", () => {
    expect(() => parseServerEnv({ ...valid, BETTER_AUTH_SECRET: "too-short" })).toThrow(
      /at least 32 characters/,
    );
  });

  it("treats an empty BETTER_AUTH_URL as unset", () => {
    expect(parseServerEnv({ ...valid, BETTER_AUTH_URL: "" }).BETTER_AUTH_URL).toBeUndefined();
  });

  it("does not echo secret values in the error", () => {
    expect(() =>
      parseServerEnv({ DATABASE_URL: "https://secret-token@host", BETTER_AUTH_SECRET: "leak" }),
    ).toThrow(
      expect.objectContaining({
        message: expect.not.stringMatching(/secret-token|leak/),
      }),
    );
  });
});

describe("resolveAppUrl / resolveTrustedOrigins", () => {
  it("prefers BETTER_AUTH_URL and strips a trailing slash", () => {
    const env = parseServerEnv({ ...valid, BETTER_AUTH_URL: "https://app.example.com/" });
    expect(resolveAppUrl(env)).toBe("https://app.example.com");
  });

  it("falls back to the Vercel deployment URL, then localhost", () => {
    expect(resolveAppUrl(parseServerEnv({ ...valid, VERCEL_URL: "x-123.vercel.app" }))).toBe(
      "https://x-123.vercel.app",
    );
    expect(resolveAppUrl(parseServerEnv(valid))).toBe("http://localhost:3000");
  });

  it("trusts the app URL plus the deployment and branch URLs, without duplicates", () => {
    const env = parseServerEnv({
      ...valid,
      BETTER_AUTH_URL: "https://app.example.com",
      VERCEL_URL: "x-123.vercel.app",
      VERCEL_BRANCH_URL: "x-git-main.vercel.app",
    });
    expect(resolveTrustedOrigins(env)).toEqual([
      "https://app.example.com",
      "https://x-123.vercel.app",
      "https://x-git-main.vercel.app",
    ]);
    expect(resolveTrustedOrigins(parseServerEnv({ ...valid, VERCEL_URL: "a.vercel.app" }))).toEqual(
      ["https://a.vercel.app"],
    );
  });
});
