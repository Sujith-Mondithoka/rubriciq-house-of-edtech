import { eq } from "drizzle-orm";
import { afterAll, beforeEach, describe, expect, it } from "vitest";

import type { Result } from "@/lib/result";
import {
  createAssignmentHandler,
  publishAssignmentHandler,
  saveRubricHandler,
} from "@/server/actions/assignment.handlers";
import {
  addTaHandler,
  createCourseHandler,
  joinCourseHandler,
} from "@/server/actions/course.handlers";
import { releaseGradesHandler, saveGradeHandler } from "@/server/actions/grade.handlers";
import type { ActionContext } from "@/server/actions/handler";
import { createRegradeHandler, resolveRegradeHandler } from "@/server/actions/regrade.handlers";
import { submitHandler } from "@/server/actions/submission.handlers";
import { auditLog, course, regradeRequest } from "@/server/db/schema";
import { getRubric } from "@/server/services/assignment.service";
import { getGradeForStaff, getReleasedGrade } from "@/server/services/grade.service";
import {
  countRegrades,
  getGradeHistory,
  getRegradeForSubmission,
  listRegrades,
} from "@/server/services/regrade.service";

import { createUser } from "../fixtures/factories";
import { createTestDb, truncateAll } from "./helpers/test-db";

const { db, pool } = createTestDb();
const NOW = new Date("2026-09-26T12:00:00Z");
const DAY = 24 * 60 * 60 * 1000;

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
  {
    title: "Style",
    description: "",
    levels: [
      { label: "Rough", points: 1, descriptor: "" },
      { label: "Polished", points: 5, descriptor: "" },
    ],
  },
];

/** Sam's grade (Weak 0 + Polished 5 = 5) is released at NOW; Sue's stays a draft. */
async function setup() {
  const alice = await newUser("Alice");
  const tara = await newUser("Tara");
  const sam = await newUser("Sam");
  const sue = await newUser("Sue");
  const bob = await newUser("Bob");
  const { courseId } = unwrap(
    await createCourseHandler(ctx(alice), { name: "A", description: "" }),
  );
  unwrap(await addTaHandler(ctx(alice), { courseId, email: tara.email }));
  const [c] = await db.select().from(course).where(eq(course.id, courseId));
  for (const s of [sam, sue]) unwrap(await joinCourseHandler(ctx(s), { joinCode: c!.joinCode }));
  const { assignmentId } = unwrap(
    await createAssignmentHandler(ctx(alice), {
      courseId,
      title: "Essay",
      instructions: "",
      dueAt: new Date(NOW.getTime() + DAY).toISOString(),
      allowLate: false,
    }),
  );
  unwrap(await saveRubricHandler(ctx(alice), { assignmentId, criteria: rubric }));
  unwrap(await publishAssignmentHandler(ctx(alice), { assignmentId }));
  const [thesis, style] = await getRubric(db, assignmentId);
  const level = (c: typeof thesis, points: number) =>
    c!.levels.find((l) => l.points === points)!.id;

  const samSub = unwrap(await submitHandler(ctx(sam), { assignmentId, content: "Sam" })).submission;
  const sueSub = unwrap(await submitHandler(ctx(sue), { assignmentId, content: "Sue" })).submission;
  const scores = [
    { criterionId: thesis!.id, levelId: level(thesis, 0), feedback: "No claim" },
    { criterionId: style!.id, levelId: level(style, 5), feedback: "" },
  ];
  const saved = unwrap(
    await saveGradeHandler(ctx(tara), {
      submissionId: samSub.id,
      version: 0,
      overallFeedback: "",
      scores,
    }),
  );
  unwrap(
    await releaseGradesHandler(ctx(alice), {
      assignmentId,
      grades: [{ submissionId: samSub.id, version: saved.version }],
    }),
  );
  unwrap(
    await saveGradeHandler(ctx(tara), {
      submissionId: sueSub.id,
      version: 0,
      overallFeedback: "",
      scores,
    }),
  );
  return {
    alice,
    tara,
    sam,
    sue,
    bob,
    courseId,
    assignmentId,
    samSub,
    sueSub,
    thesis: thesis!,
    style: style!,
    level,
  };
}

type Setup = Awaited<ReturnType<typeof setup>>;

