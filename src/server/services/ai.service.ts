import {
  and,
  asc,
  count,
  desc,
  eq,
  gte,
  inArray,
  isNull,
  lt,
  notExists,
  or,
  sql,
} from "drizzle-orm";

import { AppError } from "@/lib/errors";
import { aiGradeOutputSchema } from "@/server/ai/types";
import type { DbOrTx } from "@/server/db/client";
import { aiGradingRun, course, grade, submission } from "@/server/db/schema";

export type AiRun = typeof aiGradingRun.$inferSelect;
export type AiRunSummary = Pick<AiRun, "id" | "status" | "errorCode" | "createdAt">;

/** PENDING runs older than this are treated as lost (the function was killed). */
export const STALE_AFTER_MS = 5 * 60 * 1000;
/** Most submissions one "Generate AI drafts" click starts. */
export const AI_BATCH_MAX = 50;

function startOfUtcDay(now: Date) {
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
}

/**
 * Marks this assignment's PENDING runs older than 5 minutes as FAILED (STALE). Runs when the
 * grading queue or a submission loads; no cron job does this. A late result for a swept run
 * is ignored because it may only write `WHERE status = 'PENDING'`.
 */
export async function sweepStaleRuns(db: DbOrTx, assignmentId: string, now: Date) {
  const swept = await db
    .update(aiGradingRun)
    .set({ status: "FAILED", errorCode: "STALE", finishedAt: now })
    .where(
      and(
        eq(aiGradingRun.status, "PENDING"),
        lt(aiGradingRun.startedAt, new Date(now.getTime() - STALE_AFTER_MS)),
        inArray(
          aiGradingRun.submissionId,
          db
            .select({ id: submission.id })
            .from(submission)
            .where(eq(submission.assignmentId, assignmentId)),
        ),
      ),
    )
    .returning({ id: aiGradingRun.id });
  return swept.length;
}

/** The newest run per submission (one DISTINCT ON query). */
export async function getLatestRuns(db: DbOrTx, submissionIds: string[]) {
  if (!submissionIds.length) return new Map<string, AiRunSummary>();
  const rows = await db
    .selectDistinctOn([aiGradingRun.submissionId], {
      submissionId: aiGradingRun.submissionId,
      id: aiGradingRun.id,
      status: aiGradingRun.status,
      errorCode: aiGradingRun.errorCode,
      createdAt: aiGradingRun.createdAt,
    })
    .from(aiGradingRun)
    .where(inArray(aiGradingRun.submissionId, submissionIds))
    // A PENDING run is always the newest (no run can start while one is pending); it wins ties.
    .orderBy(
      aiGradingRun.submissionId,
      desc(sql`${aiGradingRun.status} = 'PENDING'`),
      desc(aiGradingRun.createdAt),
      desc(aiGradingRun.id),
    );
  return new Map(rows.map(({ submissionId, ...run }) => [submissionId, run]));
}

/**
 * The level the AI suggested per criterion (from the newest successful run), so the grader can
 * show "AI suggested X" next to the teacher's final choice even after an override.
 */
export async function getAiSuggestedLevels(db: DbOrTx, submissionId: string) {
  const [run] = await db
    .select({ rawOutput: aiGradingRun.rawOutput })
    .from(aiGradingRun)
    .where(and(eq(aiGradingRun.submissionId, submissionId), eq(aiGradingRun.status, "SUCCEEDED")))
    .orderBy(desc(aiGradingRun.createdAt), desc(aiGradingRun.id))
    .limit(1);
  const parsed = aiGradeOutputSchema.safeParse(run?.rawOutput);
  if (!parsed.success) return new Map<string, string>();
  return new Map(parsed.data.criteria.map((c) => [c.criterionId, c.levelId]));
}

type StartInput = {
  courseId: string;
  assignmentId: string;
  /** null = every eligible submission of the assignment (up to AI_BATCH_MAX). */
  submissionIds: string[] | null;
  requestedBy: string;
  model: string;
  promptVersion: string;
  dailyCap: number;
  now: Date;
};

/**
 * Creates PENDING runs for submissions that are submitted, not yet reviewed by a person and
 * have no active run. The course row is locked so concurrent clicks cannot exceed the daily cap;
 * if the batch would exceed it, nothing starts.
 */
export async function startAiRuns(db: DbOrTx, input: StartInput) {
  return db.transaction(async (tx) => {
    await tx
      .select({ id: course.id })
      .from(course)
      .where(eq(course.id, input.courseId))
      .for("update");

    const eligible = await tx
      .select({ id: submission.id })
      .from(submission)
      .leftJoin(grade, eq(grade.submissionId, submission.id))
      .where(
        and(
          eq(submission.assignmentId, input.assignmentId),
          eq(submission.status, "SUBMITTED"),
          input.submissionIds ? inArray(submission.id, input.submissionIds) : undefined,
          // No grade yet, or only an unreviewed AI draft (never overwrite a person's work).
          or(isNull(grade.id), and(eq(grade.status, "DRAFT"), isNull(grade.gradedBy))),
          notExists(
            tx
              .select({ one: sql`1` })
              .from(aiGradingRun)
              .where(
                and(
                  eq(aiGradingRun.submissionId, submission.id),
                  eq(aiGradingRun.status, "PENDING"),
                ),
              ),
          ),
        ),
      )
      .orderBy(asc(submission.submittedAt), asc(submission.id))
      .limit(AI_BATCH_MAX);

    if (!eligible.length) {
      throw new AppError(
        "CONFLICT",
        input.submissionIds
          ? "An AI draft cannot start here: it is already running, or a person has already graded this submission."
          : "Nothing to draft: every submission is already graded, drafted or running.",
      );
    }

    const [used] = await tx
      .select({ n: count() })
      .from(aiGradingRun)
      .where(
        and(
          eq(aiGradingRun.courseId, input.courseId),
          gte(aiGradingRun.createdAt, startOfUtcDay(input.now)),
        ),
      );
    const remaining = input.dailyCap - (used?.n ?? 0);
    if (eligible.length > remaining) {
      throw new AppError(
        "RATE_LIMITED",
        remaining > 0
          ? `Only ${remaining} AI ${remaining === 1 ? "draft is" : "drafts are"} left for this course today. Select fewer submissions or grade manually.`
          : "This course has used today's AI drafts. Grade manually, or try again tomorrow (UTC).",
      );
    }

    const created = await tx
      .insert(aiGradingRun)
      .values(
        eligible.map((s) => ({
          submissionId: s.id,
          courseId: input.courseId,
          requestedBy: input.requestedBy,
          model: input.model,
          promptVersion: input.promptVersion,
          startedAt: input.now,
          createdAt: input.now,
        })),
      )
      // The partial unique index allows one PENDING run per submission.
      .onConflictDoNothing()
      .returning({ id: aiGradingRun.id });
    return { runIds: created.map((r) => r.id) };
  });
}
