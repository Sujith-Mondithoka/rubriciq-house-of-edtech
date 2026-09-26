import { and, asc, count, desc, eq, inArray, isNull, ne, sql } from "drizzle-orm";

import { AppError, isUniqueViolation } from "@/lib/errors";
import { nextScoreSource } from "@/lib/grading";
import { type Page, type PageRequest, pageWindow, toPage } from "@/lib/pagination";
import type { RegradeFilter } from "@/lib/validation/regrade.schema";
import { type Member, REGRADE_WINDOW_MS } from "@/server/authz/policy";
import type { DbOrTx } from "@/server/db/client";
import {
  assignment,
  auditLog,
  course,
  courseMember,
  criterionScore,
  grade,
  regradeRequest,
  rubricCriterion,
  rubricLevel,
  submission,
  user,
} from "@/server/db/schema";

export type Regrade = typeof regradeRequest.$inferSelect;

/** The request as the student and the grader see it. */
export type RegradeView = Pick<
  Regrade,
  "id" | "criterionId" | "reason" | "status" | "response" | "createdAt" | "resolvedAt"
>;

const viewColumns = {
  id: regradeRequest.id,
  criterionId: regradeRequest.criterionId,
  reason: regradeRequest.reason,
  status: regradeRequest.status,
  response: regradeRequest.response,
  createdAt: regradeRequest.createdAt,
  resolvedAt: regradeRequest.resolvedAt,
};

export function regradeDeadline(releasedAt: Date): Date {
  return new Date(releasedAt.getTime() + REGRADE_WINDOW_MS);
}

// ---------------------------------------------------------------------------
// Reads
// ---------------------------------------------------------------------------

export async function getRegradeForSubmission(
  db: DbOrTx,
  submissionId: string,
): Promise<RegradeView | null> {
  const [row] = await db
    .select(viewColumns)
    .from(regradeRequest)
    .innerJoin(grade, eq(grade.id, regradeRequest.gradeId))
    .where(eq(grade.submissionId, submissionId))
    .limit(1);
  return row ?? null;
}

/** A request with the course that owns it (via grade → submission → assignment) and the caller's role. */
export async function getRegradeAccess(db: DbOrTx, regradeId: string, userId: string) {
  const [row] = await db
    .select({
      regrade: regradeRequest,
      submissionId: submission.id,
      assignmentId: assignment.id,
      course,
      role: courseMember.role,
    })
    .from(regradeRequest)
    .innerJoin(grade, eq(grade.id, regradeRequest.gradeId))
    .innerJoin(submission, eq(submission.id, grade.submissionId))
    .innerJoin(assignment, eq(assignment.id, submission.assignmentId))
    .innerJoin(course, eq(course.id, assignment.courseId))
    .leftJoin(
      courseMember,
      and(eq(courseMember.courseId, course.id), eq(courseMember.userId, userId)),
    )
    .where(and(eq(regradeRequest.id, regradeId), isNull(assignment.deletedAt)))
    .limit(1);
  if (!row) return null;
  const member: Member | null = row.role ? { userId, role: row.role } : null;
  return { ...row, member };
}

export type RegradeListItem = {
  id: string;
  status: Regrade["status"];
  reason: string;
  createdAt: Date;
  resolvedAt: Date | null;
  studentName: string;
  criterionTitle: string | null;
  submissionId: string;
};

const filterWhere = (filter: RegradeFilter) =>
  filter === "OPEN" ? eq(regradeRequest.status, "OPEN") : ne(regradeRequest.status, "OPEN");

/** Regrade requests for an assignment, oldest open first (one joined query). */
export async function listRegrades(
  db: DbOrTx,
  assignmentId: string,
  filter: RegradeFilter,
  pageRequest: PageRequest,
): Promise<Page<RegradeListItem>> {
  const { limit, offset } = pageWindow(pageRequest);
  const rows = await db
    .select({
      id: regradeRequest.id,
      status: regradeRequest.status,
      reason: regradeRequest.reason,
      createdAt: regradeRequest.createdAt,
      resolvedAt: regradeRequest.resolvedAt,
      studentName: user.name,
      criterionTitle: rubricCriterion.title,
      submissionId: submission.id,
    })
    .from(regradeRequest)
    .innerJoin(grade, eq(grade.id, regradeRequest.gradeId))
    .innerJoin(submission, eq(submission.id, grade.submissionId))
    .innerJoin(user, eq(user.id, regradeRequest.studentId))
    .leftJoin(rubricCriterion, eq(rubricCriterion.id, regradeRequest.criterionId))
    .where(and(eq(submission.assignmentId, assignmentId), filterWhere(filter)))
    .orderBy(
      filter === "OPEN" ? asc(regradeRequest.createdAt) : desc(regradeRequest.resolvedAt),
      asc(regradeRequest.id),
    )
    .limit(limit)
    .offset(offset);
  return toPage(rows, pageRequest);
}

