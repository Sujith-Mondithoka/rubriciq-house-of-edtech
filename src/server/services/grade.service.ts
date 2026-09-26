import { and, asc, count, eq, inArray, isNotNull, sql } from "drizzle-orm";

import { AppError } from "@/lib/errors";
import { missingCriteria, nextScoreSource } from "@/lib/grading";
import { type Page, type PageRequest, pageWindow, toPage } from "@/lib/pagination";
import type { CriterionScoreInput, QueueStatus } from "@/lib/validation/grade.schema";
import type { DbOrTx } from "@/server/db/client";
import {
  assignment,
  auditLog,
  courseMember,
  criterionScore,
  grade,
  rubricCriterion,
  rubricLevel,
  submission,
  user,
} from "@/server/db/schema";

export type Grade = typeof grade.$inferSelect;
export type CriterionScore = typeof criterionScore.$inferSelect;

export type StaffScore = Pick<
  CriterionScore,
  "criterionId" | "levelId" | "points" | "feedback" | "source" | "aiConfidence" | "aiEvidence"
>;
export type StaffGrade = Pick<
  Grade,
  "id" | "status" | "totalScore" | "overallFeedback" | "version" | "gradedBy" | "releasedAt"
> & { scores: StaffScore[] };

/** What a student may see: released grades only, never AI confidence, evidence or source. */
export type StudentGrade = Pick<Grade, "totalScore" | "overallFeedback" | "releasedAt"> & {
  scores: Pick<CriterionScore, "criterionId" | "levelId" | "points" | "feedback">[];
};

// ---------------------------------------------------------------------------
// Reads
// ---------------------------------------------------------------------------

/** The full grade for staff (two queries). */
export async function getGradeForStaff(
  db: DbOrTx,
  submissionId: string,
): Promise<StaffGrade | null> {
  const [row] = await db
    .select({
      id: grade.id,
      status: grade.status,
      totalScore: grade.totalScore,
      overallFeedback: grade.overallFeedback,
      version: grade.version,
      gradedBy: grade.gradedBy,
      releasedAt: grade.releasedAt,
    })
    .from(grade)
    .where(eq(grade.submissionId, submissionId))
    .limit(1);
  if (!row) return null;
  const scores = await db
    .select({
      criterionId: criterionScore.criterionId,
      levelId: criterionScore.levelId,
      points: criterionScore.points,
      feedback: criterionScore.feedback,
      source: criterionScore.source,
      aiConfidence: criterionScore.aiConfidence,
      aiEvidence: criterionScore.aiEvidence,
    })
    .from(criterionScore)
    .where(eq(criterionScore.gradeId, row.id));
  return { ...row, scores };
}

/** The released grade for the student's own view; null while it is a draft (or missing). */
export async function getReleasedGrade(
  db: DbOrTx,
  submissionId: string,
): Promise<StudentGrade | null> {
  const [row] = await db
    .select({
      id: grade.id,
      totalScore: grade.totalScore,
      overallFeedback: grade.overallFeedback,
      releasedAt: grade.releasedAt,
    })
    .from(grade)
    .where(and(eq(grade.submissionId, submissionId), eq(grade.status, "RELEASED")))
    .limit(1);
  if (!row) return null;
  const scores = await db
    .select({
      criterionId: criterionScore.criterionId,
      levelId: criterionScore.levelId,
      points: criterionScore.points,
      feedback: criterionScore.feedback,
    })
    .from(criterionScore)
    .where(eq(criterionScore.gradeId, row.id));
  return {
    totalScore: row.totalScore,
    overallFeedback: row.overallFeedback,
    releasedAt: row.releasedAt,
    scores,
  };
}

/** Whether grading has started (any grade row), which freezes the submission. */
export async function hasGrade(db: DbOrTx, submissionId: string): Promise<boolean> {
  const [row] = await db
    .select({ id: grade.id })
    .from(grade)
    .where(eq(grade.submissionId, submissionId))
    .limit(1);
  return Boolean(row);
}

/**
 * Queue status per student, in SQL so the filter and counts agree:
 * no submitted work → NOT_SUBMITTED; released → RELEASED; saved by a person → REVIEWED;
 * only AI has written → AI_DRAFTED; otherwise SUBMITTED (waiting to be graded).
 */
