import { eq } from "drizzle-orm";
import { afterAll, beforeEach, describe, expect, it } from "vitest";

import type { Result } from "@/lib/result";
import {
  closeAssignmentHandler,
  createAssignmentHandler,
  publishAssignmentHandler,
  saveRubricHandler,
} from "@/server/actions/assignment.handlers";
import {
  addTaHandler,
  archiveCourseHandler,
  createCourseHandler,
  joinCourseHandler,
} from "@/server/actions/course.handlers";
import type { ActionContext } from "@/server/actions/handler";
import {
  deleteDraftHandler,
  saveDraftHandler,
  submitHandler,
} from "@/server/actions/submission.handlers";
import { course, grade, submission } from "@/server/db/schema";
import {
  countSubmissions,
  getOwnSubmissionStatuses,
  saveDraft,
  submitSubmission,
} from "@/server/services/submission.service";

import { createUser } from "../fixtures/factories";
import { createTestDb, truncateAll } from "./helpers/test-db";

const { db, pool } = createTestDb();
const NOW = new Date("2026-09-26T12:00:00Z");
const HOUR = 60 * 60 * 1000;
const DUE = new Date(NOW.getTime() + 24 * HOUR);
const BEFORE_DUE = new Date(DUE.getTime() - HOUR);
const AFTER_DUE = new Date(DUE.getTime() + HOUR);

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
    description: "",
    levels: [
      { label: "Weak", points: 0, descriptor: "" },
      { label: "Strong", points: 10, descriptor: "" },
    ],
  },
];

async function publishedAssignment(
  instructor: TestUser,
  courseId: string,
  { allowLate = false, title = "Essay" } = {},
) {
  const { assignmentId } = unwrap(
    await createAssignmentHandler(ctx(instructor), {
      courseId,
      title,
      instructions: "",
      dueAt: DUE.toISOString(),
      allowLate,
    }),
  );
  unwrap(await saveRubricHandler(ctx(instructor), { assignmentId, criteria: rubric }));
  unwrap(await publishAssignmentHandler(ctx(instructor), { assignmentId }));
  return assignmentId;
}

async function setup() {
  const alice = await newUser("Alice"); // instructor
  const tara = await newUser("Tara"); // TA
  const sam = await newUser("Sam"); // student
  const sue = await newUser("Sue"); // another student
  const olivia = await newUser("Olivia"); // not in the course

  const { courseId } = unwrap(
    await createCourseHandler(ctx(alice), { name: "Course A", description: "" }),
  );
  unwrap(await addTaHandler(ctx(alice), { courseId, email: tara.email }));
  const [a] = await db.select().from(course).where(eq(course.id, courseId));
  for (const s of [sam, sue]) unwrap(await joinCourseHandler(ctx(s), { joinCode: a!.joinCode }));

  const assignmentId = await publishedAssignment(alice, courseId);
  return { alice, tara, sam, sue, olivia, courseId, assignmentId };
}

const rowFor = async (assignmentId: string, studentId: string) =>
  (await db.select().from(submission).where(eq(submission.assignmentId, assignmentId))).find(
    (s) => s.studentId === studentId,
  );

beforeEach(() => truncateAll(db));
afterAll(() => pool.end());

describe("drafts (autosave)", () => {
  it("creates then updates the student's own draft with a server-side word count", async () => {
    const { sam, assignmentId } = await setup();
    const first = unwrap(
      await saveDraftHandler(ctx(sam), { assignmentId, content: "  Remote learning  " }),
    );
    expect(first.submission).toMatchObject({
      status: "DRAFT",
      content: "Remote learning",
      wordCount: 2,
    });

    const later = new Date(NOW.getTime() + 60_000);
    const second = unwrap(
      await saveDraftHandler(ctx(sam, later), {
        assignmentId,
        content: "Remote learning works well",
      }),
    );
    expect(second.submission).toMatchObject({ id: first.submission.id, wordCount: 4 });
    expect(second.submission.updatedAt).toEqual(later);
    expect(await db.select().from(submission)).toHaveLength(1);
  });

  it("ignores a client-sent word count or status", async () => {
    const { sam, assignmentId } = await setup();
    expect(
      await saveDraftHandler(ctx(sam), { assignmentId, content: "x", wordCount: 9999 }),
    ).toMatchObject({ ok: false, code: "VALIDATION" });
    expect(
      await submitHandler(ctx(sam), { assignmentId, content: "x", isLate: false }),
    ).toMatchObject({ ok: false, code: "VALIDATION" });
  });

  it("rejects content over 20,000 characters", async () => {
    const { sam, assignmentId } = await setup();
    const result = await saveDraftHandler(ctx(sam), { assignmentId, content: "a".repeat(20_001) });
    expect(result).toMatchObject({
      ok: false,
      code: "VALIDATION",
      fieldErrors: { content: expect.any(Array) },
    });
  });

  it("autosave cannot overwrite a submitted piece", async () => {
    const { sam, assignmentId } = await setup();
    unwrap(await submitHandler(ctx(sam), { assignmentId, content: "Final answer" }));
    expect(await saveDraftHandler(ctx(sam), { assignmentId, content: "oops" })).toMatchObject({
      ok: false,
      code: "CONFLICT",
    });
    expect((await rowFor(assignmentId, sam.id))?.content).toBe("Final answer");
  });
});

