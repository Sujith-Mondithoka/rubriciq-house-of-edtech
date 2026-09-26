import { count, eq } from "drizzle-orm";
import { afterAll, beforeEach, describe, expect, it } from "vitest";

import { DEMO_JOIN_CODE, DEMO_USERS, resetDemoData } from "@/server/db/demo-seed";
import { assignment, course, courseMember, grade, submission, user } from "@/server/db/schema";

import { createCourse, createUser } from "../fixtures/factories";
import { createTestDb, truncateAll } from "./helpers/test-db";

const { db, pool } = createTestDb();

beforeEach(() => truncateAll(db));
afterAll(() => pool.end());

async function countRows() {
  const [[users], [courses], [assignments], [submissions], [grades]] = await Promise.all([
    db.select({ n: count() }).from(user),
    db.select({ n: count() }).from(course),
    db.select({ n: count() }).from(assignment),
    db.select({ n: count() }).from(submission),
    db.select({ n: count() }).from(grade),
  ]);
  return {
    users: users!.n,
    courses: courses!.n,
    assignments: assignments!.n,
    submissions: submissions!.n,
    grades: grades!.n,
  };
}

describe("resetDemoData", () => {
  it("creates the demo course with every grading state", async () => {
    const summary = await resetDemoData(db, new Date("2026-09-26T00:00:00Z"));

    expect(await countRows()).toEqual(summary);

    const assignments = await db
      .select({ title: assignment.title, status: assignment.status, maxScore: assignment.maxScore })
      .from(assignment)
      .orderBy(assignment.title);
    expect(assignments).toEqual([
      { title: "Argumentative essay: remote learning", status: "PUBLISHED", maxScore: 30 },
      { title: "Reflection: peer feedback", status: "CLOSED", maxScore: 15 },
      { title: "Research proposal (draft)", status: "DRAFT", maxScore: 20 },
    ]);

    const [released] = await db.select().from(grade);
    expect(released).toMatchObject({ status: "RELEASED", totalScore: 15 });
  });

  it("is idempotent", async () => {
    await resetDemoData(db);
    const first = await countRows();
    await resetDemoData(db);
    expect(await countRows()).toEqual(first);
  });

  it("never touches data that is not owned by demo users", async () => {
    const realTeacher = await createUser(db);
    const realCourse = await createCourse(db, realTeacher.id);
    await resetDemoData(db);

    // A real student joins the demo course, then the demo is reset.
    const realStudent = await createUser(db);
    const [demoCourse] = await db.select().from(course).where(eq(course.joinCode, DEMO_JOIN_CODE));
    await db
      .insert(courseMember)
      .values({ courseId: demoCourse!.id, userId: realStudent.id, role: "STUDENT" });

    await resetDemoData(db);

    expect(await db.select().from(course).where(eq(course.id, realCourse.id))).toHaveLength(1);
    expect(await db.select().from(user).where(eq(user.id, realStudent.id))).toHaveLength(1);
    expect(await db.select().from(user).where(eq(user.id, DEMO_USERS.instructor.id))).toHaveLength(
      1,
    );
    // The recreated demo course starts without the real student.
    const members = await db
      .select()
      .from(courseMember)
      .where(eq(courseMember.userId, realStudent.id));
    expect(members).toEqual([]);
  });
});
