import { eq } from "drizzle-orm";
import { afterAll, beforeEach, describe, expect, it } from "vitest";

import {
  aiGradingRun,
  assignment,
  courseMember,
  criterionScore,
  grade,
  rubricCriterion,
  rubricLevel,
  submission,
} from "@/server/db/schema";

import {
  createAssignment,
  createCourse,
  createCriterionWithLevels,
  createSubmission,
  createUser,
} from "../fixtures/factories";
import { createTestDb, expectPgError, truncateAll } from "./helpers/test-db";

const UNIQUE_VIOLATION = "23505";
// ON DELETE RESTRICT: Postgres 17 reports foreign_key_violation (23503),
// Postgres 18 reports restrict_violation (23001).
const RESTRICT_VIOLATION = ["23503", "23001"] as const;
const CHECK_VIOLATION = "23514";

const { db, pool } = createTestDb();

beforeEach(() => truncateAll(db));
afterAll(() => pool.end());

async function setup() {
  const instructor = await createUser(db);
  const student = await createUser(db);
  const course = await createCourse(db, instructor.id);
  const draft = await createAssignment(db, course.id, instructor.id);
  return { instructor, student, course, draft };
}

describe("database constraints", () => {
  it("allows a user only one membership per course", async () => {
    const { student, course } = await setup();
    await db
      .insert(courseMember)
      .values({ courseId: course.id, userId: student.id, role: "STUDENT" });

    await expectPgError(
      db.insert(courseMember).values({ courseId: course.id, userId: student.id, role: "TA" }),
      UNIQUE_VIOLATION,
    );
  });

  it("allows one submission per student per assignment", async () => {
    const { student, draft } = await setup();
    await createSubmission(db, draft.id, student.id);

    await expectPgError(createSubmission(db, draft.id, student.id), UNIQUE_VIOLATION);
  });

  it("keeps rubric level points within 0-100 and unique per criterion", async () => {
    const { draft } = await setup();
    const { criterion } = await createCriterionWithLevels(db, draft.id, [0, 5]);

    await expectPgError(
      db
        .insert(rubricLevel)
        .values({ criterionId: criterion.id, label: "Too high", points: 101, position: 2 }),
      CHECK_VIOLATION,
    );
    await expectPgError(
      db
        .insert(rubricLevel)
        .values({ criterionId: criterion.id, label: "Duplicate", points: 5, position: 2 }),
      UNIQUE_VIOLATION,
    );
  });

  it("blocks hard-deleting an assignment that has submissions", async () => {
    const { student, draft } = await setup();
    await createSubmission(db, draft.id, student.id);

    await expectPgError(
      db.delete(assignment).where(eq(assignment.id, draft.id)),
      RESTRICT_VIOLATION,
    );
  });

  it("hard-deletes a draft assignment together with its rubric", async () => {
    const { draft } = await setup();
    const { criterion } = await createCriterionWithLevels(db, draft.id, [0, 5, 10]);

    await db.delete(assignment).where(eq(assignment.id, draft.id));

    expect(
      await db.select().from(rubricCriterion).where(eq(rubricCriterion.id, criterion.id)),
    ).toEqual([]);
    expect(
      await db.select().from(rubricLevel).where(eq(rubricLevel.criterionId, criterion.id)),
    ).toEqual([]);
  });

  it("allows only one PENDING AI run per submission", async () => {
    const { student, course, draft } = await setup();
    const sub = await createSubmission(db, draft.id, student.id);
    const run = { submissionId: sub.id, courseId: course.id, model: "mock", promptVersion: "v1" };

    const [first] = await db.insert(aiGradingRun).values(run).returning();
    await expectPgError(db.insert(aiGradingRun).values(run), UNIQUE_VIOLATION);

    // Once the first run has finished, a retry is allowed.
    await db
      .update(aiGradingRun)
      .set({ status: "FAILED", errorCode: "TIMEOUT", finishedAt: new Date() })
      .where(eq(aiGradingRun.id, first!.id));
    await expect(db.insert(aiGradingRun).values(run)).resolves.toBeDefined();
  });

  it("allows one grade per submission and keeps AI confidence within 0-1", async () => {
    const { student, draft } = await setup();
    const sub = await createSubmission(db, draft.id, student.id);
    const { criterion, levels } = await createCriterionWithLevels(db, draft.id, [0, 5]);

    const [g] = await db.insert(grade).values({ submissionId: sub.id }).returning();
    await expectPgError(db.insert(grade).values({ submissionId: sub.id }), UNIQUE_VIOLATION);

    await expectPgError(
      db.insert(criterionScore).values({
        gradeId: g!.id,
        criterionId: criterion.id,
        levelId: levels[1]!.id,
        points: 5,
        source: "AI",
        aiConfidence: 1.5,
      }),
      CHECK_VIOLATION,
    );
  });

  it("blocks deleting a submission that has a grade", async () => {
    const { student, draft } = await setup();
    const sub = await createSubmission(db, draft.id, student.id);
    await db.insert(grade).values({ submissionId: sub.id });

    await expectPgError(db.delete(submission).where(eq(submission.id, sub.id)), RESTRICT_VIOLATION);
  });
});
