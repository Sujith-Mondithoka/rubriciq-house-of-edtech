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
  archiveCourseHandler,
  createCourseHandler,
  joinCourseHandler,
} from "@/server/actions/course.handlers";
import { releaseGradesHandler, saveGradeHandler } from "@/server/actions/grade.handlers";
import type { ActionContext } from "@/server/actions/handler";
import { saveDraftHandler, submitHandler } from "@/server/actions/submission.handlers";
import { auditLog, course, criterionScore, grade } from "@/server/db/schema";
import { getRubric } from "@/server/services/assignment.service";
import {
  countGradingQueue,
  getReleasedGrade,
  listGradingQueue,
  listReleasable,
  saveGrade,
} from "@/server/services/grade.service";
import { getOwnSubmissionStatuses } from "@/server/services/submission.service";

import { createUser } from "../fixtures/factories";
import { createTestDb, truncateAll } from "./helpers/test-db";

const { db, pool } = createTestDb();
const NOW = new Date("2026-09-26T12:00:00Z");
const DUE = new Date(NOW.getTime() + 24 * 60 * 60 * 1000);

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

async function courseWithAssignment(instructor: TestUser, name: string) {
  const { courseId } = unwrap(
    await createCourseHandler(ctx(instructor), { name, description: "" }),
  );
  const { assignmentId } = unwrap(
    await createAssignmentHandler(ctx(instructor), {
      courseId,
      title: "Essay",
      instructions: "",
      dueAt: DUE.toISOString(),
      allowLate: false,
    }),
  );
  unwrap(await saveRubricHandler(ctx(instructor), { assignmentId, criteria: rubric }));
  unwrap(await publishAssignmentHandler(ctx(instructor), { assignmentId }));
  const [c] = await db.select().from(course).where(eq(course.id, courseId));
  const [thesis, style] = await getRubric(db, assignmentId);
  return { courseId, assignmentId, joinCode: c!.joinCode, thesis: thesis!, style: style! };
}

async function setup() {
  const alice = await newUser("Alice"); // instructor
  const tara = await newUser("Tara"); // TA
  const sam = await newUser("Sam"); // student, submits
  const sue = await newUser("Sue"); // student, submits
  const nina = await newUser("Nina"); // student, only a draft
  const olivia = await newUser("Olivia"); // not in the course
  const bob = await newUser("Bob"); // instructor of another course

  const a = await courseWithAssignment(alice, "Course A");
  unwrap(await addTaHandler(ctx(alice), { courseId: a.courseId, email: tara.email }));
  for (const s of [sam, sue, nina])
    unwrap(await joinCourseHandler(ctx(s), { joinCode: a.joinCode }));

  const samSub = unwrap(
    await submitHandler(ctx(sam), { assignmentId: a.assignmentId, content: "Sam essay" }),
  ).submission;
  const sueSub = unwrap(
    await submitHandler(ctx(sue), { assignmentId: a.assignmentId, content: "Sue essay" }),
  ).submission;
  const ninaDraft = unwrap(
    await saveDraftHandler(ctx(nina), { assignmentId: a.assignmentId, content: "Nina draft" }),
  ).submission;

  const b = await courseWithAssignment(bob, "Course B");
  return { alice, tara, sam, sue, nina, olivia, bob, a, b, samSub, sueSub, ninaDraft };
}

type Setup = Awaited<ReturnType<typeof setup>>;

/** A complete grade: Strong (10) + Polished (5). */
function fullScores({ a }: Setup) {
  return [
    {
      criterionId: a.thesis.id,
      levelId: a.thesis.levels.find((l) => l.points === 10)!.id,
      feedback: "Clear",
    },
    {
      criterionId: a.style.id,
      levelId: a.style.levels.find((l) => l.points === 5)!.id,
      feedback: "",
    },
  ];
}

beforeEach(() => truncateAll(db));
afterAll(() => pool.end());

