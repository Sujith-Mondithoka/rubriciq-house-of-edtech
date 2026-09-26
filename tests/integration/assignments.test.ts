import { and, eq } from "drizzle-orm";
import { afterAll, beforeEach, describe, expect, it } from "vitest";

import type { Result } from "@/lib/result";
import {
  closeAssignmentHandler,
  createAssignmentHandler,
  deleteAssignmentHandler,
  publishAssignmentHandler,
  saveRubricHandler,
  updateAssignmentHandler,
} from "@/server/actions/assignment.handlers";
import {
  addTaHandler,
  createCourseHandler,
  joinCourseHandler,
} from "@/server/actions/course.handlers";
import type { ActionContext } from "@/server/actions/handler";
import { assignment, auditLog, course, rubricCriterion, rubricLevel } from "@/server/db/schema";
import {
  deleteDraftAssignment,
  getRubric,
  listAssignments,
  saveRubric,
} from "@/server/services/assignment.service";

import { createSubmission, createUser } from "../fixtures/factories";
import { createTestDb, truncateAll } from "./helpers/test-db";

const { db, pool } = createTestDb();
const NOW = new Date("2026-09-26T12:00:00Z");
const DAY = 24 * 60 * 60 * 1000;
const FUTURE = new Date(NOW.getTime() + 7 * DAY).toISOString();

type TestUser = { id: string; name: string; email: string };
const ctx = (user: TestUser, now = NOW): ActionContext => ({ db, user, now });

function unwrap<T>(result: Result<T>): T {
  if (!result.ok) throw new Error(`Expected ok, got ${result.code}: ${result.message}`);
  return result.data;
}

async function newUser(name: string) {
  const u = await createUser(db, { name, email: `${name.toLowerCase()}@example.com` });
  return { id: u.id, name: u.name, email: u.email };
}

const rubric = [
  {
    title: "Thesis",
    description: "Clear position",
    levels: [
      { label: "Missing", points: 0, descriptor: "" },
      { label: "Clear", points: 6, descriptor: "" },
      { label: "Excellent", points: 10, descriptor: "" },
    ],
  },
  {
    title: "Evidence",
    description: "",
    levels: [
      { label: "Weak", points: 1, descriptor: "" },
      { label: "Strong", points: 5, descriptor: "" },
    ],
  },
];

async function setup() {
  const alice = await newUser("Alice");
  const bob = await newUser("Bob");
  const tara = await newUser("Tara");
  const sam = await newUser("Sam");
  const { courseId } = unwrap(
    await createCourseHandler(ctx(alice), { name: "Course A", description: "" }),
  );
  const { courseId: courseB } = unwrap(
    await createCourseHandler(ctx(bob), { name: "Course B", description: "" }),
  );
  unwrap(await addTaHandler(ctx(alice), { courseId, email: tara.email }));
  const [a] = await db.select().from(course).where(eq(course.id, courseId));
  unwrap(await joinCourseHandler(ctx(sam), { joinCode: a!.joinCode }));

  const { assignmentId } = unwrap(
    await createAssignmentHandler(ctx(alice), {
      courseId,
      title: "  Essay 1 ",
      instructions: "Write an essay.",
      dueAt: FUTURE,
      allowLate: false,
    }),
  );
  return { alice, bob, tara, sam, courseId, courseB, assignmentId };
}

const status = async (id: string) =>
  (await db.select().from(assignment).where(eq(assignment.id, id)))[0]!;

beforeEach(() => truncateAll(db));
afterAll(() => pool.end());

