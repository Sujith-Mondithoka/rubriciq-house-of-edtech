import { and, asc, count, eq, isNotNull, isNull, max, min, ne, or, sql } from "drizzle-orm";

import type { DbOrTx } from "@/server/db/client";
import { assignment, criterionScore, grade, submission } from "@/server/db/schema";

import { getRubric } from "./assignment.service";

/** Grades a person has confirmed: reviewed drafts and released grades (unreviewed AI drafts are excluded). */
const confirmedGrade = or(eq(grade.status, "RELEASED"), isNotNull(grade.gradedBy));

export type LevelBucket = { levelId: string; label: string; points: number; count: number };

export type CriterionStats = {
  criterionId: string;
  title: string;
  maxPoints: number;
  scored: number;
  average: number | null;
  levels: LevelBucket[];
};

export type AssignmentAnalytics = {
  submitted: number;
  graded: number;
  released: number;
  maxScore: number;
  average: number | null;
  min: number | null;
  max: number | null;
  criteria: CriterionStats[];
};

const round1 = (n: number) => Math.round(n * 10) / 10;

/**
 * Per-criterion averages and level distributions for one assignment, over confirmed grades.
 * Four aggregate queries regardless of class size (no N+1).
 */
export async function getAssignmentAnalytics(
  db: DbOrTx,
  assignmentId: string,
  maxScore: number,
): Promise<AssignmentAnalytics> {
  const [rubric, [subs], [totals], levelRows] = await Promise.all([
    getRubric(db, assignmentId),
    db
      .select({ n: count() })
      .from(submission)
      .where(and(eq(submission.assignmentId, assignmentId), eq(submission.status, "SUBMITTED"))),
    db
      .select({
        graded: count(),
        released: sql<number>`count(*) filter (where ${grade.status} = 'RELEASED')::int`,
        average: sql<number | null>`avg(${grade.totalScore})::float`,
        min: min(grade.totalScore),
        max: max(grade.totalScore),
      })
      .from(grade)
      .innerJoin(submission, eq(submission.id, grade.submissionId))
      .where(and(eq(submission.assignmentId, assignmentId), confirmedGrade)),
    db
      .select({
        criterionId: criterionScore.criterionId,
        levelId: criterionScore.levelId,
        n: count(),
      })
      .from(criterionScore)
      .innerJoin(grade, eq(grade.id, criterionScore.gradeId))
      .innerJoin(submission, eq(submission.id, grade.submissionId))
      .where(
        and(
          eq(submission.assignmentId, assignmentId),
          confirmedGrade,
          isNotNull(criterionScore.levelId),
        ),
      )
      .groupBy(criterionScore.criterionId, criterionScore.levelId),
  ]);

  const countFor = new Map(levelRows.map((r) => [`${r.criterionId}:${r.levelId}`, r.n]));
  const criteria = rubric.map((c) => {
    const levels = [...c.levels]
      .sort((a, b) => a.points - b.points)
      .map((l) => ({
        levelId: l.id,
        label: l.label,
        points: l.points,
        count: countFor.get(`${c.id}:${l.id}`) ?? 0,
      }));
    const scored = levels.reduce((sum, l) => sum + l.count, 0);
    const sumPoints = levels.reduce((sum, l) => sum + l.count * l.points, 0);
    return {
      criterionId: c.id,
      title: c.title,
      maxPoints: Math.max(...c.levels.map((l) => l.points)),
      scored,
      average: scored ? round1(sumPoints / scored) : null,
      levels,
    };
  });

  const graded = totals?.graded ?? 0;
  return {
    submitted: subs?.n ?? 0,
    graded,
    released: totals?.released ?? 0,
    maxScore,
    average:
      graded && totals?.average !== null && totals?.average !== undefined
        ? round1(totals.average)
        : null,
    min: graded ? (totals?.min ?? null) : null,
    max: graded ? (totals?.max ?? null) : null,
    criteria,
  };
}

/** Published and closed assignments of a course, for the analytics picker (max 50). */
export async function listAnalyzableAssignments(db: DbOrTx, courseId: string) {
  return db
    .select({ id: assignment.id, title: assignment.title, maxScore: assignment.maxScore })
    .from(assignment)
    .where(
      and(
        eq(assignment.courseId, courseId),
        isNull(assignment.deletedAt),
        ne(assignment.status, "DRAFT"),
      ),
    )
    .orderBy(asc(assignment.dueAt), asc(assignment.id))
    .limit(50);
}
