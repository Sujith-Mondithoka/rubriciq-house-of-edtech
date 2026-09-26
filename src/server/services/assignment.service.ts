import { and, asc, count, eq, inArray, isNull, ne } from "drizzle-orm";

import { AppError } from "@/lib/errors";
import { type Page, type PageRequest, pageWindow, toPage } from "@/lib/pagination";
import { rubricMaxScore, type RubricCriterionInput } from "@/lib/validation/assignment.schema";
import type { Member } from "@/server/authz/policy";
import type { DbOrTx, Tx } from "@/server/db/client";
import {
  assignment,
  auditLog,
  course,
  courseMember,
  rubricCriterion,
  rubricLevel,
  submission,
} from "@/server/db/schema";

import type { Course } from "./course.service";

export type Assignment = typeof assignment.$inferSelect;

/** An assignment, the course that owns it and the caller's membership (null if none). */
export type AssignmentAccess = { assignment: Assignment; course: Course; member: Member | null };

type AssignmentFields = {
  title: string;
  instructions: string;
  dueAt: Date;
  allowLate: boolean;
};

async function audit(
  db: DbOrTx,
  entry: { actorId: string; courseId: string; assignmentId: string; action: string },
) {
  await db.insert(auditLog).values({
    actorId: entry.actorId,
    courseId: entry.courseId,
    action: entry.action,
    entityType: "assignment",
    entityId: entry.assignmentId,
  });
}

/** Locks the assignment row for the rest of the transaction; soft-deleted rows are not found. */
async function lockAssignment(tx: Tx, assignmentId: string) {
  const [row] = await tx
    .select()
    .from(assignment)
    .where(and(eq(assignment.id, assignmentId), isNull(assignment.deletedAt)))
    .for("update");
  if (!row) throw new AppError("NOT_FOUND", "Assignment not found.");
  return row;
}

// ---------------------------------------------------------------------------
// Reads
// ---------------------------------------------------------------------------

/** Resolves the course from the assignment (never from a client-sent course id). */
export async function getAssignmentAccess(
  db: DbOrTx,
  assignmentId: string,
  userId: string,
): Promise<AssignmentAccess | null> {
  const [row] = await db
    .select({ assignment, course, role: courseMember.role })
    .from(assignment)
    .innerJoin(course, eq(course.id, assignment.courseId))
    .leftJoin(
      courseMember,
      and(eq(courseMember.courseId, course.id), eq(courseMember.userId, userId)),
    )
    .where(and(eq(assignment.id, assignmentId), isNull(assignment.deletedAt)))
    .limit(1);
  if (!row) return null;
  return {
    assignment: row.assignment,
    course: row.course,
    member: row.role ? { userId, role: row.role } : null,
  };
}

export async function hasSubmissions(db: DbOrTx, assignmentId: string): Promise<boolean> {
  const [row] = await db
    .select({ id: submission.id })
    .from(submission)
    .where(eq(submission.assignmentId, assignmentId))
    .limit(1);
  return Boolean(row);
}

export type AssignmentListItem = Pick<
  Assignment,
  "id" | "title" | "status" | "dueAt" | "allowLate" | "maxScore"
>;

/** Assignments in a course by due date. Students never see drafts. */
export async function listAssignments(
  db: DbOrTx,
  courseId: string,
  { includeDrafts }: { includeDrafts: boolean },
  pageRequest: PageRequest,
): Promise<Page<AssignmentListItem>> {
  const { limit, offset } = pageWindow(pageRequest);
  const rows = await db
    .select({
      id: assignment.id,
      title: assignment.title,
      status: assignment.status,
      dueAt: assignment.dueAt,
      allowLate: assignment.allowLate,
      maxScore: assignment.maxScore,
    })
    .from(assignment)
    .where(
      and(
        eq(assignment.courseId, courseId),
        isNull(assignment.deletedAt),
        includeDrafts ? undefined : ne(assignment.status, "DRAFT"),
      ),
    )
    .orderBy(asc(assignment.dueAt), asc(assignment.id))
    .limit(limit)
    .offset(offset);
  return toPage(rows, pageRequest);
}

export type RubricLevel = Pick<
  typeof rubricLevel.$inferSelect,
  "id" | "label" | "points" | "descriptor"
>;
export type RubricCriterion = Pick<
  typeof rubricCriterion.$inferSelect,
  "id" | "title" | "description"
> & { levels: RubricLevel[] };

/** The rubric in display order: two queries, no N+1. */
export async function getRubric(db: DbOrTx, assignmentId: string): Promise<RubricCriterion[]> {
  const criteria = await db
    .select({
      id: rubricCriterion.id,
      title: rubricCriterion.title,
      description: rubricCriterion.description,
    })
    .from(rubricCriterion)
    .where(eq(rubricCriterion.assignmentId, assignmentId))
    .orderBy(asc(rubricCriterion.position), asc(rubricCriterion.id));
  if (!criteria.length) return [];

  const levels = await db
    .select({
      id: rubricLevel.id,
      criterionId: rubricLevel.criterionId,
      label: rubricLevel.label,
      points: rubricLevel.points,
      descriptor: rubricLevel.descriptor,
    })
    .from(rubricLevel)
    .where(
      inArray(
        rubricLevel.criterionId,
        criteria.map((c) => c.id),
      ),
    )
    .orderBy(asc(rubricLevel.position), asc(rubricLevel.id));

  return criteria.map((c) => ({
    ...c,
    levels: levels
      .filter((l) => l.criterionId === c.id)
      .map(({ id, label, points, descriptor }) => ({ id, label, points, descriptor })),
  }));
}

