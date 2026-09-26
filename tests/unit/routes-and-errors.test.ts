import { describe, expect, it } from "vitest";

import { authErrorMessage } from "@/lib/auth-errors";
import { isProtectedPath, signInUrlFor } from "@/lib/routes";

describe("isProtectedPath", () => {
  it.each(["/dashboard", "/dashboard/", "/courses", "/courses/abc/assignments"])(
    "protects %s",
    (path) => expect(isProtectedPath(path)).toBe(true),
  );

  it.each(["/", "/sign-in", "/sign-up", "/api/auth/session", "/dashboards", "/coursesx"])(
    "leaves %s public",
    (path) => expect(isProtectedPath(path)).toBe(false),
  );
});

describe("signInUrlFor", () => {
  it("encodes the original path and query as ?next", () => {
    expect(signInUrlFor("/courses/1", "?tab=a&b=c")).toBe(
      "/sign-in?next=%2Fcourses%2F1%3Ftab%3Da%26b%3Dc",
    );
  });
});

describe("authErrorMessage", () => {
  it.each([
    [{ status: 429 }, "Too many attempts. Please wait a minute and try again."],
    [{ status: 401, code: "INVALID_EMAIL_OR_PASSWORD" }, "Email or password is incorrect."],
    [
      { status: 422, code: "USER_ALREADY_EXISTS" },
      "An account with this email already exists. Try signing in.",
    ],
    [{ status: 400, message: "Enter your name" }, "Enter your name"],
    [
      { status: 500, message: "db exploded: stack trace" },
      "Something went wrong. Please try again.",
    ],
    [null, "Something went wrong. Please try again."],
  ])("maps %j", (error, message) => {
    expect(authErrorMessage(error)).toBe(message);
  });
});
