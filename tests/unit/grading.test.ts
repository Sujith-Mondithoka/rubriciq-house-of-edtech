import { describe, expect, it } from "vitest";

import { missingCriteria, nextScoreSource, totalPoints } from "@/lib/grading";
import {
  parseQueueFilter,
  releaseGradesSchema,
  saveGradeSchema,
} from "@/lib/validation/grade.schema";

const A = "00000000-0000-4000-8000-00000000000a";
const B = "00000000-0000-4000-8000-00000000000b";
const L1 = "00000000-0000-4000-8000-000000000001";

describe("scoring", () => {
  it("totals the chosen levels' points", () => {
    expect(totalPoints([])).toBe(0);
    expect(totalPoints([{ points: 7 }, { points: 4 }, { points: 0 }])).toBe(11);
  });

  it("lists criteria without a level", () => {
    expect(
      missingCriteria(
        [A, B],
        [
          { criterionId: A, levelId: L1 },
          { criterionId: B, levelId: null },
        ],
      ),
    ).toEqual([B]);
    expect(missingCriteria([A], [{ criterionId: A, levelId: L1 }])).toEqual([]);
  });
});

describe("score source transitions", () => {
  const ai = { source: "AI" as const, levelId: L1, feedback: "Good" };

  it("a new or human score is HUMAN", () => {
    expect(nextScoreSource(undefined, { levelId: L1, feedback: "" })).toBe("HUMAN");
    expect(nextScoreSource({ ...ai, source: "HUMAN" }, { levelId: L1, feedback: "x" })).toBe(
      "HUMAN",
    );
  });

  it("an accepted AI suggestion stays AI; any change makes it AI_EDITED for good", () => {
    expect(nextScoreSource(ai, { levelId: L1, feedback: "Good" })).toBe("AI");
    expect(nextScoreSource(ai, { levelId: A, feedback: "Good" })).toBe("AI_EDITED");
    expect(nextScoreSource(ai, { levelId: L1, feedback: "Better" })).toBe("AI_EDITED");
    expect(nextScoreSource({ ...ai, source: "AI_EDITED" }, { levelId: L1, feedback: "Good" })).toBe(
      "AI_EDITED",
    );
  });
});

describe("saveGradeSchema", () => {
  const valid = {
    submissionId: A,
    version: 0,
    overallFeedback: "  Nice work  ",
    scores: [{ criterionId: B, levelId: L1, feedback: "" }],
  };

  it("accepts a valid draft and trims text", () => {
    const parsed = saveGradeSchema.parse(valid);
    expect(parsed.overallFeedback).toBe("Nice work");
  });

  it("allows an unscored criterion (levelId null)", () => {
    expect(
      saveGradeSchema.safeParse({
        ...valid,
        scores: [{ criterionId: B, levelId: null, feedback: "" }],
      }).success,
    ).toBe(true);
  });

  it("rejects client-sent points, totals and unknown keys", () => {
    expect(saveGradeSchema.safeParse({ ...valid, totalScore: 99 }).success).toBe(false);
    expect(
      saveGradeSchema.safeParse({
        ...valid,
        scores: [{ criterionId: B, levelId: L1, feedback: "", points: 100 }],
      }).success,
    ).toBe(false);
  });

  it("rejects duplicate criteria, bad ids, negative versions and long feedback", () => {
    const dup = { criterionId: B, levelId: L1, feedback: "" };
    expect(saveGradeSchema.safeParse({ ...valid, scores: [dup, dup] }).success).toBe(false);
    expect(saveGradeSchema.safeParse({ ...valid, submissionId: "nope" }).success).toBe(false);
    expect(saveGradeSchema.safeParse({ ...valid, version: -1 }).success).toBe(false);
    expect(saveGradeSchema.safeParse({ ...valid, version: 1.5 }).success).toBe(false);
    expect(saveGradeSchema.safeParse({ ...valid, overallFeedback: "a".repeat(2001) }).success).toBe(
      false,
    );
  });
});

describe("releaseGradesSchema", () => {
  it("needs 1–200 distinct grades with versions", () => {
    const g = { submissionId: A, version: 2 };
    expect(releaseGradesSchema.safeParse({ assignmentId: B, grades: [g] }).success).toBe(true);
    expect(releaseGradesSchema.safeParse({ assignmentId: B, grades: [] }).success).toBe(false);
    expect(releaseGradesSchema.safeParse({ assignmentId: B, grades: [g, g] }).success).toBe(false);
    expect(
      releaseGradesSchema.safeParse({ assignmentId: B, grades: [{ submissionId: A, version: 0 }] })
        .success,
    ).toBe(false);
    const many = Array.from({ length: 201 }, (_, i) => ({
      submissionId: `00000000-0000-4000-8000-${String(i).padStart(12, "0")}`,
      version: 1,
    }));
    expect(releaseGradesSchema.safeParse({ assignmentId: B, grades: many }).success).toBe(false);
  });
});

describe("parseQueueFilter", () => {
  it("accepts known statuses and ignores anything else", () => {
    expect(parseQueueFilter("RELEASED")).toBe("RELEASED");
    expect(parseQueueFilter(["SUBMITTED", "X"])).toBe("SUBMITTED");
    expect(parseQueueFilter("released")).toBeNull();
    expect(parseQueueFilter(undefined)).toBeNull();
  });
});
