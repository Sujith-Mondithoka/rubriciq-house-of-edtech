import { describe, expect, it } from "vitest";

import {
  demoRoleSchema,
  safeRedirectPath,
  signInSchema,
  signUpSchema,
} from "@/lib/validation/auth.schema";

describe("signUpSchema", () => {
  const valid = { name: "Ada Lovelace", email: "ada@example.com", password: "correct horse" };

  it("trims the name and trims + lowercases the email", () => {
    expect(signUpSchema.parse({ ...valid, name: "  Ada  ", email: "  ADA@Example.COM " })).toEqual({
      ...valid,
      name: "Ada",
      email: "ada@example.com",
    });
  });

  it.each([
    [{ name: "   " }, "Enter your name"],
    [{ name: "x".repeat(81) }, "Name is too long"],
    [{ email: "not-an-email" }, "Enter a valid email address"],
    [{ password: "short" }, "Use at least 8 characters"],
    [{ password: "x".repeat(129) }, "Use at most 128 characters"],
  ])("rejects %j", (override, message) => {
    const result = signUpSchema.safeParse({ ...valid, ...override });
    expect(result.success).toBe(false);
    expect(result.error?.issues[0]?.message).toBe(message);
  });

  it("rejects unknown keys (no mass assignment of e.g. emailVerified)", () => {
    expect(signUpSchema.safeParse({ ...valid, emailVerified: true }).success).toBe(false);
  });
});

describe("signInSchema", () => {
  it("requires a password but does not enforce the sign-up length rule", () => {
    expect(signInSchema.safeParse({ email: "a@b.co", password: "x" }).success).toBe(true);
    expect(signInSchema.safeParse({ email: "a@b.co", password: "" }).success).toBe(false);
  });
});

describe("demoRoleSchema", () => {
  it("accepts only the three demo roles", () => {
    expect(demoRoleSchema.options).toEqual(["instructor", "ta", "student"]);
    expect(demoRoleSchema.safeParse("admin").success).toBe(false);
  });
});

describe("safeRedirectPath", () => {
  it.each([
    ["/courses/123?tab=grades", "/courses/123?tab=grades"],
    ["/dashboard", "/dashboard"],
  ])("allows same-site path %s", (input, expected) => {
    expect(safeRedirectPath(input)).toBe(expected);
  });

  it.each([
    "https://evil.example",
    "//evil.example",
    "/\\evil.example",
    "javascript:alert(1)",
    "dashboard",
    "/ok\r\nSet-Cookie: x",
    "",
    undefined,
    ["/a", "/b"],
  ])("falls back for unsafe value %j", (input) => {
    expect(safeRedirectPath(input)).toBe("/dashboard");
  });
});
