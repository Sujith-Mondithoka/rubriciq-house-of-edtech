import { eq } from "drizzle-orm";
import { afterAll, beforeEach, describe, expect, it } from "vitest";

import type { Result } from "@/lib/result";
import { makeGenerateAiDraftsHandler } from "@/server/actions/ai.handlers";
import {
  createAssignmentHandler,
  publishAssignmentHandler,
  saveRubricHandler,
} from "@/server/actions/assignment.handlers";
import {
  addTaHandler,
  createCourseHandler,
  joinCourseHandler,
  setCourseAiHandler,
} from "@/server/actions/course.handlers";
import { releaseGradesHandler, saveGradeHandler } from "@/server/actions/grade.handlers";
import type { ActionContext } from "@/server/actions/handler";
import { saveDraftHandler, submitHandler } from "@/server/actions/submission.handlers";
import { processRun, processRuns, type RunDeps } from "@/server/ai/grade-submission";
import { createMockProvider } from "@/server/ai/mock-provider";
import type { AiProvider } from "@/server/ai/types";
import { aiGradingRun, auditLog, course, criterionScore, grade } from "@/server/db/schema";
import {
  getAiSuggestedLevels,
  getLatestRuns,
  STALE_AFTER_MS,
  sweepStaleRuns,
} from "@/server/services/ai.service";
import { getRubric } from "@/server/services/assignment.service";
import { getGradeForStaff, listGradingQueue } from "@/server/services/grade.service";

import { createUser } from "../fixtures/factories";
import { createTestDb, truncateAll } from "./helpers/test-db";

const { db, pool } = createTestDb();
const NOW = new Date("2026-09-26T12:00:00Z");
const DUE = new Date(NOW.getTime() + 24 * 60 * 60 * 1000);

type TestUser = { id: string; name: string; email: string };
const ctx = (user: TestUser, now = NOW): ActionContext => ({ db, user, now });
const config = { available: true, model: "mock-grader", dailyCap: 100 };
const generate = makeGenerateAiDraftsHandler(config);

const mock = createMockProvider({ latencyMs: 0 });
const deps = (provider: AiProvider = mock): RunDeps => ({
  db,
  provider,
  timeoutMs: 200,
  retryDelayMs: 0,
});

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

/** Alice teaches, Tara is TA; Sam and Sue submit, Nina only has a draft. */
async function setup({
  samText = "Remote learning should stay. It helps.",
  sueText = "My essay.",
} = {}) {
  const alice = await newUser("Alice");
  const tara = await newUser("Tara");
  const sam = await newUser("Sam");
  const sue = await newUser("Sue");
  const nina = await newUser("Nina");
  const olivia = await newUser("Olivia");
  const { courseId } = unwrap(
    await createCourseHandler(ctx(alice), { name: "A", description: "" }),
  );
  unwrap(await addTaHandler(ctx(alice), { courseId, email: tara.email }));
  const [c] = await db.select().from(course).where(eq(course.id, courseId));
  for (const s of [sam, sue, nina])
    unwrap(await joinCourseHandler(ctx(s), { joinCode: c!.joinCode }));
  const { assignmentId } = unwrap(
    await createAssignmentHandler(ctx(alice), {
      courseId,
      title: "Essay",
      instructions: "Argue a position.",
      dueAt: DUE.toISOString(),
      allowLate: false,
    }),
  );
  unwrap(await saveRubricHandler(ctx(alice), { assignmentId, criteria: rubric }));
  unwrap(await publishAssignmentHandler(ctx(alice), { assignmentId }));
  const samSub = unwrap(
    await submitHandler(ctx(sam), { assignmentId, content: samText }),
  ).submission;
  const sueSub = unwrap(
    await submitHandler(ctx(sue), { assignmentId, content: sueText }),
  ).submission;
  unwrap(await saveDraftHandler(ctx(nina), { assignmentId, content: "draft" }));
  return { alice, tara, sam, sue, olivia, courseId, assignmentId, samSub, sueSub };
}

const runsFor = (submissionId: string) =>
  db.select().from(aiGradingRun).where(eq(aiGradingRun.submissionId, submissionId));

