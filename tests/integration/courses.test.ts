import { and, eq } from "drizzle-orm";
import { afterAll, beforeEach, describe, expect, it } from "vitest";

import { JOIN_CODE_ALPHABET, JOIN_CODE_LENGTH } from "@/lib/validation/course.schema";
import type { Result } from "@/lib/result";
import {
  addTaHandler,
  archiveCourseHandler,
  createCourseHandler,
  joinCourseHandler,
  regenerateJoinCodeHandler,
  removeMemberHandler,
  setCourseAiHandler,
  updateCourseHandler,
} from "@/server/actions/course.handlers";
import type { ActionContext } from "@/server/actions/handler";
import { auditLog, course, courseMember } from "@/server/db/schema";
import { getCourseAccess, listMembers, listMyCourses } from "@/server/services/course.service";

import { createUser } from "../fixtures/factories";
import { createTestDb, truncateAll } from "./helpers/test-db";

const { db, pool } = createTestDb();
const NOW = new Date("2026-09-26T12:00:00Z");

type TestUser = { id: string; name: string; email: string };
const ctx = (user: TestUser): ActionContext => ({ db, user, now: NOW });

function unwrap<T>(result: Result<T>): T {
  if (!result.ok) throw new Error(`Expected ok, got ${result.code}: ${result.message}`);
  return result.data;
}

async function newUser(name: string) {
  const u = await createUser(db, { name, email: `${name.toLowerCase()}@example.com` });
  return { id: u.id, name: u.name, email: u.email };
}

async function setup() {
  const alice = await newUser("Alice"); // instructor of course A
  const bob = await newUser("Bob"); // instructor of course B
  const tara = await newUser("Tara"); // TA in A
  const sam = await newUser("Sam"); // student in A
  const outsider = await newUser("Olivia");

  const { courseId: courseA } = unwrap(
    await createCourseHandler(ctx(alice), { name: "Course A", description: "" }),
  );
  const { courseId: courseB } = unwrap(
    await createCourseHandler(ctx(bob), { name: "Course B", description: "Bob's" }),
  );
  unwrap(await addTaHandler(ctx(alice), { courseId: courseA, email: tara.email }));
  const [a] = await db.select().from(course).where(eq(course.id, courseA));
  unwrap(await joinCourseHandler(ctx(sam), { joinCode: a!.joinCode }));

  return { alice, bob, tara, sam, outsider, courseA, courseB, joinCodeA: a!.joinCode };
}

beforeEach(() => truncateAll(db));
afterAll(() => pool.end());

describe("creating and joining courses", () => {
  it("makes the creator the Instructor and generates a readable join code", async () => {
    const alice = await newUser("Alice");
    const { courseId } = unwrap(
      await createCourseHandler(ctx(alice), { name: "  Essays  ", description: " Intro " }),
    );
    const access = await getCourseAccess(db, courseId, alice.id);
    expect(access?.member).toEqual({ userId: alice.id, role: "INSTRUCTOR" });
    expect(access?.course).toMatchObject({ name: "Essays", description: "Intro", aiEnabled: true });
    expect(access?.course.joinCode).toHaveLength(JOIN_CODE_LENGTH);
    expect([...access!.course.joinCode].every((ch) => JOIN_CODE_ALPHABET.includes(ch))).toBe(true);
  });

  it("rejects invalid and unknown input with field errors", async () => {
    const alice = await newUser("Alice");
    const empty = await createCourseHandler(ctx(alice), { name: "   ", description: "" });
    expect(empty).toMatchObject({ ok: false, code: "VALIDATION" });
    expect(!empty.ok && empty.fieldErrors?.name).toBeTruthy();

    const extra = await createCourseHandler(ctx(alice), {
      name: "X",
      description: "",
      createdBy: "someone-else",
    });
    expect(extra).toMatchObject({ ok: false, code: "VALIDATION" });
  });

  it("joins by code case-insensitively, ignoring spaces and dashes, and only once", async () => {
    const { sam, courseA, joinCodeA } = await setup();
    const messy = ` ${joinCodeA.slice(0, 4).toLowerCase()}-${joinCodeA.slice(4)} `;
    const again = unwrap(await joinCourseHandler(ctx(sam), { joinCode: messy }));
    expect(again).toMatchObject({ courseId: courseA, alreadyMember: true });

    const rows = await db
      .select()
      .from(courseMember)
      .where(and(eq(courseMember.courseId, courseA), eq(courseMember.userId, sam.id)));
    expect(rows).toHaveLength(1);
    expect(rows[0]!.role).toBe("STUDENT");
  });

  it("does not downgrade an instructor who enters their own join code", async () => {
    const { alice, courseA, joinCodeA } = await setup();
    unwrap(await joinCourseHandler(ctx(alice), { joinCode: joinCodeA }));
    expect((await getCourseAccess(db, courseA, alice.id))?.member?.role).toBe("INSTRUCTOR");
  });

  it("rejects unknown and archived join codes", async () => {
    const { alice, outsider, courseA, joinCodeA } = await setup();
    expect(await joinCourseHandler(ctx(outsider), { joinCode: "ZZZZ9999" })).toMatchObject({
      ok: false,
      code: "NOT_FOUND",
    });

    unwrap(await archiveCourseHandler(ctx(alice), { courseId: courseA }));
    expect(await joinCourseHandler(ctx(outsider), { joinCode: joinCodeA })).toMatchObject({
      ok: false,
      code: "NOT_FOUND",
    });
  });
});