describe("creating and editing assignments", () => {
  it("creates a trimmed DRAFT with a UTC due date", async () => {
    const { assignmentId } = await setup();
    const row = await status(assignmentId);
    expect(row).toMatchObject({ title: "Essay 1", status: "DRAFT", maxScore: 0 });
    expect(row.dueAt.toISOString()).toBe(FUTURE);
  });

  it("accepts due dates with an offset and stores them in UTC", async () => {
    const { alice, courseId } = await setup();
    const { assignmentId } = unwrap(
      await createAssignmentHandler(ctx(alice), {
        courseId,
        title: "IST",
        instructions: "",
        dueAt: "2026-10-01T17:30:00+05:30",
        allowLate: true,
      }),
    );
    expect((await status(assignmentId)).dueAt.toISOString()).toBe("2026-10-01T12:00:00.000Z");
  });

  it.each([
    [{ title: "" }, "title"],
    [{ title: "x".repeat(121) }, "title"],
    [{ instructions: "x".repeat(5001) }, "instructions"],
    [{ dueAt: "next friday" }, "dueAt"],
    [{ dueAt: "2026-10-01T12:00:00" }, "dueAt"],
    [{ allowLate: "yes" }, "allowLate"],
  ])("rejects %j", async (override, field) => {
    const { alice, courseId } = await setup();
    const result = await createAssignmentHandler(ctx(alice), {
      courseId,
      title: "T",
      instructions: "",
      dueAt: FUTURE,
      allowLate: false,
      ...override,
    });
    expect(result).toMatchObject({ ok: false, code: "VALIDATION" });
    expect(!result.ok && result.fieldErrors?.[field]).toBeTruthy();
  });

  it("only the instructor creates and edits assignments", async () => {
    const { tara, sam, courseId, assignmentId } = await setup();
    for (const who of [tara, sam]) {
      const input = { courseId, title: "X", instructions: "", dueAt: FUTURE, allowLate: false };
      expect(await createAssignmentHandler(ctx(who), input)).toMatchObject({
        ok: false,
        code: "FORBIDDEN",
      });
    }
    const edit = { assignmentId, title: "X", instructions: "", dueAt: FUTURE, allowLate: false };
    expect(await updateAssignmentHandler(ctx(tara), edit)).toMatchObject({ code: "FORBIDDEN" });
    // Students cannot even see a draft.
    expect(await updateAssignmentHandler(ctx(sam), edit)).toMatchObject({ code: "NOT_FOUND" });
  });

  it("another course's instructor cannot touch the assignment", async () => {
    const { bob, courseB, assignmentId } = await setup();
    const results = await Promise.all([
      updateAssignmentHandler(ctx(bob), {
        assignmentId,
        title: "Hijack",
        instructions: "",
        dueAt: FUTURE,
        allowLate: false,
      }),
      saveRubricHandler(ctx(bob), { assignmentId, criteria: rubric }),
      publishAssignmentHandler(ctx(bob), { assignmentId }),
      deleteAssignmentHandler(ctx(bob), { assignmentId }),
    ]);
    for (const r of results) expect(r).toMatchObject({ ok: false, code: "NOT_FOUND" });
    // Creating in someone else's course is refused too.
    expect(
      await createAssignmentHandler(ctx(bob), {
        courseId: (await status(assignmentId)).courseId,
        title: "X",
        instructions: "",
        dueAt: FUTURE,
        allowLate: false,
      }),
    ).toMatchObject({ code: "NOT_FOUND" });
    expect(
      (await listAssignments(db, courseB, { includeDrafts: true }, { page: 1, pageSize: 20 }))
        .items,
    ).toHaveLength(0);
  });
});

describe("rubric builder", () => {
  it("saves criteria and levels in order and computes max score on the server", async () => {
    const { alice, assignmentId } = await setup();
    const saved = unwrap(await saveRubricHandler(ctx(alice), { assignmentId, criteria: rubric }));
    expect(saved.maxScore).toBe(15);
    expect((await status(assignmentId)).maxScore).toBe(15);

    const stored = await getRubric(db, assignmentId);
    expect(stored.map((c) => c.title)).toEqual(["Thesis", "Evidence"]);
    expect(stored[0]!.levels.map((l) => l.points)).toEqual([0, 6, 10]);
  });

  it("replaces the rubric: removed criteria and their levels are hard-deleted", async () => {
    const { alice, assignmentId } = await setup();
    unwrap(await saveRubricHandler(ctx(alice), { assignmentId, criteria: rubric }));
    unwrap(await saveRubricHandler(ctx(alice), { assignmentId, criteria: [rubric[1]!] }));

    const criteria = await db
      .select()
      .from(rubricCriterion)
      .where(eq(rubricCriterion.assignmentId, assignmentId));
    expect(criteria.map((c) => c.title)).toEqual(["Evidence"]);
    expect(await db.select().from(rubricLevel)).toHaveLength(2);
    expect((await status(assignmentId)).maxScore).toBe(5);
  });

  it.each([
    ["no criteria", []],
    ["one level", [{ ...rubric[1]!, levels: [rubric[1]!.levels[0]!] }]],
    [
      "duplicate points",
      [
        {
          ...rubric[1]!,
          levels: [
            { label: "A", points: 3, descriptor: "" },
            { label: "B", points: 3, descriptor: "" },
          ],
        },
      ],
    ],
    [
      "points over 100",
      [
        {
          ...rubric[1]!,
          levels: [...rubric[1]!.levels, { label: "C", points: 101, descriptor: "" }],
        },
      ],
    ],
    [
      "fractional points",
      [
        {
          ...rubric[1]!,
          levels: [...rubric[1]!.levels, { label: "C", points: 2.5, descriptor: "" }],
        },
      ],
    ],
    ["blank title", [{ ...rubric[1]!, title: "  " }]],
    ["unknown key", [{ ...rubric[1]!, weight: 2 }]],
  ])("rejects a rubric with %s", async (_name, criteria) => {
    const { alice, assignmentId } = await setup();
    expect(await saveRubricHandler(ctx(alice), { assignmentId, criteria })).toMatchObject({
      ok: false,
      code: "VALIDATION",
    });
  });

  it("TAs cannot edit the rubric", async () => {
    const { tara, assignmentId } = await setup();
    expect(await saveRubricHandler(ctx(tara), { assignmentId, criteria: rubric })).toMatchObject({
      code: "FORBIDDEN",
    });
  });
});