describe("saving a grade", () => {
  it("a TA creates a draft; points and total come from the rubric; it is audited", async () => {
    const s = await setup();
    const saved = unwrap(
      await saveGradeHandler(ctx(s.tara), {
        submissionId: s.samSub.id,
        version: 0,
        overallFeedback: "Good start",
        scores: fullScores(s),
      }),
    );
    expect(saved).toMatchObject({ version: 1, totalScore: 15, status: "DRAFT" });

    const rows = await db.select().from(criterionScore);
    expect(rows.map((r) => r.points).sort()).toEqual([10, 5].sort());
    expect(rows.every((r) => r.source === "HUMAN")).toBe(true);
    const [g] = await db.select().from(grade);
    expect(g).toMatchObject({ gradedBy: s.tara.id, totalScore: 15, overallFeedback: "Good start" });
    const audit = await db.select().from(auditLog).where(eq(auditLog.action, "grade.saved"));
    expect(audit).toHaveLength(1);
    expect(audit[0]).toMatchObject({ actorId: s.tara.id, courseId: s.a.courseId });
  });

  it("updates with the right version, clears a level, and rejects a stale version", async () => {
    const s = await setup();
    const first = unwrap(
      await saveGradeHandler(ctx(s.alice), {
        submissionId: s.samSub.id,
        version: 0,
        overallFeedback: "",
        scores: fullScores(s),
      }),
    );
    const [thesis, style] = fullScores(s);
    const second = unwrap(
      await saveGradeHandler(ctx(s.tara), {
        submissionId: s.samSub.id,
        version: first.version,
        overallFeedback: "",
        scores: [thesis!, { ...style!, levelId: null }],
      }),
    );
    expect(second).toMatchObject({ version: 2, totalScore: 10 });
    expect(await db.select().from(criterionScore)).toHaveLength(1);

    // Alice still has version 1 open: her save must not overwrite Tara's.
    const stale = await saveGradeHandler(ctx(s.alice), {
      submissionId: s.samSub.id,
      version: 1,
      overallFeedback: "overwrite",
      scores: fullScores(s),
    });
    expect(stale).toMatchObject({ ok: false, code: "CONFLICT" });
    const [g] = await db.select().from(grade);
    expect(g).toMatchObject({ version: 2, totalScore: 10, overallFeedback: "" });
  });

  it("a second first-save (version 0) conflicts instead of creating a duplicate", async () => {
    const s = await setup();
    const input = { submissionId: s.samSub.id, version: 0, overallFeedback: "", scores: [] };
    unwrap(await saveGradeHandler(ctx(s.alice), input));
    expect(await saveGradeHandler(ctx(s.tara), input)).toMatchObject({ code: "CONFLICT" });
    expect(await db.select().from(grade)).toHaveLength(1);
  });

  it("rejects levels from another criterion and criteria from another assignment", async () => {
    const s = await setup();
    const base = { submissionId: s.samSub.id, version: 0, overallFeedback: "" };
    const wrongLevel = await saveGradeHandler(ctx(s.alice), {
      ...base,
      scores: [{ criterionId: s.a.thesis.id, levelId: s.a.style.levels[0]!.id, feedback: "" }],
    });
    expect(wrongLevel).toMatchObject({ ok: false, code: "VALIDATION" });
    const foreign = await saveGradeHandler(ctx(s.alice), {
      ...base,
      scores: [{ criterionId: s.b.thesis.id, levelId: s.b.thesis.levels[0]!.id, feedback: "" }],
    });
    expect(foreign).toMatchObject({ ok: false, code: "VALIDATION" });
    expect(await db.select().from(grade)).toHaveLength(0);
  });

  it("students, outsiders and other instructors cannot grade", async () => {
    const s = await setup();
    const input = { submissionId: s.samSub.id, version: 0, overallFeedback: "", scores: [] };
    expect(await saveGradeHandler(ctx(s.sam), input)).toMatchObject({ code: "FORBIDDEN" });
    expect(await saveGradeHandler(ctx(s.sue), input)).toMatchObject({ code: "NOT_FOUND" });
    expect(await saveGradeHandler(ctx(s.olivia), input)).toMatchObject({ code: "NOT_FOUND" });
    expect(await saveGradeHandler(ctx(s.bob), input)).toMatchObject({ code: "NOT_FOUND" });
    expect(await db.select().from(grade)).toHaveLength(0);
  });

  it("an unsubmitted draft cannot be graded, and grading freezes the submission", async () => {
    const s = await setup();
    const draft = await saveGradeHandler(ctx(s.alice), {
      submissionId: s.ninaDraft.id,
      version: 0,
      overallFeedback: "",
      scores: [],
    });
    expect(draft).toMatchObject({ ok: false, code: "CONFLICT" });

    unwrap(
      await saveGradeHandler(ctx(s.alice), {
        submissionId: s.samSub.id,
        version: 0,
        overallFeedback: "",
        scores: [],
      }),
    );
    expect(
      await submitHandler(ctx(s.sam), { assignmentId: s.a.assignmentId, content: "Changed" }),
    ).toMatchObject({ ok: false, code: "CONFLICT" });
  });

  it("an archived course is read-only for grading", async () => {
    const s = await setup();
    unwrap(await archiveCourseHandler(ctx(s.alice), { courseId: s.a.courseId }));
    expect(
      await saveGradeHandler(ctx(s.alice), {
        submissionId: s.samSub.id,
        version: 0,
        overallFeedback: "",
        scores: [],
      }),
    ).toMatchObject({ code: "FORBIDDEN" });
  });

  it("keeps an accepted AI score as AI and marks an edited one AI_EDITED", async () => {
    const s = await setup();
    const [g] = await db.insert(grade).values({ submissionId: s.samSub.id }).returning();
    const [thesis, style] = fullScores(s);
    await db.insert(criterionScore).values([
      {
        gradeId: g!.id,
        ...thesis!,
        points: 10,
        feedback: "AI says clear",
        source: "AI",
        aiConfidence: 0.9,
      },
      {
        gradeId: g!.id,
        ...style!,
        points: 5,
        feedback: "AI says polished",
        source: "AI",
        aiConfidence: 0.4,
      },
    ]);
    await saveGrade(db, {
      submissionId: s.samSub.id,
      actorId: s.tara.id,
      version: 1,
      overallFeedback: "",
      scores: [
        { ...thesis!, feedback: "AI says clear" },
        { ...style!, feedback: "Edited by Tara" },
      ],
    });
    const rows = await db.select().from(criterionScore);
    const byCriterion = new Map(rows.map((r) => [r.criterionId, r]));
    expect(byCriterion.get(thesis!.criterionId)).toMatchObject({ source: "AI", aiConfidence: 0.9 });
    expect(byCriterion.get(style!.criterionId)).toMatchObject({ source: "AI_EDITED" });
  });
});