describe("cross-course access", () => {
  it("an instructor cannot manage another instructor's course", async () => {
    const { alice, courseB } = await setup();
    const attempts = [
      updateCourseHandler(ctx(alice), { courseId: courseB, name: "Hijacked", description: "" }),
      archiveCourseHandler(ctx(alice), { courseId: courseB }),
      regenerateJoinCodeHandler(ctx(alice), { courseId: courseB }),
      setCourseAiHandler(ctx(alice), { courseId: courseB, aiEnabled: false }),
      addTaHandler(ctx(alice), { courseId: courseB, email: "tara@example.com" }),
    ];
    for (const result of await Promise.all(attempts)) {
      // Non-members learn nothing about the course: same answer as a missing course.
      expect(result).toMatchObject({ ok: false, code: "NOT_FOUND" });
    }
    const [b] = await db.select().from(course).where(eq(course.id, courseB));
    expect(b).toMatchObject({ name: "Course B", archivedAt: null, aiEnabled: true });
  });

  it("an instructor cannot remove a member of another course by member id", async () => {
    const { alice, bob, courseB } = await setup();
    const [bobMembership] = await db
      .select()
      .from(courseMember)
      .where(and(eq(courseMember.courseId, courseB), eq(courseMember.userId, bob.id)));
    const result = await removeMemberHandler(ctx(alice), { memberId: bobMembership!.id });
    expect(result).toMatchObject({ ok: false, code: "NOT_FOUND" });
  });

  it("a missing course and a course you are not in look the same", async () => {
    const { outsider, courseA } = await setup();
    const missing = await archiveCourseHandler(ctx(outsider), {
      courseId: "00000000-0000-4000-8000-000000000000",
    });
    const foreign = await archiveCourseHandler(ctx(outsider), { courseId: courseA });
    expect(missing).toEqual(foreign);
  });

  it("the dashboard lists only the user's own courses", async () => {
    const { alice, sam, courseA } = await setup();
    const alicePage = await listMyCourses(
      db,
      alice.id,
      { archived: false },
      { page: 1, pageSize: 20 },
    );
    expect(alicePage.items.map((c) => c.id)).toEqual([courseA]);
    expect(alicePage.items[0]).toMatchObject({ role: "INSTRUCTOR", memberCount: 3 });

    const samPage = await listMyCourses(db, sam.id, { archived: false }, { page: 1, pageSize: 20 });
    expect(samPage.items.map((c) => c.id)).toEqual([courseA]);
    expect(samPage.items[0]!.role).toBe("STUDENT");
  });
});

describe("roles inside a course", () => {
  it("TAs and students cannot manage the course or its members", async () => {
    const { tara, sam, courseA } = await setup();
    for (const member of [tara, sam]) {
      const results = await Promise.all([
        updateCourseHandler(ctx(member), { courseId: courseA, name: "X", description: "" }),
        archiveCourseHandler(ctx(member), { courseId: courseA }),
        regenerateJoinCodeHandler(ctx(member), { courseId: courseA }),
        setCourseAiHandler(ctx(member), { courseId: courseA, aiEnabled: false }),
        addTaHandler(ctx(member), { courseId: courseA, email: "olivia@example.com" }),
      ]);
      for (const result of results) {
        expect(result).toMatchObject({ ok: false, code: "FORBIDDEN" });
      }
    }
  });

  it("the instructor updates details, toggles AI and regenerates the join code (audited)", async () => {
    const { alice, courseA, joinCodeA } = await setup();
    unwrap(
      await updateCourseHandler(ctx(alice), {
        courseId: courseA,
        name: "Renamed",
        description: "",
      }),
    );
    unwrap(await setCourseAiHandler(ctx(alice), { courseId: courseA, aiEnabled: false }));
    const { joinCode } = unwrap(await regenerateJoinCodeHandler(ctx(alice), { courseId: courseA }));

    const [a] = await db.select().from(course).where(eq(course.id, courseA));
    expect(a).toMatchObject({ name: "Renamed", description: null, aiEnabled: false, joinCode });
    expect(joinCode).not.toBe(joinCodeA);

    const actions = (await db.select().from(auditLog).where(eq(auditLog.courseId, courseA))).map(
      (r) => r.action,
    );
    expect(actions).toEqual(
      expect.arrayContaining([
        "course.ai_toggled",
        "course.join_code_regenerated",
        "course.ta_added",
      ]),
    );
  });
});

