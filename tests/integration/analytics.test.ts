import { and, eq } from "drizzle-orm";
import { afterAll, beforeEach, describe, expect, it } from "vitest";

import { DEMO_USERS, resetDemoData } from "@/server/db/demo-seed";
import { assignment, course, criterionScore, grade, submission } from "@/server/db/schema";
import {
  getAssignmentAnalytics,
  listAnalyzableAssignments,
} from "@/server/services/analytics.service";
import { getRubric } from "@/server/services/assignment.service";
import { saveGrade } from "@/server/services/grade.service";

import { createTestDb, truncateAll } from "./helpers/test-db";

const { db, pool } = createTestDb();
const NOW = new Date("2026-09-26T12:00:00Z");

beforeEach(async () => {
  await truncateAll(db);
  await resetDemoData(db, NOW);
});
afterAll(() => pool.end());

async function demoAssignment(title: string) {
  const [a] = await db
    .select({ id: assignment.id, maxScore: assignment.maxScore, courseId: assignment.courseId })
    .from(assignment)
    .where(eq(assignment.title, title));
  return a!;
}

describe("assignment analytics on the seeded demo data", () => {
  it("reflection: one released grade, 10 + 5 = 15 of 15", async () => {
    const a = await demoAssignment("Reflection: peer feedback");
    const stats = await getAssignmentAnalytics(db, a.id, a.maxScore);
    expect(stats).toMatchObject({
      submitted: 1,
      graded: 1,
      released: 1,
      maxScore: 15,
      average: 15,
      min: 15,
      max: 15,
    });
    expect(stats.criteria.map((c) => [c.title, c.average, c.maxPoints, c.scored])).toEqual([
      ["Insight", 10, 10, 1],
      ["Action plan", 5, 5, 1],
    ]);
    const insight = stats.criteria[0]!;
    expect(insight.levels.map((l) => [l.label, l.count])).toEqual([
      ["Surface", 0],
      ["Thoughtful", 0],
      ["Deep", 1],
    ]);
  });

  it("essay: two submitted, nothing graded yet", async () => {
    const a = await demoAssignment("Argumentative essay: remote learning");
    const stats = await getAssignmentAnalytics(db, a.id, a.maxScore);
    expect(stats).toMatchObject({ submitted: 2, graded: 0, average: null, min: null, max: null });
    expect(stats.criteria).toHaveLength(4);
    expect(stats.criteria.every((c) => c.scored === 0 && c.average === null)).toBe(true);
  });

  it("averages confirmed grades and ignores unreviewed AI drafts", async () => {
    const a = await demoAssignment("Argumentative essay: remote learning");
    const rubric = await getRubric(db, a.id);
    const subs = await db
      .select({ id: submission.id, studentId: submission.studentId })
      .from(submission)
      .where(and(eq(submission.assignmentId, a.id), eq(submission.status, "SUBMITTED")));
    const pick = (points: number[]) =>
      rubric.map((c, i) => ({
        criterionId: c.id,
        levelId: c.levels.find((l) => l.points === points[i])!.id,
        feedback: "",
      }));
    // Strong essay: 10 + 7 + 5 + 4 = 26. Weak essay: 4 + 0 + 2 + 2 = 8.
    const strong = subs.find((s) => s.studentId === DEMO_USERS.student1.id)!;
    const weak = subs.find((s) => s.studentId === DEMO_USERS.student2.id)!;
    await saveGrade(db, {
      submissionId: strong.id,
      actorId: DEMO_USERS.ta.id,
      version: 0,
      overallFeedback: "",
      scores: pick([10, 7, 5, 4]),
    });
    // The weak essay only has an AI draft (no person has saved it): excluded.
    const [ai] = await db
      .insert(grade)
      .values({ submissionId: weak.id, totalScore: 8 })
      .returning();
    await db.insert(criterionScore).values(
      pick([4, 0, 2, 2]).map((s, i) => ({
        gradeId: ai!.id,
        ...s,
        points: [4, 0, 2, 2][i]!,
        source: "AI" as const,
      })),
    );

    let stats = await getAssignmentAnalytics(db, a.id, a.maxScore);
    expect(stats).toMatchObject({ graded: 1, average: 26, min: 26, max: 26 });

    // Once a person saves it, it counts.
    await saveGrade(db, {
      submissionId: weak.id,
      actorId: DEMO_USERS.ta.id,
      version: 1,
      overallFeedback: "",
      scores: pick([4, 0, 2, 2]),
    });
    stats = await getAssignmentAnalytics(db, a.id, a.maxScore);
    expect(stats).toMatchObject({ graded: 2, released: 0, average: 17, min: 8, max: 26 });
    expect(stats.criteria.map((c) => c.average)).toEqual([7, 3.5, 3.5, 3]);
    expect(stats.criteria[0]!.levels.map((l) => l.count)).toEqual([0, 1, 0, 1]);
  });

  it("lists only published and closed assignments of the course", async () => {
    const [c] = await db
      .select({ id: course.id })
      .from(course)
      .where(eq(course.createdBy, DEMO_USERS.instructor.id));
    const list = await listAnalyzableAssignments(db, c!.id);
    expect(list.map((a) => a.title)).toEqual([
      "Reflection: peer feedback",
      "Argumentative essay: remote learning",
    ]);
  });
});
