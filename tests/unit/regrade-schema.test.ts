import { describe, expect, it } from "vitest";

import {
  createRegradeSchema,
  parseRegradeFilter,
  resolveRegradeSchema,
} from "@/lib/validation/regrade.schema";
import { regradeDeadline } from "@/server/services/regrade.service";

const A = "00000000-0000-4000-8000-00000000000a";
const B = "00000000-0000-4000-8000-00000000000b";

describe("createRegradeSchema", () => {
  const valid = { submissionId: A, criterionId: null, reason: "  The evidence was there.  " };

  it("accepts a whole-grade or criterion request and trims the reason", () => {
    expect(createRegradeSchema.parse(valid).reason).toBe("The evidence was there.");
    expect(createRegradeSchema.safeParse({ ...valid, criterionId: B }).success).toBe(true);
  });

  it("needs a real reason and rejects unknown keys", () => {
    expect(createRegradeSchema.safeParse({ ...valid, reason: "too short" }).success).toBe(false);
    expect(createRegradeSchema.safeParse({ ...valid, reason: "x".repeat(2001) }).success).toBe(
      false,
    );
    expect(createRegradeSchema.safeParse({ ...valid, status: "ACCEPTED" }).success).toBe(false);
    expect(createRegradeSchema.safeParse({ ...valid, criterionId: "nope" }).success).toBe(false);
  });
});

describe("resolveRegradeSchema", () => {
  const base = { regradeId: A, response: "Looked again.", version: 2 };

  it("accept needs changes; reject must not have any", () => {
    const change = { criterionId: A, levelId: B };
    expect(
      resolveRegradeSchema.safeParse({ ...base, decision: "ACCEPTED", changes: [change] }).success,
    ).toBe(true);
    expect(
      resolveRegradeSchema.safeParse({ ...base, decision: "ACCEPTED", changes: [] }).success,
    ).toBe(false);
    expect(
      resolveRegradeSchema.safeParse({ ...base, decision: "REJECTED", changes: [] }).success,
    ).toBe(true);
    expect(
      resolveRegradeSchema.safeParse({ ...base, decision: "REJECTED", changes: [change] }).success,
    ).toBe(false);
    expect(
      resolveRegradeSchema.safeParse({ ...base, decision: "ACCEPTED", changes: [change, change] })
        .success,
    ).toBe(false);
  });

  it("requires a response, a closed decision enum and no client points", () => {
    expect(
      resolveRegradeSchema.safeParse({ ...base, response: " ", decision: "REJECTED", changes: [] })
        .success,
    ).toBe(false);
    expect(resolveRegradeSchema.safeParse({ ...base, decision: "OPEN", changes: [] }).success).toBe(
      false,
    );
    expect(
      resolveRegradeSchema.safeParse({
        ...base,
        decision: "ACCEPTED",
        changes: [{ criterionId: A, levelId: B, points: 100 }],
      }).success,
    ).toBe(false);
  });
});

describe("regrade window", () => {
  it("closes exactly 7 days after release", () => {
    const releasedAt = new Date("2026-09-01T10:00:00Z");
    expect(regradeDeadline(releasedAt).toISOString()).toBe("2026-09-08T10:00:00.000Z");
  });

  it("parses the list filter leniently", () => {
    expect(parseRegradeFilter("RESOLVED")).toBe("RESOLVED");
    expect(parseRegradeFilter(undefined)).toBe("OPEN");
    expect(parseRegradeFilter("anything")).toBe("OPEN");
  });
});
