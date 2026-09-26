import { and, eq } from "drizzle-orm";
import { afterAll, beforeEach, describe, expect, it } from "vitest";

import type { Result } from "@/lib/result";
import {
  createAssignmentHandler,
  deleteAssignmentHandler,
} from "@/server/actions/assignment.handlers";
import {
  addTaHandler,
  archiveCourseHandler,
  createCourseHandler,
  regenerateJoinCodeHandler,
  removeMemberHandler,
  setCourseAiHandler,
  updateCourseHandler,
} from "@/server/actions/course.handlers";
import type { ActionContext } from "@/server/actions/handler";
import { DEMO_JOIN_CODE, DEMO_USERS, resetDemoData } from "@/server/db/demo-seed";
import { assignment, course, courseMember } from "@/server/db/schema";
import { hitRateLimit } from "@/server/services/rate-limit.service";

import { createUser } from "../fixtures/factories";
import { createTestDb, truncateAll } from "./helpers/test-db";

const { db, pool } = createTestDb();
const NOW = new Date("2026-09-26T12:00:00Z");

const demoInstructor = {
  id: DEMO_USERS.instructor.id,
  name: DEMO_USERS.instructor.name,
  email: DEMO_USERS.instructor.email,
};
const ctx = (user: { id: string; name: string; email: string }): ActionContext => ({
  db,
  user,
  now: NOW,
});

function unwrap<T>(result: Result<T>): T {
  if (!result.ok) throw new Error(`Expected ok, got ${result.code}: ${result.message}`);
  return result.data;
}

beforeEach(async () => {
  await truncateAll(db);
  await resetDemoData(db, NOW);
});
afterAll(() => pool.end());

async function demoCourse() {
  const [c] = await db.select().from(course).where(eq(course.joinCode, DEMO_JOIN_CODE));
  return c!;
}

describe("demo course protection", () => {
  it("demo accounts cannot archive, edit settings, remove members or delete assignments", async () => {
    const c = await demoCourse();
    const me = ctx(demoInstructor);
    const denied = {
      ok: false,
      code: "FORBIDDEN",
      message: expect.stringContaining("Disabled in the demo"),
    };

    expect(await archiveCourseHandler(me, { courseId: c.id })).toMatchObject(denied);
    expect(
      await updateCourseHandler(me, { courseId: c.id, name: "Renamed", description: "" }),
    ).toMatchObject(denied);
    expect(await regenerateJoinCodeHandler(me, { courseId: c.id })).toMatchObject(denied);
    expect(await setCourseAiHandler(me, { courseId: c.id, aiEnabled: false })).toMatchObject(
      denied,
    );

    const [ta] = await db
      .select()
      .from(courseMember)
      .where(and(eq(courseMember.courseId, c.id), eq(courseMember.role, "TA")));
    expect(await removeMemberHandler(me, { memberId: ta!.id })).toMatchObject(denied);

    const [draft] = await db
      .select()
      .from(assignment)
      .where(and(eq(assignment.courseId, c.id), eq(assignment.status, "DRAFT")));
    expect(await deleteAssignmentHandler(me, { assignmentId: draft!.id })).toMatchObject(denied);

    // Nothing changed.
    expect(await demoCourse()).toMatchObject({
      name: c.name,
      joinCode: DEMO_JOIN_CODE,
      aiEnabled: true,
      archivedAt: null,
    });
    expect(
      await db.select().from(courseMember).where(eq(courseMember.courseId, c.id)),
    ).toHaveLength(5);
    expect(await db.select().from(assignment).where(eq(assignment.id, draft!.id))).toHaveLength(1);
  });

  it("still lets demo accounts use the demo course (create assignments, add a TA)", async () => {
    const c = await demoCourse();
    const other = await createUser(db, { name: "Guest TA", email: "guest@example.com" });
    unwrap(await addTaHandler(ctx(demoInstructor), { courseId: c.id, email: other.email }));
    unwrap(
      await createAssignmentHandler(ctx(demoInstructor), {
        courseId: c.id,
        title: "Try-out",
        instructions: "",
        dueAt: new Date(NOW.getTime() + 86_400_000).toISOString(),
        allowLate: false,
      }),
    );
  });

  it("gives demo accounts full control of courses they create themselves", async () => {
    const me = ctx(demoInstructor);
    const { courseId } = unwrap(await createCourseHandler(me, { name: "Mine", description: "" }));
    unwrap(await updateCourseHandler(me, { courseId, name: "Mine, renamed", description: "" }));
    unwrap(await setCourseAiHandler(me, { courseId, aiEnabled: false }));
    unwrap(await regenerateJoinCodeHandler(me, { courseId }));
    unwrap(await archiveCourseHandler(me, { courseId }));
  });
});

describe("rate limiting", () => {
  const rule = { key: "test:user-1", limit: 3, windowMs: 60_000 };

  it("allows the limit, then refuses until the window resets", async () => {
    const results = [];
    for (let i = 0; i < 4; i++) results.push(await hitRateLimit(db, rule, NOW));
    expect(results.map((r) => r.ok)).toEqual([true, true, true, false]);
    expect(results[3]!.retryAfterMs).toBe(60_000);
    expect(results[2]!.remaining).toBe(0);

    const later = new Date(NOW.getTime() + 60_000);
    expect(await hitRateLimit(db, rule, later)).toMatchObject({ ok: true, remaining: 2 });
  });

  it("keeps separate counters per key, even under concurrent hits", async () => {
    const hits = await Promise.all(
      Array.from({ length: 5 }, () => hitRateLimit(db, { ...rule, key: "test:user-2" }, NOW)),
    );
    expect(hits.filter((h) => h.ok)).toHaveLength(3);
    expect(await hitRateLimit(db, { ...rule, key: "test:user-3" }, NOW)).toMatchObject({
      ok: true,
    });
  });
});