describe("releasing grades", () => {
  async function reviewed(s: Setup, submissionId: string, scores = fullScores(s)) {
    return unwrap(
      await saveGradeHandler(ctx(s.tara), {
        submissionId,
        version: 0,
        overallFeedback: "Well done",
        scores,
      }),
    );
  }

  it("the instructor releases; the student then sees it, without AI details", async () => {
    const s = await setup();
    const g = await reviewed(s, s.samSub.id);
    expect(await getReleasedGrade(db, s.samSub.id)).toBeNull();
    expect(
      (await getOwnSubmissionStatuses(db, s.sam.id, [s.a.assignmentId])).get(s.a.assignmentId),
    ).toMatchObject({ released: false });

    const later = new Date(NOW.getTime() + 60_000);
    const result = unwrap(
      await releaseGradesHandler(ctx(s.alice, later), {
        assignmentId: s.a.assignmentId,
        grades: [{ submissionId: s.samSub.id, version: g.version }],
      }),
    );
    expect(result.released).toBe(1);

    const visible = await getReleasedGrade(db, s.samSub.id);
    expect(visible).toMatchObject({
      totalScore: 15,
      overallFeedback: "Well done",
      releasedAt: later,
    });
    expect(Object.keys(visible!.scores[0]!).sort()).toEqual(
      ["criterionId", "feedback", "levelId", "points"].sort(),
    );
    expect(
      (await getOwnSubmissionStatuses(db, s.sam.id, [s.a.assignmentId])).get(s.a.assignmentId),
    ).toMatchObject({ released: true });
    const audit = await db.select().from(auditLog).where(eq(auditLog.action, "grade.released"));
    expect(audit).toHaveLength(1);
  });

  it("a TA cannot release", async () => {
    const s = await setup();
    const g = await reviewed(s, s.samSub.id);
    expect(
      await releaseGradesHandler(ctx(s.tara), {
        assignmentId: s.a.assignmentId,
        grades: [{ submissionId: s.samSub.id, version: g.version }],
      }),
    ).toMatchObject({ ok: false, code: "FORBIDDEN" });
    expect(await getReleasedGrade(db, s.samSub.id)).toBeNull();
  });

  it("students and other instructors cannot release", async () => {
    const s = await setup();
    const g = await reviewed(s, s.samSub.id);
    const input = {
      assignmentId: s.a.assignmentId,
      grades: [{ submissionId: s.samSub.id, version: g.version }],
    };
    expect(await releaseGradesHandler(ctx(s.sam), input)).toMatchObject({ code: "NOT_FOUND" });
    expect(await releaseGradesHandler(ctx(s.bob), input)).toMatchObject({ code: "NOT_FOUND" });
    // Bob's own assignment id with Alice's submission: it does not belong there.
    expect(
      await releaseGradesHandler(ctx(s.bob), { ...input, assignmentId: s.b.assignmentId }),
    ).toMatchObject({ code: "CONFLICT" });
    expect(await getReleasedGrade(db, s.samSub.id)).toBeNull();
  });

  it("bulk release is atomic: one incomplete grade means nothing is released", async () => {
    const s = await setup();
    const samGrade = await reviewed(s, s.samSub.id);
    const [thesis] = fullScores(s);
    const sueGrade = await reviewed(s, s.sueSub.id, [thesis!]); // Style not scored

    const result = await releaseGradesHandler(ctx(s.alice), {
      assignmentId: s.a.assignmentId,
      grades: [
        { submissionId: s.samSub.id, version: samGrade.version },
        { submissionId: s.sueSub.id, version: sueGrade.version },
      ],
    });
    expect(result).toMatchObject({ ok: false, code: "CONFLICT" });
    const statuses = (await db.select().from(grade)).map((g) => g.status);
    expect(statuses).toEqual(["DRAFT", "DRAFT"]);
    expect(
      await db.select().from(auditLog).where(eq(auditLog.action, "grade.released")),
    ).toHaveLength(0);
  });

  it("bulk release of complete grades releases all of them", async () => {
    const s = await setup();
    const samGrade = await reviewed(s, s.samSub.id);
    const sueGrade = await reviewed(s, s.sueSub.id);
    const releasable = await listReleasable(db, s.a.assignmentId, 200);
    expect(releasable).toHaveLength(2);
    expect(
      unwrap(
        await releaseGradesHandler(ctx(s.alice), {
          assignmentId: s.a.assignmentId,
          grades: [
            { submissionId: s.samSub.id, version: samGrade.version },
            { submissionId: s.sueSub.id, version: sueGrade.version },
          ],
        }),
      ).released,
    ).toBe(2);
    expect(await listReleasable(db, s.a.assignmentId, 200)).toHaveLength(0);
  });

  it("refuses a stale version, an unreviewed AI draft and a second release", async () => {
    const s = await setup();
    const g = await reviewed(s, s.samSub.id);
    const release = (version: number) =>
      releaseGradesHandler(ctx(s.alice), {
        assignmentId: s.a.assignmentId,
        grades: [{ submissionId: s.samSub.id, version }],
      });
    expect(await release(g.version + 1)).toMatchObject({ code: "CONFLICT" });

    // An AI-only draft (no human saved it) is not released.
    await db.insert(grade).values({ submissionId: s.sueSub.id });
    expect(
      await releaseGradesHandler(ctx(s.alice), {
        assignmentId: s.a.assignmentId,
        grades: [{ submissionId: s.sueSub.id, version: 1 }],
      }),
    ).toMatchObject({ code: "CONFLICT" });

    unwrap(await release(g.version));
    expect(await release(g.version)).toMatchObject({ code: "CONFLICT" });
  });

  it("a released grade can no longer be saved", async () => {
    const s = await setup();
    const g = await reviewed(s, s.samSub.id);
    unwrap(
      await releaseGradesHandler(ctx(s.alice), {
        assignmentId: s.a.assignmentId,
        grades: [{ submissionId: s.samSub.id, version: g.version }],
      }),
    );
    for (const who of [s.alice, s.tara]) {
      expect(
        await saveGradeHandler(ctx(who), {
          submissionId: s.samSub.id,
          version: g.version,
          overallFeedback: "changed",
          scores: [],
        }),
      ).toMatchObject({ ok: false, code: "FORBIDDEN" });
    }
    await expect(
      saveGrade(db, {
        submissionId: s.samSub.id,
        actorId: s.alice.id,
        version: g.version,
        overallFeedback: "changed",
        scores: [],
      }),
    ).rejects.toMatchObject({ code: "CONFLICT" });
  });
});