describe("publish, close and the rubric lock", () => {
  it("cannot publish without a rubric or with a past due date", async () => {
    const { alice, assignmentId } = await setup();
    expect(await publishAssignmentHandler(ctx(alice), { assignmentId })).toMatchObject({
      ok: false,
      code: "CONFLICT",
      message: expect.stringContaining("rubric"),
    });

    unwrap(await saveRubricHandler(ctx(alice), { assignmentId, criteria: rubric }));
    const later = new Date(NOW.getTime() + 8 * DAY);
    expect(await publishAssignmentHandler(ctx(alice, later), { assignmentId })).toMatchObject({
      ok: false,
      code: "CONFLICT",
      message: expect.stringContaining("due date"),
    });
  });

  it("publishes, locks the rubric, then closes (audited)", async () => {
    const { alice, sam, courseId, assignmentId } = await setup();
    unwrap(await saveRubricHandler(ctx(alice), { assignmentId, criteria: rubric }));

    // Students do not see drafts in the list.
    const page = { page: 1, pageSize: 20 };
    expect(
      (await listAssignments(db, courseId, { includeDrafts: false }, page)).items,
    ).toHaveLength(0);

    unwrap(await publishAssignmentHandler(ctx(alice), { assignmentId }));
    expect(await status(assignmentId)).toMatchObject({ status: "PUBLISHED", publishedAt: NOW });
    expect(
      (await listAssignments(db, courseId, { includeDrafts: false }, page)).items,
    ).toHaveLength(1);

    // Locked: the policy refuses, and the service refuses even if called directly.
    expect(await saveRubricHandler(ctx(alice), { assignmentId, criteria: rubric })).toMatchObject({
      ok: false,
      code: "FORBIDDEN",
    });
    await expect(saveRubric(db, assignmentId, rubric)).rejects.toMatchObject({ code: "CONFLICT" });
    expect(await publishAssignmentHandler(ctx(alice), { assignmentId })).toMatchObject({
      code: "CONFLICT",
    });

    // Details can still change while published.
    unwrap(
      await updateAssignmentHandler(ctx(alice), {
        assignmentId,
        title: "Essay 1 (extended)",
        instructions: "",
        dueAt: FUTURE,
        allowLate: true,
      }),
    );

    // Only the instructor can close, and only once.
    expect(await closeAssignmentHandler(ctx(sam), { assignmentId })).toMatchObject({
      code: "FORBIDDEN",
    });
    unwrap(await closeAssignmentHandler(ctx(alice), { assignmentId }));
    expect((await status(assignmentId)).status).toBe("CLOSED");
    expect(await closeAssignmentHandler(ctx(alice), { assignmentId })).toMatchObject({
      code: "CONFLICT",
    });
    expect(
      await updateAssignmentHandler(ctx(alice), {
        assignmentId,
        title: "Too late",
        instructions: "",
        dueAt: FUTURE,
        allowLate: false,
      }),
    ).toMatchObject({ code: "CONFLICT" });

    const actions = (
      await db.select().from(auditLog).where(eq(auditLog.entityId, assignmentId))
    ).map((r) => r.action);
    expect(actions.sort()).toEqual(["assignment.closed", "assignment.published"]);
  });
});

describe("safe hard delete", () => {
  it("deletes a DRAFT with no submissions, including its rubric", async () => {
    const { alice, assignmentId } = await setup();
    unwrap(await saveRubricHandler(ctx(alice), { assignmentId, criteria: rubric }));
    unwrap(await deleteAssignmentHandler(ctx(alice), { assignmentId }));
    expect(await db.select().from(assignment).where(eq(assignment.id, assignmentId))).toHaveLength(
      0,
    );
    expect(await db.select().from(rubricLevel)).toHaveLength(0);
  });

  it("refuses a published assignment", async () => {
    const { alice, assignmentId } = await setup();
    unwrap(await saveRubricHandler(ctx(alice), { assignmentId, criteria: rubric }));
    unwrap(await publishAssignmentHandler(ctx(alice), { assignmentId }));
    expect(await deleteAssignmentHandler(ctx(alice), { assignmentId })).toMatchObject({
      ok: false,
      code: "FORBIDDEN",
    });
    await expect(deleteDraftAssignment(db, alice.id, assignmentId)).rejects.toMatchObject({
      code: "CONFLICT",
    });
  });

  it("refuses a draft that has submissions (re-checked inside the transaction)", async () => {
    const { alice, sam, assignmentId } = await setup();
    await createSubmission(db, assignmentId, sam.id);
    expect(await deleteAssignmentHandler(ctx(alice), { assignmentId })).toMatchObject({
      ok: false,
      code: "FORBIDDEN",
    });
    await expect(deleteDraftAssignment(db, alice.id, assignmentId)).rejects.toMatchObject({
      code: "CONFLICT",
    });
    expect(
      await db
        .select()
        .from(assignment)
        .where(and(eq(assignment.id, assignmentId))),
    ).toHaveLength(1);
  });

  it("TAs cannot delete", async () => {
    const { tara, assignmentId } = await setup();
    expect(await deleteAssignmentHandler(ctx(tara), { assignmentId })).toMatchObject({
      code: "FORBIDDEN",
    });
  });
});
