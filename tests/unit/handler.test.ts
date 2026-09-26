import { describe, expect, it } from "vitest";
import { z } from "zod";

import { AppError } from "@/lib/errors";
import { type ActionContext, defineHandler } from "@/server/actions/handler";
import { authorize } from "@/server/authz/authorize";

const ctx = {
  db: {} as ActionContext["db"],
  user: { id: "u1", name: "U", email: "u@example.com" },
  now: new Date(),
};
const schema = z.object({ name: z.string().trim().min(1, "Enter a name") }).strict();

describe("defineHandler", () => {
  it("passes parsed input and wraps the value in ok", async () => {
    const handler = defineHandler(schema, async (_ctx, input) => input.name.toUpperCase());
    await expect(handler(ctx, { name: " ada " })).resolves.toEqual({ ok: true, data: "ADA" });
  });

  it("returns field errors without running the handler", async () => {
    let ran = false;
    const handler = defineHandler(schema, async () => {
      ran = true;
    });
    await expect(handler(ctx, { name: " " })).resolves.toEqual({
      ok: false,
      code: "VALIDATION",
      message: "Please check the highlighted fields.",
      fieldErrors: { name: ["Enter a name"] },
    });
    await expect(handler(ctx, "not an object")).resolves.toMatchObject({ code: "VALIDATION" });
    expect(ran).toBe(false);
  });

  it("turns AppError into a failed Result", async () => {
    const handler = defineHandler(schema, async () => {
      throw new AppError("CONFLICT", "Already there", { name: ["Taken"] });
    });
    await expect(handler(ctx, { name: "a" })).resolves.toEqual({
      ok: false,
      code: "CONFLICT",
      message: "Already there",
      fieldErrors: { name: ["Taken"] },
    });
  });

  it("lets unexpected errors propagate to the action runner", async () => {
    const handler = defineHandler(schema, async () => {
      throw new Error("db down");
    });
    await expect(handler(ctx, { name: "a" })).rejects.toThrow("db down");
  });
});

describe("authorize", () => {
  const course = { archived: false, aiEnabled: true };

  it("hides the course from non-members (NOT_FOUND)", () => {
    expect(() => authorize(null, "course:manage", { course })).toThrow(
      expect.objectContaining({ code: "NOT_FOUND" }),
    );
  });

  it("rejects members without permission (FORBIDDEN)", () => {
    expect(() => authorize({ userId: "t", role: "TA" }, "course:manage", { course })).toThrow(
      expect.objectContaining({ code: "FORBIDDEN" }),
    );
  });

  it("allows permitted members", () => {
    expect(() =>
      authorize({ userId: "i", role: "INSTRUCTOR" }, "course:manage", { course }),
    ).not.toThrow();
  });
});