const queueStatusSql = sql<QueueStatus>`case
  when ${submission.id} is null or ${submission.status} = 'DRAFT' then 'NOT_SUBMITTED'
  when ${grade.status} = 'RELEASED' then 'RELEASED'
  when ${grade.gradedBy} is not null then 'REVIEWED'
  when ${grade.id} is not null then 'AI_DRAFTED'
  else 'SUBMITTED' end`;

export type QueueItem = {
  studentId: string;
  name: string;
  email: string;
  submissionId: string | null;
  submittedAt: Date | null;
  isLate: boolean | null;
  wordCount: number | null;
  totalScore: number | null;
  version: number | null;
  status: QueueStatus;
};

type QueueRef = { courseId: string; assignmentId: string };

/** Every student in the course, with their submission and grade for this assignment. */
const submissionJoin = (assignmentId: string) =>
  and(eq(submission.studentId, courseMember.userId), eq(submission.assignmentId, assignmentId));

const queueWhere = (courseId: string, filter: QueueStatus | null) =>
  and(
    eq(courseMember.courseId, courseId),
    eq(courseMember.role, "STUDENT"),
    filter ? sql`(${queueStatusSql}) = ${filter}` : undefined,
  );

export async function listGradingQueue(
  db: DbOrTx,
  { courseId, assignmentId }: QueueRef,
  filter: QueueStatus | null,
  pageRequest: PageRequest,
): Promise<Page<QueueItem>> {
  const { limit, offset } = pageWindow(pageRequest);
  const rows = await db
    .select({
      studentId: user.id,
      name: user.name,
      email: user.email,
      submissionId: submission.id,
      submissionStatus: submission.status,
      submittedAt: submission.submittedAt,
      isLate: submission.isLate,
      wordCount: submission.wordCount,
      totalScore: grade.totalScore,
      version: grade.version,
      status: queueStatusSql,
    })
    .from(courseMember)
    .innerJoin(user, eq(user.id, courseMember.userId))
    .leftJoin(submission, submissionJoin(assignmentId))
    .leftJoin(grade, eq(grade.submissionId, submission.id))
    .where(queueWhere(courseId, filter))
    .orderBy(asc(user.name), asc(user.id))
    .limit(limit)
    .offset(offset);
  // Unsubmitted drafts are the student's own work in progress: no link, no details.
  const items = rows.map(({ submissionStatus, ...r }) =>
    submissionStatus === "SUBMITTED"
      ? r
      : { ...r, submissionId: null, submittedAt: null, isLate: null, wordCount: null },
  );
  return toPage(items, pageRequest);
}

/** Tab counts for the queue (one grouped query). */
export async function countGradingQueue(
  db: DbOrTx,
  { courseId, assignmentId }: QueueRef,
): Promise<Record<QueueStatus, number>> {
  const rows = await db
    .select({ status: queueStatusSql, n: count() })
    .from(courseMember)
    .leftJoin(submission, submissionJoin(assignmentId))
    .leftJoin(grade, eq(grade.submissionId, submission.id))
    .where(queueWhere(courseId, null))
    .groupBy(queueStatusSql);
  const counts: Record<QueueStatus, number> = {
    NOT_SUBMITTED: 0,
    SUBMITTED: 0,
    AI_DRAFTED: 0,
    REVIEWED: 0,
    RELEASED: 0,
  };
  for (const r of rows) counts[r.status] = r.n;
  return counts;
}

/**
 * Draft grades a person has saved with every criterion scored: what "Release all" offers.
 * Capped so one release stays one small transaction.
 */
export async function listReleasable(db: DbOrTx, assignmentId: string, max: number) {
  const criteria = db
    .select({ n: count() })
    .from(rubricCriterion)
    .where(eq(rubricCriterion.assignmentId, assignmentId));
  return db
    .select({ submissionId: grade.submissionId, version: grade.version })
    .from(grade)
    .innerJoin(submission, eq(submission.id, grade.submissionId))
    .innerJoin(criterionScore, eq(criterionScore.gradeId, grade.id))
    .where(
      and(
        eq(submission.assignmentId, assignmentId),
        eq(grade.status, "DRAFT"),
        isNotNull(grade.gradedBy),
        isNotNull(criterionScore.levelId),
      ),
    )
    .groupBy(grade.id)
    .having(sql`count(*) = (${criteria})`)
    .orderBy(asc(grade.submissionId))
    .limit(max);
}