beforeEach(() => truncateAll(db));
afterAll(() => pool.end());

describe("starting AI drafts", () => {
  it("a TA drafts every submitted piece; drafts become AI grades with evidence", async () => {
    const s = await setup();
    const { runIds } = unwrap(await generate(ctx(s.tara), { assignmentId: s.assignmentId }));
    expect(runIds).toHaveLength(2); // Sam and Sue; Nina's draft is not submitted
    const [pending] = await runsFor(s.samSub.id);
    expect(pending).toMatchObject({
      status: "PENDING",
      model: "mock-grader",
      promptVersion: "v1",
      requestedBy: s.tara.id,
      courseId: s.courseId,
    });

    await processRuns(deps(), runIds);

    const [done] = await runsFor(s.samSub.id);
    expect(done).toMatchObject({ status: "SUCCEEDED", errorCode: null });
    expect(done!.inputTokens).toBeGreaterThan(0);
    expect(done!.rawOutput).toBeTruthy();

    const g = await getGradeForStaff(db, s.samSub.id);
    expect(g).toMatchObject({ status: "DRAFT", gradedBy: null });
    expect(g!.scores).toHaveLength(2);
    expect(g!.scores.every((sc) => sc.source === "AI")).toBe(true);
    expect(g!.scores[0]!.aiEvidence).toEqual(["Remote learning should stay."]);
    expect(g!.totalScore).toBe(g!.scores.reduce((sum, sc) => sum + sc.points, 0));

    const queue = await listGradingQueue(
      db,
      { courseId: s.courseId, assignmentId: s.assignmentId },
      "AI_DRAFTED",
      { page: 1, pageSize: 50 },
    );
    expect(queue.items.map((i) => i.name)).toEqual(["Sam", "Sue"]);
    const audit = await db.select().from(auditLog).where(eq(auditLog.action, "grade.ai_drafted"));
    expect(audit).toHaveLength(2);
  });

  it("students and outsiders cannot run AI; nothing starts", async () => {
    const s = await setup();
    expect(await generate(ctx(s.sam), { assignmentId: s.assignmentId })).toMatchObject({
      code: "NOT_FOUND",
    });
    expect(await generate(ctx(s.olivia), { assignmentId: s.assignmentId })).toMatchObject({
      code: "NOT_FOUND",
    });
    expect(await db.select().from(aiGradingRun)).toHaveLength(0);
  });

  it("is rejected on the server when course AI is off or AI is not configured", async () => {
    const s = await setup();
    unwrap(await setCourseAiHandler(ctx(s.alice), { courseId: s.courseId, aiEnabled: false }));
    expect(await generate(ctx(s.alice), { assignmentId: s.assignmentId })).toMatchObject({
      ok: false,
      code: "FORBIDDEN",
    });
    unwrap(await setCourseAiHandler(ctx(s.alice), { courseId: s.courseId, aiEnabled: true }));
    const unconfigured = makeGenerateAiDraftsHandler({ ...config, available: false });
    expect(await unconfigured(ctx(s.alice), { assignmentId: s.assignmentId })).toMatchObject({
      ok: false,
      code: "CONFLICT",
    });
    expect(await db.select().from(aiGradingRun)).toHaveLength(0);
  });

  it("allows one active run per submission", async () => {
    const s = await setup();
    const input = { assignmentId: s.assignmentId, submissionIds: [s.samSub.id] };
    unwrap(await generate(ctx(s.alice), input));
    expect(await generate(ctx(s.alice), input)).toMatchObject({ ok: false, code: "CONFLICT" });
    expect(await runsFor(s.samSub.id)).toHaveLength(1);
  });

  it("refuses a batch over the daily course cap and starts nothing", async () => {
    const s = await setup();
    const capped = makeGenerateAiDraftsHandler({ ...config, dailyCap: 1 });
    expect(await capped(ctx(s.alice), { assignmentId: s.assignmentId })).toMatchObject({
      ok: false,
      code: "RATE_LIMITED",
    });
    expect(await db.select().from(aiGradingRun)).toHaveLength(0);
    // One fits; after that the cap is used up for today.
    unwrap(
      await capped(ctx(s.alice), { assignmentId: s.assignmentId, submissionIds: [s.samSub.id] }),
    );
    expect(
      await capped(ctx(s.alice), { assignmentId: s.assignmentId, submissionIds: [s.sueSub.id] }),
    ).toMatchObject({ code: "RATE_LIMITED" });
    // The next UTC day has a fresh allowance.
    const tomorrow = new Date(NOW.getTime() + 24 * 60 * 60 * 1000);
    unwrap(
      await capped(ctx(s.alice, tomorrow), {
        assignmentId: s.assignmentId,
        submissionIds: [s.sueSub.id],
      }),
    );
  });

  it("never drafts over a grade a person has saved", async () => {
    const s = await setup();
    unwrap(
      await saveGradeHandler(ctx(s.tara), {
        submissionId: s.samSub.id,
        version: 0,
        overallFeedback: "Mine",
        scores: [],
      }),
    );
    expect(
      await generate(ctx(s.alice), { assignmentId: s.assignmentId, submissionIds: [s.samSub.id] }),
    ).toMatchObject({ code: "CONFLICT" });
  });
});