describe("members", () => {
  it("adds a TA only if they already have an account and are not a member", async () => {
    const { alice, sam, courseA } = await setup();
    expect(
      await addTaHandler(ctx(alice), { courseId: courseA, email: "nobody@example.com" }),
    ).toMatchObject({ ok: false, code: "NOT_FOUND", fieldErrors: { email: expect.any(Array) } });
    expect(await addTaHandler(ctx(alice), { courseId: courseA, email: sam.email })).toMatchObject({
      ok: false,
      code: "CONFLICT",
    });
  });

  it("normalises the TA email before looking it up", async () => {
    const { alice, outsider, courseA } = await setup();
    unwrap(await addTaHandler(ctx(alice), { courseId: courseA, email: "  OLIVIA@Example.com " }));
    expect((await getCourseAccess(db, courseA, outsider.id))?.member?.role).toBe("TA");
  });

  it("removes TAs and students but never the instructor", async () => {
    const { alice, tara, sam, courseA } = await setup();
    const members = await listMembers(db, courseA, { page: 1, pageSize: 50 });
    expect(members.items.map((m) => m.role)).toEqual(["INSTRUCTOR", "TA", "STUDENT"]);
    const byUser = new Map(members.items.map((m) => [m.userId, m.id]));

    unwrap(await removeMemberHandler(ctx(alice), { memberId: byUser.get(tara.id)! }));
    unwrap(await removeMemberHandler(ctx(alice), { memberId: byUser.get(sam.id)! }));
    expect(
      await removeMemberHandler(ctx(alice), { memberId: byUser.get(alice.id)! }),
    ).toMatchObject({ ok: false, code: "CONFLICT" });

    expect((await getCourseAccess(db, courseA, sam.id))?.member).toBeNull();
    expect((await getCourseAccess(db, courseA, alice.id))?.member?.role).toBe("INSTRUCTOR");
  });

  it("a removed TA loses access immediately", async () => {
    const { alice, tara, courseA } = await setup();
    const members = await listMembers(db, courseA, { page: 1, pageSize: 50 });
    const taMember = members.items.find((m) => m.userId === tara.id)!;
    unwrap(await removeMemberHandler(ctx(alice), { memberId: taMember.id }));
    expect(
      await addTaHandler(ctx(tara), { courseId: courseA, email: "x@example.com" }),
    ).toMatchObject({
      ok: false,
      code: "NOT_FOUND",
    });
  });

  it("paginates the member list", async () => {
    const { alice, courseA } = await setup();
    const first = await listMembers(db, courseA, { page: 1, pageSize: 2 });
    const second = await listMembers(db, courseA, { page: 2, pageSize: 2 });
    expect(first).toMatchObject({ page: 1, hasMore: true });
    expect(first.items).toHaveLength(2);
    expect(second).toMatchObject({ page: 2, hasMore: false });
    expect(second.items).toHaveLength(1);
    expect(first.items[0]!.userId).toBe(alice.id);
  });
});

describe("archiving", () => {
  it("archives once, moves the course to the archived tab and makes it read-only", async () => {
    const { alice, sam, courseA } = await setup();
    unwrap(await archiveCourseHandler(ctx(alice), { courseId: courseA }));

    const [a] = await db.select().from(course).where(eq(course.id, courseA));
    expect(a!.archivedAt).toEqual(NOW);

    const active = await listMyCourses(db, sam.id, { archived: false }, { page: 1, pageSize: 20 });
    const archived = await listMyCourses(db, sam.id, { archived: true }, { page: 1, pageSize: 20 });
    expect(active.items).toHaveLength(0);
    expect(archived.items.map((c) => c.id)).toEqual([courseA]);

    // Read-only: even the instructor can no longer change it.
    expect(
      await setCourseAiHandler(ctx(alice), { courseId: courseA, aiEnabled: false }),
    ).toMatchObject({ ok: false, code: "FORBIDDEN" });
    expect(await archiveCourseHandler(ctx(alice), { courseId: courseA })).toMatchObject({
      ok: false,
      code: "FORBIDDEN",
    });
  });
});