// ---------------------------------------------------------------------------
// Writes (callers authorize first; state rules are re-checked under row locks)
// ---------------------------------------------------------------------------

type SaveGradeServiceInput = {
  submissionId: string;
  actorId: string;
  /** The version the grader loaded; 0 means "no grade yet". */
  version: number;
  overallFeedback: string;
  scores: CriterionScoreInput[];
};

const STALE_MESSAGE =
  "Someone else saved this grade while you were editing. Reload to see the latest version.";

/**
 * Saves a draft grade and its criterion scores in one transaction, with optimistic locking.
 * Points come from the chosen level; the total is recomputed here. Released grades are
 * never changed (that is what regrades are for).
 */
export async function saveGrade(db: DbOrTx, input: SaveGradeServiceInput) {
  return db.transaction(async (tx) => {
    const [sub] = await tx
      .select({
        status: submission.status,
        assignmentId: submission.assignmentId,
        courseId: assignment.courseId,
      })
      .from(submission)
      .innerJoin(assignment, eq(assignment.id, submission.assignmentId))
      .where(eq(submission.id, input.submissionId))
      .for("share", { of: submission });
    if (!sub) throw new AppError("NOT_FOUND", "Submission not found.");
    if (sub.status !== "SUBMITTED") {
      throw new AppError("CONFLICT", "Only submitted work can be graded.");
    }

    // The rubric decides which criteria and levels exist, and each level's points.
    const levels = await tx
      .select({
        id: rubricLevel.id,
        criterionId: rubricLevel.criterionId,
        points: rubricLevel.points,
      })
      .from(rubricLevel)
      .innerJoin(rubricCriterion, eq(rubricCriterion.id, rubricLevel.criterionId))
      .where(eq(rubricCriterion.assignmentId, sub.assignmentId));
    const levelById = new Map(levels.map((l) => [l.id, l]));
    const criterionIds = new Set(levels.map((l) => l.criterionId));
    for (const s of input.scores) {
      if (!criterionIds.has(s.criterionId)) {
        throw new AppError("VALIDATION", "A score refers to a criterion outside this rubric.");
      }
      if (s.levelId !== null && levelById.get(s.levelId)?.criterionId !== s.criterionId) {
        throw new AppError("VALIDATION", "A score uses a level from a different criterion.");
      }
    }

    const [current] = await tx
      .select({ id: grade.id, status: grade.status, version: grade.version })
      .from(grade)
      .where(eq(grade.submissionId, input.submissionId))
      .for("update");

    let gradeId: string;
    let version: number;
    if (!current) {
      if (input.version !== 0) throw new AppError("CONFLICT", STALE_MESSAGE);
      const [created] = await tx
        .insert(grade)
        .values({ submissionId: input.submissionId, gradedBy: input.actorId })
        .onConflictDoNothing({ target: grade.submissionId })
        .returning({ id: grade.id });
      // Someone created it first (their insert committed while we waited).
      if (!created) throw new AppError("CONFLICT", STALE_MESSAGE);
      gradeId = created.id;
      version = 1;
    } else {
      if (current.status === "RELEASED") {
        throw new AppError(
          "CONFLICT",
          "This grade is released. It can only change through a regrade request.",
        );
      }
      if (current.version !== input.version) throw new AppError("CONFLICT", STALE_MESSAGE);
      gradeId = current.id;
      version = current.version + 1;
    }

    const existing = await tx
      .select({
        criterionId: criterionScore.criterionId,
        levelId: criterionScore.levelId,
        feedback: criterionScore.feedback,
        source: criterionScore.source,
      })
      .from(criterionScore)
      .where(eq(criterionScore.gradeId, gradeId));
    const existingBy = new Map(existing.map((e) => [e.criterionId, e]));

    // A cleared level removes the score; the rest are upserted with a derived source.
    const cleared = input.scores.filter((s) => s.levelId === null).map((s) => s.criterionId);
    if (cleared.length) {
      await tx
        .delete(criterionScore)
        .where(
          and(eq(criterionScore.gradeId, gradeId), inArray(criterionScore.criterionId, cleared)),
        );
    }
    const scored = input.scores.filter((s) => s.levelId !== null);
    if (scored.length) {
      await tx
        .insert(criterionScore)
        .values(
          scored.map((s) => ({
            gradeId,
            criterionId: s.criterionId,
            levelId: s.levelId,
            points: levelById.get(s.levelId!)!.points,
            feedback: s.feedback,
            source: nextScoreSource(existingBy.get(s.criterionId), s),
          })),
        )
        .onConflictDoUpdate({
          target: [criterionScore.gradeId, criterionScore.criterionId],
          set: {
            levelId: sql`excluded.level_id`,
            points: sql`excluded.points`,
            feedback: sql`excluded.feedback`,
            source: sql`excluded.source`,
            updatedAt: sql`now()`,
          },
        });
    }

    const [sum] = await tx
      .select({ total: sql<number>`coalesce(sum(${criterionScore.points}), 0)::int` })
      .from(criterionScore)
      .where(eq(criterionScore.gradeId, gradeId));
    const totalScore = sum?.total ?? 0;

    await tx
      .update(grade)
      .set({
        totalScore,
        overallFeedback: input.overallFeedback,
        gradedBy: input.actorId,
        version,
      })
      .where(eq(grade.id, gradeId));
    await tx.insert(auditLog).values({
      actorId: input.actorId,
      courseId: sub.courseId,
      action: "grade.saved",
      entityType: "grade",
      entityId: gradeId,
      metadata: { submissionId: input.submissionId, version, totalScore },
    });

    return { gradeId, version, totalScore, status: "DRAFT" as const };
  });
}