const request = (s: Setup, now = NOW) =>
  createRegradeHandler(ctx(s.sam, now), {
    submissionId: s.samSub.id,
    criterionId: s.thesis.id,
    reason: "My first paragraph states a clear claim.",
  });

beforeEach(() => truncateAll(db));
afterAll(() => pool.end());

describe("raising a regrade", () => {
  it("the student asks once, within 7 days, and it is audited", async () => {
    const s = await setup();
    unwrap(await request(s, new Date(NOW.getTime() + 7 * DAY)));
    expect(await getRegradeForSubmission(db, s.samSub.id)).toMatchObject({
      status: "OPEN",
      criterionId: s.thesis.id,
    });
    expect(await request(s)).toMatchObject({ ok: false, code: "FORBIDDEN" });
    expect(await db.select().from(regradeRequest)).toHaveLength(1);
    expect(
      await db.select().from(auditLog).where(eq(auditLog.action, "regrade.requested")),
    ).toHaveLength(1);
  });

  it("closes after 7 days", async () => {
    const s = await setup();
    expect(await request(s, new Date(NOW.getTime() + 7 * DAY + 1000))).toMatchObject({
      code: "FORBIDDEN",
    });
  });

  it("is impossible on an unreleased grade, for other students, and for staff", async () => {
    const s = await setup();
    const reason = "Please look at this again.";
    expect(
      await createRegradeHandler(ctx(s.sue), {
        submissionId: s.sueSub.id,
        criterionId: null,
        reason,
      }),
    ).toMatchObject({ code: "NOT_FOUND" });
    expect(
      await createRegradeHandler(ctx(s.sue), {
        submissionId: s.samSub.id,
        criterionId: null,
        reason,
      }),
    ).toMatchObject({ code: "NOT_FOUND" });
    expect(
      await createRegradeHandler(ctx(s.alice), {
        submissionId: s.samSub.id,
        criterionId: null,
        reason,
      }),
    ).toMatchObject({ code: "FORBIDDEN" });
    expect(
      await createRegradeHandler(ctx(s.bob), {
        submissionId: s.samSub.id,
        criterionId: null,
        reason,
      }),
    ).toMatchObject({ code: "NOT_FOUND" });
    expect(await db.select().from(regradeRequest)).toHaveLength(0);
  });

  it("rejects a criterion from another rubric", async () => {
    const s = await setup();
    const result = await createRegradeHandler(ctx(s.sam), {
      submissionId: s.samSub.id,
      criterionId: "00000000-0000-4000-8000-000000000000",
      reason: "Look at this criterion.",
    });
    expect(result).toMatchObject({ ok: false, code: "VALIDATION" });
  });
});

