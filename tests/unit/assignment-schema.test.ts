import { describe, expect, it } from "vitest";

import {
  createAssignmentSchema,
  MAX_CRITERIA,
  MAX_LEVELS,
  rubricCriterionSchema,
  rubricMaxScore,
  saveRubricSchema,
} from "@/lib/validation/assignment.schema";

const UUID = "0b7e7f4a-3c1d-4e8b-9a2f-5d6c7b8a9e01";
const level = (points: number) => ({ label: `L${points}`, points, descriptor: "" });
const criterion = (points: number[]) => ({
  title: "C",
  description: "",
  levels: points.map(level),
});

describe("createAssignmentSchema", () => {
  const base = {
    courseId: UUID,
    title: " Essay ",
    instructions: " Write. ",
    dueAt: "2026-10-01T17:30:00+05:30",
    allowLate: false,
  };

  it("trims text and converts the due date to a UTC Date", () => {
    const parsed = createAssignmentSchema.parse(base);
    expect(parsed).toMatchObject({ title: "Essay", instructions: "Write." });
    expect(parsed.dueAt.toISOString()).toBe("2026-10-01T12:00:00.000Z");
  });

  it.each([
    ["no offset", { dueAt: "2026-10-01T12:00:00" }],
    ["not a date", { dueAt: "tomorrow" }],
    ["invalid course id", { courseId: "abc" }],
    ["unknown key", { maxScore: 100 }],
  ])("rejects %s", (_name, override) => {
    expect(createAssignmentSchema.safeParse({ ...base, ...override }).success).toBe(false);
  });
});

describe("rubricCriterionSchema", () => {
  it("accepts 2–6 levels with distinct whole points 0–100", () => {
    expect(rubricCriterionSchema.safeParse(criterion([0, 100])).success).toBe(true);
    expect(rubricCriterionSchema.safeParse(criterion([0, 1, 2, 3, 4, 5])).success).toBe(true);
  });

  it.each([
    ["one level", [5]],
    [`more than ${MAX_LEVELS} levels`, [0, 1, 2, 3, 4, 5, 6]],
    ["negative points", [-1, 5]],
    ["points over 100", [0, 101]],
    ["fractional points", [0, 2.5]],
  ])("rejects %s", (_name, points) => {
    expect(rubricCriterionSchema.safeParse(criterion(points)).success).toBe(false);
  });

  it("flags the duplicate level, not the first one", () => {
    const result = rubricCriterionSchema.safeParse(criterion([3, 5, 3]));
    expect(result.success).toBe(false);
    expect(result.error?.issues[0]?.path).toEqual(["levels", 2, "points"]);
  });
});

describe("saveRubricSchema", () => {
  it(`allows 1–${MAX_CRITERIA} criteria`, () => {
    const make = (n: number) => ({
      assignmentId: UUID,
      criteria: Array.from({ length: n }, () => criterion([0, 1])),
    });
    expect(saveRubricSchema.safeParse(make(0)).success).toBe(false);
    expect(saveRubricSchema.safeParse(make(1)).success).toBe(true);
    expect(saveRubricSchema.safeParse(make(MAX_CRITERIA)).success).toBe(true);
    expect(saveRubricSchema.safeParse(make(MAX_CRITERIA + 1)).success).toBe(false);
  });
});

describe("rubricMaxScore", () => {
  it("sums the top level of each criterion, in any order", () => {
    expect(rubricMaxScore([criterion([10, 0, 6]), criterion([1, 5])])).toBe(15);
    expect(rubricMaxScore([])).toBe(0);
  });
});