type ReleaseInput = {
  actorId: string;
  assignmentId: string;
  grades: { submissionId: string; version: number }[];
  now: Date;
};

/**
 * Releases the confirmed grades atomically: if any one is missing, already released,
 * unreviewed, incomplete or newer than the version shown, nothing is released.
 */
export async function releaseGrades(db: DbOrTx, input: ReleaseInput) {
  return db.transaction(async (tx) => {
    const ids = input.grades.map((g) => g.submissionId);
    const rows = await tx
      .select({
        id: grade.id,
        submissionId: grade.submissionId,
        status: grade.status,
        version: grade.version,
        gradedBy: grade.gradedBy,
        courseId: assignment.courseId,
      })
      .from(grade)
      .innerJoin(submission, eq(submission.id, grade.submissionId))
      .innerJoin(assignment, eq(assignment.id, submission.assignmentId))
      .where(and(inArray(grade.submissionId, ids), eq(submission.assignmentId, input.assignmentId)))
      .orderBy(asc(grade.id))
      .for("update", { of: grade });

    const bySubmission = new Map(rows.map((r) => [r.submissionId, r]));
    const criteria = await tx
      .select({ id: rubricCriterion.id })
      .from(rubricCriterion)
      .where(eq(rubricCriterion.assignmentId, input.assignmentId));
    const scores = rows.length
      ? await tx
          .select({
            gradeId: criterionScore.gradeId,
            criterionId: criterionScore.criterionId,
            levelId: criterionScore.levelId,
          })
          .from(criterionScore)
          .where(
            inArray(
              criterionScore.gradeId,
              rows.map((r) => r.id),
            ),
          )
      : [];

    for (const wanted of input.grades) {
      const row = bySubmission.get(wanted.submissionId);
      if (!row) throw new AppError("CONFLICT", "A selected submission has no grade to release.");
      if (row.status === "RELEASED") {
        throw new AppError("CONFLICT", "A selected grade has already been released.");
      }
      if (row.version !== wanted.version) throw new AppError("CONFLICT", STALE_MESSAGE);
      if (!row.gradedBy) {
        throw new AppError("CONFLICT", "An AI draft must be reviewed and saved before release.");
      }
      const missing = missingCriteria(
        criteria.map((c) => c.id),
        scores.filter((s) => s.gradeId === row.id),
      );
      if (missing.length) {
        throw new AppError("CONFLICT", "Score every criterion before releasing the grade.");
      }
    }

    await tx
      .update(grade)
      .set({ status: "RELEASED", releasedBy: input.actorId, releasedAt: input.now })
      .where(
        inArray(
          grade.id,
          rows.map((r) => r.id),
        ),
      );
    await tx.insert(auditLog).values(
      rows.map((r) => ({
        actorId: input.actorId,
        courseId: r.courseId,
        action: "grade.released",
        entityType: "grade",
        entityId: r.id,
        metadata: { submissionId: r.submissionId, version: r.version },
      })),
    );
    return { released: rows.length };
  });
}