export async function countRegrades(db: DbOrTx, assignmentId: string) {
  const rows = await db
    .select({ open: sql<boolean>`${regradeRequest.status} = 'OPEN'`, n: count() })
    .from(regradeRequest)
    .innerJoin(grade, eq(grade.id, regradeRequest.gradeId))
    .innerJoin(submission, eq(submission.id, grade.submissionId))
    .where(eq(submission.assignmentId, assignmentId))
    .groupBy(sql`${regradeRequest.status} = 'OPEN'`);
  return {
    OPEN: rows.find((r) => r.open)?.n ?? 0,
    RESOLVED: rows.find((r) => !r.open)?.n ?? 0,
  };
}

export type HistoryEntry = {
  id: string;
  action: string;
  actorName: string | null;
  createdAt: Date;
  metadata: Record<string, unknown> | null;
};

/** The audit trail of one grade (and its regrade request), newest first, for staff. */
export async function getGradeHistory(db: DbOrTx, gradeId: string, regradeId: string | null) {
  const ids = regradeId ? [gradeId, regradeId] : [gradeId];
  return db
    .select({
      id: auditLog.id,
      action: auditLog.action,
      actorName: user.name,
      createdAt: auditLog.createdAt,
      metadata: auditLog.metadata,
    })
    .from(auditLog)
    .leftJoin(user, eq(user.id, auditLog.actorId))
    .where(and(inArray(auditLog.entityType, ["grade", "regrade"]), inArray(auditLog.entityId, ids)))
    .orderBy(desc(auditLog.createdAt), desc(auditLog.id))
    .limit(50);
}

// ---------------------------------------------------------------------------
// Writes (callers authorize first; state rules are re-checked under row locks)
// ---------------------------------------------------------------------------

type CreateInput = {
  submissionId: string;
  studentId: string;
  criterionId: string | null;
  reason: string;
  now: Date;
};

/** One request per grade, only on a released grade and within 7 days of release. */
export async function createRegrade(db: DbOrTx, input: CreateInput) {
  return db.transaction(async (tx) => {
    const [g] = await tx
      .select({
        id: grade.id,
        status: grade.status,
        releasedAt: grade.releasedAt,
        studentId: submission.studentId,
        assignmentId: submission.assignmentId,
        courseId: assignment.courseId,
      })
      .from(grade)
      .innerJoin(submission, eq(submission.id, grade.submissionId))
      .innerJoin(assignment, eq(assignment.id, submission.assignmentId))
      .where(eq(grade.submissionId, input.submissionId))
      .for("share", { of: grade });
    if (!g || g.studentId !== input.studentId) throw new AppError("NOT_FOUND", "Grade not found.");
    if (g.status !== "RELEASED" || !g.releasedAt) {
      throw new AppError("CONFLICT", "You can ask for a regrade once your grade is released.");
    }
    if (input.now.getTime() > regradeDeadline(g.releasedAt).getTime()) {
      throw new AppError("CONFLICT", "The 7-day regrade window has closed.");
    }
    if (input.criterionId) {
      const [c] = await tx
        .select({ id: rubricCriterion.id })
        .from(rubricCriterion)
        .where(
          and(
            eq(rubricCriterion.id, input.criterionId),
            eq(rubricCriterion.assignmentId, g.assignmentId),
          ),
        );
      if (!c) {
        const message = "Choose a criterion from this rubric.";
        throw new AppError("VALIDATION", message, { criterionId: [message] });
      }
    }

    let created: { id: string } | undefined;
    try {
      [created] = await tx
        .insert(regradeRequest)
        .values({
          gradeId: g.id,
          studentId: input.studentId,
          criterionId: input.criterionId,
          reason: input.reason,
          createdAt: input.now,
        })
        .returning({ id: regradeRequest.id });
    } catch (error) {
      if (isUniqueViolation(error)) {
        throw new AppError("CONFLICT", "You have already asked for a regrade of this grade.");
      }
      throw error;
    }
    await tx.insert(auditLog).values({
      actorId: input.studentId,
      courseId: g.courseId,
      action: "regrade.requested",
      entityType: "regrade",
      entityId: created!.id,
      metadata: { gradeId: g.id, criterionId: input.criterionId },
    });
    return { regradeId: created!.id };
  });
}

type ResolveInput = {
  regradeId: string;
  actorId: string;
  decision: "ACCEPTED" | "REJECTED";
  response: string;
  version: number;
  changes: { criterionId: string; levelId: string }[];
  now: Date;
};

/**
 * Resolves an open request. Accepting changes the released grade: the only way a released
 * grade ever changes. Both the score change and the decision are audited.
 */