describe("submitting", () => {
  it("submits on time, then resubmits before the deadline", async () => {
    const { sam, assignmentId } = await setup();
    unwrap(await saveDraftHandler(ctx(sam), { assignmentId, content: "Draft" }));
    const submitted = unwrap(
      await submitHandler(ctx(sam, BEFORE_DUE), { assignmentId, content: "My essay" }),
    );
    expect(submitted.submission).toMatchObject({
      status: "SUBMITTED",
      submittedAt: BEFORE_DUE,
      isLate: false,
      wordCount: 2,
    });

    const resubmitted = unwrap(
      await submitHandler(ctx(sam, DUE), { assignmentId, content: "My better essay" }),
    );
    // Exactly at the deadline still counts as on time.
    expect(resubmitted.submission).toMatchObject({ submittedAt: DUE, isLate: false, wordCount: 3 });
  });

  it("requires some text", async () => {
    const { sam, assignmentId } = await setup();
    expect(await submitHandler(ctx(sam), { assignmentId, content: "   " })).toMatchObject({
      ok: false,
      code: "VALIDATION",
      fieldErrors: { content: ["Write something before submitting"] },
    });
  });

  it("refuses after the deadline unless late work is allowed, and then flags it late", async () => {
    const { alice, sam, courseId, assignmentId } = await setup();
    expect(
      await submitHandler(ctx(sam, AFTER_DUE), { assignmentId, content: "Late" }),
    ).toMatchObject({ ok: false, code: "CONFLICT", message: expect.stringContaining("deadline") });
    expect(
      await saveDraftHandler(ctx(sam, AFTER_DUE), { assignmentId, content: "Late" }),
    ).toMatchObject({ ok: false, code: "CONFLICT" });

    const lateOk = await publishedAssignment(alice, courseId, {
      allowLate: true,
      title: "Late OK",
    });
    const late = unwrap(
      await submitHandler(ctx(sam, AFTER_DUE), { assignmentId: lateOk, content: "Late" }),
    );
    expect(late.submission).toMatchObject({ isLate: true, submittedAt: AFTER_DUE });
  });

  it("refuses once the assignment is closed, even with late work allowed", async () => {
    const { alice, sam, courseId } = await setup();
    const assignmentId = await publishedAssignment(alice, courseId, {
      allowLate: true,
      title: "C",
    });
    unwrap(await closeAssignmentHandler(ctx(alice), { assignmentId }));
    expect(await submitHandler(ctx(sam), { assignmentId, content: "Hi" })).toMatchObject({
      ok: false,
      code: "CONFLICT",
      message: expect.stringContaining("closed"),
    });
  });

  it("the service re-checks the deadline even if called directly", async () => {
    const { sam, assignmentId } = await setup();
    const input = { assignmentId, studentId: sam.id, content: "x", now: AFTER_DUE };
    await expect(submitSubmission(db, input)).rejects.toMatchObject({ code: "CONFLICT" });
    await expect(saveDraft(db, input)).rejects.toMatchObject({ code: "CONFLICT" });
  });

  it("cannot change once grading has started", async () => {
    const { sam, assignmentId } = await setup();
    const { submission: s } = unwrap(
      await submitHandler(ctx(sam), { assignmentId, content: "Essay" }),
    );
    await db.insert(grade).values({ submissionId: s.id });
    expect(await submitHandler(ctx(sam), { assignmentId, content: "Edited" })).toMatchObject({
      ok: false,
      code: "CONFLICT",
    });
    expect((await rowFor(assignmentId, sam.id))?.content).toBe("Essay");
  });
});