describe("resolving a regrade", () => {
  it("accepting changes the released grade, bumps the version and audits both steps", async () => {
    const s = await setup();
    const { regradeId } = unwrap(await request(s));
    const before = (await getGradeForStaff(db, s.samSub.id))!;
    const result = unwrap(
      await resolveRegradeHandler(ctx(s.alice), {
        regradeId,
        decision: "ACCEPTED",
        response: "You are right: the claim is clear.",
        version: before.version,
        changes: [{ criterionId: s.thesis.id, levelId: s.level(s.thesis, 10) }],
      }),
    );
    expect(result).toMatchObject({ status: "ACCEPTED", totalScore: 15 });

    const visible = await getReleasedGrade(db, s.samSub.id);
    expect(visible!.totalScore).toBe(15);
    // Feedback on the changed criterion is kept.
    expect(visible!.scores.find((sc) => sc.criterionId === s.thesis.id)).toMatchObject({
      points: 10,
      feedback: "No claim",
    });
    const after = (await getGradeForStaff(db, s.samSub.id))!;
    expect(after).toMatchObject({ status: "RELEASED", version: before.version + 1 });
    expect(await getRegradeForSubmission(db, s.samSub.id)).toMatchObject({
      status: "ACCEPTED",
      response: "You are right: the claim is clear.",
    });

    const history = await getGradeHistory(db, after.id, regradeId);
    expect(history.map((h) => h.action)).toEqual(
      expect.arrayContaining([
        "grade.regraded",
        "regrade.resolved",
        "regrade.requested",
        "grade.released",
      ]),
    );
    const regraded = history.find((h) => h.action === "grade.regraded")!;
    expect(regraded.metadata).toMatchObject({ totalBefore: 5, totalAfter: 15 });
  });

  it("rejecting keeps the grade and records the response", async () => {
    const s = await setup();
    const { regradeId } = unwrap(await request(s));
    const g = (await getGradeForStaff(db, s.samSub.id))!;
    unwrap(
      await resolveRegradeHandler(ctx(s.alice), {
        regradeId,
        decision: "REJECTED",
        response: "The claim is implied, not stated.",
        version: g.version,
        changes: [],
      }),
    );
    expect(await getGradeForStaff(db, s.samSub.id)).toMatchObject({
      totalScore: 5,
      version: g.version,
    });
    expect(await getRegradeForSubmission(db, s.samSub.id)).toMatchObject({ status: "REJECTED" });
  });

  it("a TA cannot resolve; nobody resolves twice; a stale version conflicts", async () => {
    const s = await setup();
    const { regradeId } = unwrap(await request(s));
    const g = (await getGradeForStaff(db, s.samSub.id))!;
    const reject = { regradeId, decision: "REJECTED" as const, response: "No.", changes: [] };
    expect(
      await resolveRegradeHandler(ctx(s.tara), { ...reject, version: g.version }),
    ).toMatchObject({
      code: "FORBIDDEN",
    });
    expect(
      await resolveRegradeHandler(ctx(s.sam), { ...reject, version: g.version }),
    ).toMatchObject({
      code: "NOT_FOUND",
    });
    expect(
      await resolveRegradeHandler(ctx(s.bob), { ...reject, version: g.version }),
    ).toMatchObject({
      code: "NOT_FOUND",
    });
    expect(
      await resolveRegradeHandler(ctx(s.alice), { ...reject, version: g.version + 1 }),
    ).toMatchObject({ code: "CONFLICT" });
    unwrap(await resolveRegradeHandler(ctx(s.alice), { ...reject, version: g.version }));
    expect(
      await resolveRegradeHandler(ctx(s.alice), { ...reject, version: g.version }),
    ).toMatchObject({
      code: "FORBIDDEN",
    });
  });

  it("refuses foreign levels and an 'accept' that changes nothing", async () => {
    const s = await setup();
    const { regradeId } = unwrap(await request(s));
    const g = (await getGradeForStaff(db, s.samSub.id))!;
    const accept = { regradeId, decision: "ACCEPTED" as const, response: "Ok", version: g.version };
    expect(
      await resolveRegradeHandler(ctx(s.alice), {
        ...accept,
        changes: [{ criterionId: s.thesis.id, levelId: s.level(s.style, 5) }],
      }),
    ).toMatchObject({ code: "VALIDATION" });
    expect(
      await resolveRegradeHandler(ctx(s.alice), {
        ...accept,
        changes: [{ criterionId: s.thesis.id, levelId: s.level(s.thesis, 0) }],
      }),
    ).toMatchObject({ code: "VALIDATION" });
    expect(await getRegradeForSubmission(db, s.samSub.id)).toMatchObject({ status: "OPEN" });
  });
});

describe("regrade queue", () => {
  it("lists open and resolved requests with counts", async () => {
    const s = await setup();
    const { regradeId } = unwrap(await request(s));
    let open = await listRegrades(db, s.assignmentId, "OPEN", { page: 1, pageSize: 50 });
    expect(open.items).toEqual([
      expect.objectContaining({ id: regradeId, studentName: "Sam", criterionTitle: "Thesis" }),
    ]);
    expect(await countRegrades(db, s.assignmentId)).toEqual({ OPEN: 1, RESOLVED: 0 });

    const g = (await getGradeForStaff(db, s.samSub.id))!;
    unwrap(
      await resolveRegradeHandler(ctx(s.alice), {
        regradeId,
        decision: "REJECTED",
        response: "Kept.",
        version: g.version,
        changes: [],
      }),
    );
    open = await listRegrades(db, s.assignmentId, "OPEN", { page: 1, pageSize: 50 });
    expect(open.items).toHaveLength(0);
    expect(
      (await listRegrades(db, s.assignmentId, "RESOLVED", { page: 1, pageSize: 50 })).items,
    ).toHaveLength(1);
    expect(await countRegrades(db, s.assignmentId)).toEqual({ OPEN: 0, RESOLVED: 1 });
  });
});