export async function resolveRegrade(db: DbOrTx, input: ResolveInput) {
  return db.transaction(async (tx) => {
    const [r] = await tx
      .select({
        id: regradeRequest.id,
        status: regradeRequest.status,
        gradeId: regradeRequest.gradeId,
      })
      .from(regradeRequest)
      .where(eq(regradeRequest.id, input.regradeId))
      .for("update");
    if (!r) throw new AppError("NOT_FOUND", "Regrade request not found.");
    if (r.status !== "OPEN") throw new AppError("CONFLICT", "This request is already resolved.");

    const [g] = await tx
      .select({
        id: grade.id,
        version: grade.version,
        totalScore: grade.totalScore,
        assignmentId: submission.assignmentId,
        courseId: assignment.courseId,
      })
      .from(grade)
      .innerJoin(submission, eq(submission.id, grade.submissionId))
      .innerJoin(assignment, eq(assignment.id, submission.assignmentId))
      .where(eq(grade.id, r.gradeId))
      .for("update", { of: grade });
    if (!g) throw new AppError("NOT_FOUND", "Grade not found.");
    if (g.version !== input.version) {
      throw new AppError(
        "CONFLICT",
        "This grade changed while you were reviewing. Reload and try again.",
      );
    }

    let totalScore = g.totalScore;
    if (input.decision === "ACCEPTED") {
      const levels = await tx
        .select({
          id: rubricLevel.id,
          criterionId: rubricLevel.criterionId,
          points: rubricLevel.points,
        })
        .from(rubricLevel)
        .innerJoin(rubricCriterion, eq(rubricCriterion.id, rubricLevel.criterionId))
        .where(eq(rubricCriterion.assignmentId, g.assignmentId));
      const levelById = new Map(levels.map((l) => [l.id, l]));
      for (const c of input.changes) {
        if (levelById.get(c.levelId)?.criterionId !== c.criterionId) {
          throw new AppError("VALIDATION", "A change uses a level from a different criterion.");
        }
      }
      const existing = await tx
        .select({
          criterionId: criterionScore.criterionId,
          levelId: criterionScore.levelId,
          points: criterionScore.points,
          feedback: criterionScore.feedback,
          source: criterionScore.source,
        })
        .from(criterionScore)
        .where(eq(criterionScore.gradeId, g.id));
      const before = new Map(existing.map((e) => [e.criterionId, e]));
      const changed = input.changes.filter((c) => before.get(c.criterionId)?.levelId !== c.levelId);
      if (!changed.length) {
        throw new AppError(
          "VALIDATION",
          "Change at least one level to accept, or reject the request.",
        );
      }
      for (const c of changed) {
        const old = before.get(c.criterionId);
        await tx
          .insert(criterionScore)
          .values({
            gradeId: g.id,
            criterionId: c.criterionId,
            levelId: c.levelId,
            points: levelById.get(c.levelId)!.points,
            feedback: old?.feedback ?? "",
            source: nextScoreSource(old, { levelId: c.levelId, feedback: old?.feedback ?? "" }),
          })
          .onConflictDoUpdate({
            target: [criterionScore.gradeId, criterionScore.criterionId],
            set: {
              levelId: sql`excluded.level_id`,
              points: sql`excluded.points`,
              source: sql`excluded.source`,
              updatedAt: sql`now()`,
            },
          });
      }
      const [sum] = await tx
        .select({ total: sql<number>`coalesce(sum(${criterionScore.points}), 0)::int` })
        .from(criterionScore)
        .where(eq(criterionScore.gradeId, g.id));
      totalScore = sum?.total ?? 0;
      await tx
        .update(grade)
        .set({ totalScore, version: g.version + 1 })
        .where(eq(grade.id, g.id));
      await tx.insert(auditLog).values({
        actorId: input.actorId,
        courseId: g.courseId,
        action: "grade.regraded",
        entityType: "grade",
        entityId: g.id,
        metadata: {
          regradeId: r.id,
          totalBefore: g.totalScore,
          totalAfter: totalScore,
          changes: changed.map((c) => ({
            criterionId: c.criterionId,
            from: before.get(c.criterionId)?.points ?? null,
            to: levelById.get(c.levelId)!.points,
          })),
        },
      });
    }

    await tx
      .update(regradeRequest)
      .set({
        status: input.decision,
        response: input.response,
        resolvedBy: input.actorId,
        resolvedAt: input.now,
      })
      .where(eq(regradeRequest.id, r.id));
    await tx.insert(auditLog).values({
      actorId: input.actorId,
      courseId: g.courseId,
      action: "regrade.resolved",
      entityType: "regrade",
      entityId: r.id,
      metadata: { decision: input.decision, gradeId: g.id },
    });
    return { status: input.decision, totalScore };
  });
}