describe("who can write", () => {
  it("staff cannot write submissions; outsiders and archived courses are refused", async () => {
    const { alice, tara, olivia, sam, courseId, assignmentId } = await setup();
    for (const who of [alice, tara]) {
      expect(await submitHandler(ctx(who), { assignmentId, content: "x" })).toMatchObject({
        ok: false,
        code: "FORBIDDEN",
      });
    }
    expect(await saveDraftHandler(ctx(olivia), { assignmentId, content: "x" })).toMatchObject({
      ok: false,
      code: "NOT_FOUND",
    });

    unwrap(await archiveCourseHandler(ctx(alice), { courseId }));
    expect(await saveDraftHandler(ctx(sam), { assignmentId, content: "x" })).toMatchObject({
      ok: false,
      code: "FORBIDDEN",
    });
  });

  it("students cannot submit to a draft assignment (it is not found)", async () => {
    const { alice, sam, courseId } = await setup();
    const { assignmentId } = unwrap(
      await createAssignmentHandler(ctx(alice), {
        courseId,
        title: "Hidden",
        instructions: "",
        dueAt: DUE.toISOString(),
        allowLate: false,
      }),
    );
    expect(await saveDraftHandler(ctx(sam), { assignmentId, content: "x" })).toMatchObject({
      ok: false,
      code: "NOT_FOUND",
    });
  });
});

describe("deleting a draft", () => {
  it("the owner deletes their unsubmitted draft", async () => {
    const { sam, assignmentId } = await setup();
    const { submission: s } = unwrap(
      await saveDraftHandler(ctx(sam), { assignmentId, content: "x" }),
    );
    unwrap(await deleteDraftHandler(ctx(sam), { submissionId: s.id }));
    expect(await db.select().from(submission)).toHaveLength(0);
  });

  it("nobody else can, and a submitted piece cannot be deleted", async () => {
    const { alice, sue, sam, assignmentId } = await setup();
    const { submission: s } = unwrap(
      await saveDraftHandler(ctx(sam), { assignmentId, content: "x" }),
    );
    // Another student: not found. The instructor: forbidden.
    expect(await deleteDraftHandler(ctx(sue), { submissionId: s.id })).toMatchObject({
      code: "NOT_FOUND",
    });
    expect(await deleteDraftHandler(ctx(alice), { submissionId: s.id })).toMatchObject({
      code: "FORBIDDEN",
    });

    unwrap(await submitHandler(ctx(sam), { assignmentId, content: "Final" }));
    expect(await deleteDraftHandler(ctx(sam), { submissionId: s.id })).toMatchObject({
      code: "FORBIDDEN",
    });
    expect(await db.select().from(submission)).toHaveLength(1);
  });
});

describe("list statuses", () => {
  it("returns each student's own status and staff counts in single queries", async () => {
    const { alice, sam, sue, courseId, assignmentId } = await setup();
    const lateOk = await publishedAssignment(alice, courseId, { allowLate: true, title: "B" });
    unwrap(await submitHandler(ctx(sam), { assignmentId, content: "On time" }));
    unwrap(await saveDraftHandler(ctx(sue), { assignmentId, content: "Draft" }));
    unwrap(await submitHandler(ctx(sam, AFTER_DUE), { assignmentId: lateOk, content: "Late" }));

    const own = await getOwnSubmissionStatuses(db, sam.id, [assignmentId, lateOk]);
    expect(own.get(assignmentId)).toEqual({ status: "SUBMITTED", isLate: false, released: false });
    expect(own.get(lateOk)).toEqual({ status: "SUBMITTED", isLate: true, released: false });
    expect((await getOwnSubmissionStatuses(db, sue.id, [lateOk])).size).toBe(0);

    const counts = await countSubmissions(db, [assignmentId, lateOk]);
    expect(counts.get(assignmentId)).toEqual({ submitted: 1, late: 0, drafts: 1 });
    expect(counts.get(lateOk)).toEqual({ submitted: 1, late: 1, drafts: 0 });
  });
});
