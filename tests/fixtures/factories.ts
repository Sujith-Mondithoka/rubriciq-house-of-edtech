import { randomUUID } from "node:crypto";

import type { Db } from "@/server/db/client";
import {
  assignment,
  course,
  courseMember,
  rubricCriterion,
  rubricLevel,
  submission,
  user,
} from "@/server/db/schema";

export async function createUser(db: Db, overrides: Partial<typeof user.$inferInsert> = {}) {
  const id = overrides.id ?? `user-${randomUUID()}`;
  const [row] = await db
    .insert(user)
    .values({ id, name: "Test User", email: `${id}@example.com`, ...overrides })
    .returning();
  return row!;
}

export async function createCourse(db: Db, createdBy: string) {
  const [row] = await db
    .insert(course)
    .values({ name: "Test course", joinCode: randomUUID().slice(0, 8).toUpperCase(), createdBy })
    .returning();
  await db
    .insert(courseMember)
    .values({ courseId: row!.id, userId: createdBy, role: "INSTRUCTOR" });
  return row!;
}

export async function createAssignment(
  db: Db,
  courseId: string,
  createdBy: string,
  overrides: Partial<typeof assignment.$inferInsert> = {},
) {
  const [row] = await db
    .insert(assignment)
    .values({
      courseId,
      createdBy,
      title: "Test assignment",
      dueAt: new Date(Date.now() + 86_400_000),
      ...overrides,
    })
    .returning();
  return row!;
}

export async function createCriterionWithLevels(db: Db, assignmentId: string, points: number[]) {
  const [criterion] = await db
    .insert(rubricCriterion)
    .values({ assignmentId, title: "Criterion", position: 0 })
    .returning();
  const levels = await db
    .insert(rubricLevel)
    .values(
      points.map((p, position) => ({
        criterionId: criterion!.id,
        label: `Level ${p}`,
        points: p,
        position,
      })),
    )
    .returning();
  return { criterion: criterion!, levels };
}

export async function createSubmission(db: Db, assignmentId: string, studentId: string) {
  const [row] = await db
    .insert(submission)
    .values({ assignmentId, studentId, content: "Answer", wordCount: 1 })
    .returning();
  return row!;
}
