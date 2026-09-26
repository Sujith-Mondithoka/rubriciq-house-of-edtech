import { isAPIError } from "better-auth/api";
import { afterAll, beforeEach, describe, expect, it } from "vitest";

import { createAuth } from "@/server/auth/create-auth";
import { DEMO_LOGINS, DEMO_PASSWORD } from "@/server/db/demo-accounts";
import { resetDemoData } from "@/server/db/demo-seed";

import { createTestDb, truncateAll } from "./helpers/test-db";

const BASE_URL = "http://localhost:3000";
const { db, pool } = createTestDb();

function makeAuth({ rateLimitEnabled = false } = {}) {
  return createAuth({
    db,
    secret: "integration-test-secret-".padEnd(40, "x"),
    baseURL: BASE_URL,
    trustedOrigins: [BASE_URL],
    rateLimitEnabled,
  });
}

/** Captures the rejection so tests can assert on Better Auth's APIError. */
async function rejection(promise: Promise<unknown>) {
  try {
    await promise;
  } catch (error) {
    if (isAPIError(error))
      return { statusCode: error.statusCode, code: error.body?.code, message: error.body?.message };
    throw error;
  }
  throw new Error("Expected the call to be rejected");
}

beforeEach(() => truncateAll(db));
afterAll(() => pool.end());

describe("email and password auth", () => {
  const ada = { name: "Ada Lovelace", email: "ada@example.com", password: "correct horse" };

  it("signs up with normalised input, then signs in", async () => {
    const auth = makeAuth();
    const { user } = await auth.api.signUpEmail({
      body: { ...ada, name: "  Ada Lovelace ", email: " ADA@Example.com" },
    });
    expect(user).toMatchObject({ name: "Ada Lovelace", email: "ada@example.com" });

    const signedIn = await auth.api.signInEmail({
      body: { email: ada.email, password: ada.password },
    });
    expect(signedIn.token).toEqual(expect.any(String));
  });

  it("validates sign-up on the server, not only in the form", async () => {
    const auth = makeAuth();
    await expect(
      rejection(auth.api.signUpEmail({ body: { ...ada, name: "   " } })),
    ).resolves.toMatchObject({
      statusCode: 400,
      message: "Enter your name",
    });
    await expect(
      rejection(auth.api.signUpEmail({ body: { ...ada, password: "short" } })),
    ).resolves.toMatchObject({ statusCode: 400 });
  });

  it("rejects unknown sign-up fields instead of mass-assigning them", async () => {
    const auth = makeAuth();
    const body = { ...ada, emailVerified: true } as unknown as typeof ada;
    await expect(rejection(auth.api.signUpEmail({ body }))).resolves.toMatchObject({
      statusCode: 400,
    });
  });

  it("does not reveal whether the email or the password was wrong", async () => {
    const auth = makeAuth();
    await auth.api.signUpEmail({ body: ada });

    const wrongPassword = await rejection(
      auth.api.signInEmail({ body: { email: ada.email, password: "wrong password" } }),
    );
    const unknownEmail = await rejection(
      auth.api.signInEmail({ body: { email: "nobody@example.com", password: "whatever1" } }),
    );
    expect(wrongPassword).toMatchObject({ statusCode: 401, code: "INVALID_EMAIL_OR_PASSWORD" });
    expect(unknownEmail).toEqual(wrongPassword);
  });

  it("resolves the session from the cookie it issues", async () => {
    const auth = makeAuth();
    await auth.api.signUpEmail({ body: ada });
    const { headers } = await auth.api.signInEmail({
      body: { email: ada.email, password: ada.password },
      returnHeaders: true,
    });
    const cookie = headers.get("set-cookie")!.split(";")[0]!;

    const session = await auth.api.getSession({ headers: new Headers({ cookie }) });
    expect(session?.user.email).toBe(ada.email);

    const noSession = await auth.api.getSession({ headers: new Headers() });
    expect(noSession).toBeNull();
  });
});

describe("demo accounts", () => {
  it("can sign in with the public demo password after seeding", async () => {
    await resetDemoData(db);
    const auth = makeAuth();
    for (const demo of Object.values(DEMO_LOGINS)) {
      const result = await auth.api.signInEmail({
        body: { email: demo.email, password: DEMO_PASSWORD },
      });
      expect(result.user.id).toBe(demo.id);
    }
  });
});

describe("rate limiting", () => {
  it("blocks the 6th sign-in attempt per minute from one IP (stored in Postgres)", async () => {
    const auth = makeAuth({ rateLimitEnabled: true });
    const attempt = () =>
      auth.handler(
        new Request(`${BASE_URL}/api/auth/sign-in/email`, {
          method: "POST",
          headers: {
            "content-type": "application/json",
            origin: BASE_URL,
            "x-forwarded-for": "203.0.113.7",
          },
          body: JSON.stringify({ email: "ada@example.com", password: "wrong password" }),
        }),
      );

    const statuses: number[] = [];
    for (let i = 0; i < 6; i++) statuses.push((await attempt()).status);

    expect(statuses.slice(0, 5)).toEqual([401, 401, 401, 401, 401]);
    expect(statuses[5]).toBe(429);
  });
});
