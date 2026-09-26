import { and, eq } from "drizzle-orm";

import type { Db } from "@/server/db/client";
import {
  aiGradingRun,
  assignment,
  auditLog,
  criterionScore,
  grade,
  submission,
} from "@/server/db/schema";
import { getRubric } from "@/server/services/assignment.service";

import { postprocess, type ProcessedDraft } from "./postprocess";
import {
  type AiGradeOutput,
  AiInvalidOutputError,
  type AiProvider,
  AiProviderError,
  type AiUsage,
} from "./types";

export const AI_TIMEOUT_MS = 30_000;
export const AI_CONCURRENCY = 3;

export type RunDeps = {
  db: Db;
  provider: AiProvider;
  now?: () => Date;
  timeoutMs?: number;
  /** Backoff before the single retry. */
  retryDelayMs?: number;
};

type ErrorCode = "TIMEOUT" | "PROVIDER" | "INVALID_OUTPUT";

class RunFailure extends Error {
  constructor(
    readonly code: ErrorCode,
    readonly raw: unknown = null,
  ) {
    super(code);
  }
}

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

/** One attempt with a 30 s timeout, then at most one retry with backoff for transient errors. */
async function callWithRetry(deps: RunDeps, request: Parameters<AiProvider["grade"]>[0]) {
  const timeoutMs = deps.timeoutMs ?? AI_TIMEOUT_MS;
  for (let attempt = 1; ; attempt++) {
    const signal = AbortSignal.timeout(timeoutMs);
    try {
      return await deps.provider.grade(request, signal);
    } catch (error) {
      if (error instanceof AiInvalidOutputError) throw new RunFailure("INVALID_OUTPUT", error.raw);
      const code: ErrorCode = signal.aborted ? "TIMEOUT" : "PROVIDER";
      const retryable = signal.aborted || !(error instanceof AiProviderError) || error.retryable;
      if (attempt >= 2 || !retryable) throw new RunFailure(code);
      await sleep((deps.retryDelayMs ?? 1000) * attempt);
    }
  }
}

async function markFailed(deps: RunDeps, runId: string, code: ErrorCode, raw: unknown) {
  await deps.db
    .update(aiGradingRun)
    .set({
      status: "FAILED",
      errorCode: code,
      finishedAt: (deps.now ?? (() => new Date()))(),
      rawOutput: raw === null || raw === undefined ? null : { raw },
    })
    .where(and(eq(aiGradingRun.id, runId), eq(aiGradingRun.status, "PENDING")));
}

/**
 * Stores a successful draft. The run is marked SUCCEEDED only while still PENDING, so a result
 * that arrives after the stale sweep writes nothing. A grade a person has already saved (or a
 * released one) is never overwritten.
 */
async function storeDraft(
  deps: RunDeps,
  run: { id: string; submissionId: string; courseId: string; requestedBy: string | null },
  draft: ProcessedDraft,
  output: AiGradeOutput,
  usage: AiUsage,
) {
  const now = (deps.now ?? (() => new Date()))();
  return deps.db.transaction(async (tx) => {
    const [claimed] = await tx
      .update(aiGradingRun)
      .set({
        status: "SUCCEEDED",
        finishedAt: now,
        inputTokens: usage.inputTokens ?? null,
        outputTokens: usage.outputTokens ?? null,
        rawOutput: output,
      })
      .where(and(eq(aiGradingRun.id, run.id), eq(aiGradingRun.status, "PENDING")))
      .returning({ id: aiGradingRun.id });
    if (!claimed) return "ignored" as const;

    const [current] = await tx
      .select({
        id: grade.id,
        status: grade.status,
        gradedBy: grade.gradedBy,
        version: grade.version,
      })
      .from(grade)
      .where(eq(grade.submissionId, run.submissionId))
      .for("update");
    if (current && (current.status === "RELEASED" || current.gradedBy))
      return "kept-human" as const;

    const totalScore = draft.scores.reduce((sum, s) => sum + s.points, 0);
    let gradeId: string;
    if (current) {
      gradeId = current.id;
      await tx.delete(criterionScore).where(eq(criterionScore.gradeId, gradeId));
      // Bumping the version makes any grader form opened on the old draft reload first.
      await tx
        .update(grade)
        .set({ totalScore, overallFeedback: draft.overallFeedback, version: current.version + 1 })
        .where(eq(grade.id, gradeId));
    } else {
      const [created] = await tx
        .insert(grade)
        .values({
          submissionId: run.submissionId,
          totalScore,
          overallFeedback: draft.overallFeedback,
        })
        .returning({ id: grade.id });
      gradeId = created!.id;
    }
    await tx.insert(criterionScore).values(
      draft.scores.map((s) => ({
        gradeId,
        criterionId: s.criterionId,
        levelId: s.levelId,
        points: s.points,
        feedback: s.feedback,
        source: "AI" as const,
        aiConfidence: s.confidence,
        aiEvidence: s.evidence,
      })),
    );
    await tx.insert(auditLog).values({
      actorId: run.requestedBy,
      courseId: run.courseId,
      action: "grade.ai_drafted",
      entityType: "grade",
      entityId: gradeId,
      metadata: {
        submissionId: run.submissionId,
        runId: run.id,
        totalScore,
        rejectedCriteria: draft.rejectedCriteria.length,
        droppedQuotes: draft.droppedQuotes,
      },
    });
    return "stored" as const;
  });
}

/** Processes one PENDING run end to end. Never throws: every failure ends as a FAILED run. */
export async function processRun(deps: RunDeps, runId: string) {
  try {
    const [row] = await deps.db
      .select({
        id: aiGradingRun.id,
        status: aiGradingRun.status,
        submissionId: aiGradingRun.submissionId,
        courseId: aiGradingRun.courseId,
        requestedBy: aiGradingRun.requestedBy,
        content: submission.content,
        assignmentId: assignment.id,
        assignmentTitle: assignment.title,
        instructions: assignment.instructions,
      })
      .from(aiGradingRun)
      .innerJoin(submission, eq(submission.id, aiGradingRun.submissionId))
      .innerJoin(assignment, eq(assignment.id, submission.assignmentId))
      .where(eq(aiGradingRun.id, runId))
      .limit(1);
    if (!row || row.status !== "PENDING") return "skipped" as const;

    const rubric = await getRubric(deps.db, row.assignmentId);
    const { output, usage } = await callWithRetry(deps, {
      assignmentTitle: row.assignmentTitle,
      instructions: row.instructions,
      rubric,
      content: row.content,
    });
    let draft: ProcessedDraft;
    try {
      draft = postprocess(output, rubric, row.content);
    } catch {
      throw new RunFailure("INVALID_OUTPUT", output);
    }
    return await storeDraft(deps, row, draft, output, usage);
  } catch (error) {
    if (error instanceof RunFailure) {
      await markFailed(deps, runId, error.code, error.raw);
      return "failed" as const;
    }
    console.error(`[ai] run ${runId} failed unexpectedly`, error);
    await markFailed(deps, runId, "PROVIDER", null).catch(() => {});
    return "failed" as const;
  }
}

/** Processes runs with at most `AI_CONCURRENCY` in flight. */
export async function processRuns(deps: RunDeps, runIds: string[], concurrency = AI_CONCURRENCY) {
  const queue = [...runIds];
  const worker = async () => {
    for (let id = queue.shift(); id; id = queue.shift()) await processRun(deps, id);
  };
  await Promise.all(Array.from({ length: Math.min(concurrency, queue.length) }, worker));
}