describe("processing runs", () => {
  it("retries a provider error once, then fails with PROVIDER; manual grading still works", async () => {
    const s = await setup({ samText: "Essay text [mock:fail]" });
    let calls = 0;
    const counting: AiProvider = {
      model: mock.model,
      grade: (req, signal) => {
        calls++;
        return mock.grade(req, signal);
      },
    };
    const { runIds } = unwrap(
      await generate(ctx(s.alice), { assignmentId: s.assignmentId, submissionIds: [s.samSub.id] }),
    );
    expect(await processRun(deps(counting), runIds[0]!)).toBe("failed");
    expect(calls).toBe(2);
    expect((await runsFor(s.samSub.id))[0]).toMatchObject({
      status: "FAILED",
      errorCode: "PROVIDER",
    });
    expect(await getGradeForStaff(db, s.samSub.id)).toBeNull();

    // Manual fallback: grade and release without AI.
    const saved = unwrap(
      await saveGradeHandler(ctx(s.alice), {
        submissionId: s.samSub.id,
        version: 0,
        overallFeedback: "",
        scores: await topScores(s.assignmentId),
      }),
    );
    unwrap(
      await releaseGradesHandler(ctx(s.alice), {
        assignmentId: s.assignmentId,
        grades: [{ submissionId: s.samSub.id, version: saved.version }],
      }),
    );
  });

  it("stores INVALID_OUTPUT with the raw output, without retrying", async () => {
    const s = await setup({ samText: "Essay [mock:invalid]" });
    const { runIds } = unwrap(
      await generate(ctx(s.alice), { assignmentId: s.assignmentId, submissionIds: [s.samSub.id] }),
    );
    await processRun(deps(), runIds[0]!);
    const [run] = await runsFor(s.samSub.id);
    expect(run).toMatchObject({ status: "FAILED", errorCode: "INVALID_OUTPUT" });
    expect(run!.rawOutput).toEqual({ raw: { unexpected: "not a grade" } });
    expect(await db.select().from(grade)).toHaveLength(0);
  });

  it("an output with only foreign levels is INVALID_OUTPUT", async () => {
    const s = await setup();
    const wrong: AiProvider = {
      model: "m",
      grade: async () => ({
        output: {
          criteria: [{ criterionId: "x", levelId: "y", feedback: "", evidence: [], confidence: 1 }],
          overallFeedback: "",
        },
        usage: {},
      }),
    };
    const { runIds } = unwrap(
      await generate(ctx(s.alice), { assignmentId: s.assignmentId, submissionIds: [s.samSub.id] }),
    );
    await processRun(deps(wrong), runIds[0]!);
    expect((await runsFor(s.samSub.id))[0]).toMatchObject({ errorCode: "INVALID_OUTPUT" });
  });

  it("times out after the limit (and one retry) with TIMEOUT", async () => {
    const s = await setup({ samText: "Essay [mock:slow]" });
    const { runIds } = unwrap(
      await generate(ctx(s.alice), { assignmentId: s.assignmentId, submissionIds: [s.samSub.id] }),
    );
    await processRun({ ...deps(), timeoutMs: 30 }, runIds[0]!);
    expect((await runsFor(s.samSub.id))[0]).toMatchObject({
      status: "FAILED",
      errorCode: "TIMEOUT",
    });
  });

  it("drops fabricated quotes and marks the criterion low-confidence", async () => {
    const s = await setup({ samText: "Remote learning should stay. [mock:fabricate]" });
    const { runIds } = unwrap(
      await generate(ctx(s.alice), { assignmentId: s.assignmentId, submissionIds: [s.samSub.id] }),
    );
    await processRun(deps(), runIds[0]!);
    const scores = await db.select().from(criterionScore);
    for (const sc of scores) {
      expect(sc.aiEvidence).toEqual(["Remote learning should stay."]);
      expect(sc.aiConfidence).toBeLessThan(0.6);
    }
  });

  it("a failed run can be retried", async () => {
    const s = await setup({ samText: "Essay [mock:invalid]" });
    const input = { assignmentId: s.assignmentId, submissionIds: [s.samSub.id] };
    await processRun(deps(), unwrap(await generate(ctx(s.alice), input)).runIds[0]!);
    const retry = unwrap(await generate(ctx(s.alice, new Date(NOW.getTime() + 60_000)), input));
    expect(retry.runIds).toHaveLength(1);
    expect((await getLatestRuns(db, [s.samSub.id])).get(s.samSub.id)).toMatchObject({
      id: retry.runIds[0],
      status: "PENDING",
    });
  });

  it("a human save during the run is kept; the AI result does not overwrite it", async () => {
    const s = await setup();
    const { runIds } = unwrap(
      await generate(ctx(s.alice), { assignmentId: s.assignmentId, submissionIds: [s.samSub.id] }),
    );
    const racing: AiProvider = {
      model: mock.model,
      grade: async (req, signal) => {
        unwrap(
          await saveGradeHandler(ctx(s.tara), {
            submissionId: s.samSub.id,
            version: 0,
            overallFeedback: "Human wins",
            scores: [],
          }),
        );
        return mock.grade(req, signal);
      },
    };
    // A realistic timeout: the save above is a real database round trip.
    expect(await processRun({ ...deps(racing), timeoutMs: 20_000 }, runIds[0]!)).toBe("kept-human");
    const g = await getGradeForStaff(db, s.samSub.id);
    expect(g).toMatchObject({ overallFeedback: "Human wins", gradedBy: s.tara.id, version: 1 });
    expect(g!.scores).toHaveLength(0);
  });

  it("remembers the AI's suggested level after a person overrides it", async () => {
    const s = await setup();
    const { runIds } = unwrap(
      await generate(ctx(s.alice), { assignmentId: s.assignmentId, submissionIds: [s.samSub.id] }),
    );
    await processRun(deps(), runIds[0]!);
    const draft = (await getGradeForStaff(db, s.samSub.id))!;
    const suggestedBefore = await getAiSuggestedLevels(db, s.samSub.id);
    expect([...suggestedBefore.values()].sort()).toEqual(
      draft.scores.map((sc) => sc.levelId).sort(),
    );

    // Override the first criterion with a different level.
    const [criterion] = await getRubric(db, s.assignmentId);
    const other = criterion!.levels.find((l) => l.id !== suggestedBefore.get(criterion!.id))!;
    unwrap(
      await saveGradeHandler(ctx(s.alice), {
        submissionId: s.samSub.id,
        version: draft.version,
        overallFeedback: "",
        scores: [{ criterionId: criterion!.id, levelId: other.id, feedback: "" }],
      }),
    );
    const suggestedAfter = await getAiSuggestedLevels(db, s.samSub.id);
    expect(suggestedAfter.get(criterion!.id)).toBe(suggestedBefore.get(criterion!.id));
    expect(suggestedAfter.get(criterion!.id)).not.toBe(other.id);
    // No successful run: nothing suggested.
    expect((await getAiSuggestedLevels(db, s.sueSub.id)).size).toBe(0);
  });

  it("accepting an AI draft keeps the AI source and makes it releasable", async () => {
    const s = await setup();
    const { runIds } = unwrap(
      await generate(ctx(s.alice), { assignmentId: s.assignmentId, submissionIds: [s.samSub.id] }),
    );
    await processRun(deps(), runIds[0]!);
    const draft = (await getGradeForStaff(db, s.samSub.id))!;
    // Not reviewed yet: release is refused.
    expect(
      await releaseGradesHandler(ctx(s.alice), {
        assignmentId: s.assignmentId,
        grades: [{ submissionId: s.samSub.id, version: draft.version }],
      }),
    ).toMatchObject({ code: "CONFLICT" });
    const saved = unwrap(
      await saveGradeHandler(ctx(s.alice), {
        submissionId: s.samSub.id,
        version: draft.version,
        overallFeedback: draft.overallFeedback,
        scores: draft.scores.map((sc) => ({
          criterionId: sc.criterionId,
          levelId: sc.levelId,
          feedback: sc.feedback,
        })),
      }),
    );
    expect((await db.select().from(criterionScore)).every((sc) => sc.source === "AI")).toBe(true);
    unwrap(
      await releaseGradesHandler(ctx(s.alice), {
        assignmentId: s.assignmentId,
        grades: [{ submissionId: s.samSub.id, version: saved.version }],
      }),
    );
  });
});