describe("grading queue", () => {
  it("lists every student with a status, filters and counts in SQL", async () => {
    const s = await setup();
    const ref = { courseId: s.a.courseId, assignmentId: s.a.assignmentId };
    const g = await saveGrade(db, {
      submissionId: s.samSub.id,
      actorId: s.tara.id,
      version: 0,
      overallFeedback: "",
      scores: fullScores(s),
    });
    unwrap(
      await releaseGradesHandler(ctx(s.alice), {
        assignmentId: s.a.assignmentId,
        grades: [{ submissionId: s.samSub.id, version: g.version }],
      }),
    );

    const all = await listGradingQueue(db, ref, null, { page: 1, pageSize: 50 });
    expect(all.items.map((i) => [i.name, i.status])).toEqual([
      ["Nina", "NOT_SUBMITTED"],
      ["Sam", "RELEASED"],
      ["Sue", "SUBMITTED"],
    ]);
    // A draft's id and details are not exposed to the queue.
    expect(all.items[0]).toMatchObject({ submissionId: null, wordCount: null });

    const waiting = await listGradingQueue(db, ref, "SUBMITTED", { page: 1, pageSize: 50 });
    expect(waiting.items.map((i) => i.name)).toEqual(["Sue"]);

    expect(await countGradingQueue(db, ref)).toEqual({
      NOT_SUBMITTED: 1,
      SUBMITTED: 1,
      AI_DRAFTED: 0,
      REVIEWED: 0,
      RELEASED: 1,
    });

    const page = await listGradingQueue(db, ref, null, { page: 1, pageSize: 2 });
    expect(page.items).toHaveLength(2);
    expect(page.hasMore).toBe(true);
  });
});
