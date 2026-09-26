import { describe, expect, it } from "vitest";

import { parseServerEnv } from "@/lib/env-schema";

describe("parseServerEnv", () => {
  it("accepts a postgres connection string and defaults NODE_ENV", () => {
    const env = parseServerEnv({ DATABASE_URL: "postgresql://u:p@host/db?sslmode=require" });
    expect(env).toEqual({
      NODE_ENV: "development",
      DATABASE_URL: "postgresql://u:p@host/db?sslmode=require",
    });
  });

  it("also accepts the postgres:// scheme", () => {
    expect(parseServerEnv({ DATABASE_URL: "postgres://u:p@host/db" }).DATABASE_URL).toBe(
      "postgres://u:p@host/db",
    );
  });

  it("fails with a readable message when DATABASE_URL is missing", () => {
    expect(() => parseServerEnv({})).toThrow(/Invalid environment variables[\s\S]*DATABASE_URL/);
  });

  it("rejects non-postgres URLs", () => {
    expect(() => parseServerEnv({ DATABASE_URL: "mysql://u:p@host/db" })).toThrow(
      /postgres:\/\/ connection string/,
    );
  });

  it("does not echo the secret value in the error", () => {
    expect(() => parseServerEnv({ DATABASE_URL: "https://secret-token@host" })).toThrow(
      expect.objectContaining({ message: expect.not.stringContaining("secret-token") }),
    );
  });
});