describe("stale runs", () => {
  it("the sweep fails PENDING runs older than 5 minutes; a late result is ignored", async () => {
    const s = await setup();
    const { runIds } = unwrap(
      await generate(ctx(s.alice), { assignmentId: s.assignmentId, submissionIds: [s.samSub.id] }),
    );
    // Not stale yet.
    expect(
      await sweepStaleRuns(db, s.assignmentId, new Date(NOW.getTime() + STALE_AFTER_MS - 1000)),
    ).toBe(0);

    // The function "dies"; while the model is still answering, a page load sweeps the run.
    const late: AiProvider = {
      model: mock.model,
      grade: async (req, signal) => {
        expect(
          await sweepStaleRuns(db, s.assignmentId, new Date(NOW.getTime() + STALE_AFTER_MS + 1000)),
        ).toBe(1);
        return mock.grade(req, signal);
      },
    };
    expect(await processRun({ ...deps(late), timeoutMs: 20_000 }, runIds[0]!)).toBe("ignored");
    expect((await runsFor(s.samSub.id))[0]).toMatchObject({ status: "FAILED", errorCode: "STALE" });
    expect(await db.select().from(grade)).toHaveLength(0);

    // A swept run does not block a new one.
    unwrap(
      await generate(ctx(s.alice), { assignmentId: s.assignmentId, submissionIds: [s.samSub.id] }),
    );
  });

  it("starting drafts sweeps stale runs first", async () => {
    const s = await setup();
    await db.insert(aiGradingRun).values({
      submissionId: s.samSub.id,
      courseId: s.courseId,
      model: "m",
      promptVersion: "v1",
      startedAt: new Date(NOW.getTime() - STALE_AFTER_MS - 1000),
    });
    const { runIds } = unwrap(
      await generate(ctx(s.alice), { assignmentId: s.assignmentId, submissionIds: [s.samSub.id] }),
    );
    expect(runIds).toHaveLength(1);
    const statuses = (await runsFor(s.samSub.id)).map((r) => `${r.status}:${r.errorCode}`).sort();
    expect(statuses).toEqual(["FAILED:STALE", "PENDING:null"]);
  });
});

/** A complete manual grade: the top level of every criterion. */
async function topScores(assignmentId: string) {
  const criteria = await getRubric(db, assignmentId);
  return criteria.map((c) => ({
    criterionId: c.id,
    levelId: [...c.levels].sort((a, b) => b.points - a.points)[0]!.id,
    feedback: "",
  }));
}