// ---------------------------------------------------------------------------
// Writes (callers authorize first; state rules are re-checked under a row lock)
// ---------------------------------------------------------------------------

export async function createAssignment(
  db: DbOrTx,
  actorId: string,
  courseId: string,
  input: AssignmentFields,
) {
  const [created] = await db
    .insert(assignment)
    .values({ ...input, courseId, createdBy: actorId })
    .returning({ id: assignment.id });
  return created!;
}

export async function updateAssignment(db: DbOrTx, assignmentId: string, input: AssignmentFields) {
  await db.transaction(async (tx) => {
    const current = await lockAssignment(tx, assignmentId);
    if (current.status === "CLOSED") {
      throw new AppError("CONFLICT", "Closed assignments can no longer be edited.");
    }
    await tx.update(assignment).set(input).where(eq(assignment.id, assignmentId));
  });
}

/**
 * Replaces the whole rubric (criteria removed in the builder are hard-deleted, levels cascade)
 * and recomputes max_score. Only while DRAFT: the rubric locks on publish.
 */
export async function saveRubric(
  db: DbOrTx,
  assignmentId: string,
  criteria: RubricCriterionInput[],
) {
  return db.transaction(async (tx) => {
    const current = await lockAssignment(tx, assignmentId);
    if (current.status !== "DRAFT") {
      throw new AppError("CONFLICT", "The rubric is locked because the assignment is published.");
    }

    await tx.delete(rubricCriterion).where(eq(rubricCriterion.assignmentId, assignmentId));
    const inserted = await tx
      .insert(rubricCriterion)
      .values(
        criteria.map((c, position) => ({
          assignmentId,
          title: c.title,
          description: c.description,
          position,
        })),
      )
      .returning({ id: rubricCriterion.id });
    await tx.insert(rubricLevel).values(
      criteria.flatMap((c, ci) =>
        c.levels.map((l, position) => ({
          criterionId: inserted[ci]!.id,
          label: l.label,
          points: l.points,
          descriptor: l.descriptor,
          position,
        })),
      ),
    );

    const maxScore = rubricMaxScore(criteria);
    await tx.update(assignment).set({ maxScore }).where(eq(assignment.id, assignmentId));
    return { maxScore };
  });
}

export async function publishAssignment(
  db: DbOrTx,
  actorId: string,
  assignmentId: string,
  now: Date,
) {
  await db.transaction(async (tx) => {
    const current = await lockAssignment(tx, assignmentId);
    if (current.status !== "DRAFT") {
      throw new AppError("CONFLICT", "Only draft assignments can be published.");
    }
    const [criteria] = await tx
      .select({ n: count() })
      .from(rubricCriterion)
      .where(eq(rubricCriterion.assignmentId, assignmentId));
    if (!criteria?.n) {
      throw new AppError("CONFLICT", "Add a rubric with at least one criterion before publishing.");
    }
    if (current.dueAt <= now) {
      throw new AppError("CONFLICT", "The due date has passed. Move it to the future first.");
    }
    await tx
      .update(assignment)
      .set({ status: "PUBLISHED", publishedAt: now })
      .where(eq(assignment.id, assignmentId));
    await audit(tx, {
      actorId,
      courseId: current.courseId,
      assignmentId,
      action: "assignment.published",
    });
  });
}

/** Stops new submissions and edits. */
export async function closeAssignment(db: DbOrTx, actorId: string, assignmentId: string) {
  await db.transaction(async (tx) => {
    const current = await lockAssignment(tx, assignmentId);
    if (current.status !== "PUBLISHED") {
      throw new AppError("CONFLICT", "Only published assignments can be closed.");
    }
    await tx.update(assignment).set({ status: "CLOSED" }).where(eq(assignment.id, assignmentId));
    await audit(tx, {
      actorId,
      courseId: current.courseId,
      assignmentId,
      action: "assignment.closed",
    });
  });
}

/**
 * Hard delete, allowed only for a DRAFT with no submissions. Both conditions are re-checked
 * under the row lock; the rubric cascades.
 */
export async function deleteDraftAssignment(db: DbOrTx, actorId: string, assignmentId: string) {
  await db.transaction(async (tx) => {
    const current = await lockAssignment(tx, assignmentId);
    if (current.status !== "DRAFT") {
      throw new AppError("CONFLICT", "Only draft assignments can be deleted.");
    }
    if (await hasSubmissions(tx, assignmentId)) {
      throw new AppError("CONFLICT", "This assignment has submissions and cannot be deleted.");
    }
    await tx.delete(assignment).where(eq(assignment.id, assignmentId));
    await audit(tx, {
      actorId,
      courseId: current.courseId,
      assignmentId,
      action: "assignment.deleted",
    });
  });
}
