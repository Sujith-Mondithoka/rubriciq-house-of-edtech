import { and, count, eq, inArray, isNull } from "drizzle-orm";

import { isLate } from "@/lib/dates";
import { AppError } from "@/lib/errors";
import { countWords } from "@/lib/text";
import type { Member } from "@/server/authz/policy";
import type { DbOrTx, Tx } from "@/server/db/client";
import { assignment, course, courseMember, grade, submission } from "@/server/db/schema";

export type Submission = typeof submission.$inferSelect;

/** What the student's own editor needs; never includes grading data. */
export type OwnSubmission = Pick<
  Submission,
  "id" | "content" | "wordCount" | "status" | "submittedAt" | "isLate" | "updatedAt"
>;

const ownColumns = {
  id: submission.id,
  content: submission.content,
  wordCount: submission.wordCount,
  status: submission.status,
  submittedAt: submission.submittedAt,
  isLate: submission.isLate,
  updatedAt: submission.updatedAt,
};

// ---------------------------------------------------------------------------
// Reads
// ---------------------------------------------------------------------------

export async function getOwnSubmission(
  db: DbOrTx,
  assignmentId: string,
  studentId: string,
): Promise<OwnSubmission | null> {
  const [row] = await db
    .select(ownColumns)
    .from(submission)
    .where(and(eq(submission.assignmentId, assignmentId), eq(submission.studentId, studentId)))
    .limit(1);
  return row ?? null;
}

/** The student's own status per assignment, for a list page (one query). */
export async function getOwnSubmissionStatuses(
  db: DbOrTx,
  studentId: string,
  assignmentIds: string[],
) {
  if (!assignmentIds.length) return new Map<string, Pick<Submission, "status" | "isLate">>();
  const rows = await db
    .select({
      assignmentId: submission.assignmentId,
      status: submission.status,
      isLate: submission.isLate,
    })
    .from(submission)
    .where(
      and(eq(submission.studentId, studentId), inArray(submission.assignmentId, assignmentIds)),
    );
  return new Map(rows.map((r) => [r.assignmentId, { status: r.status, isLate: r.isLate }]));
}

export type SubmissionCounts = { submitted: number; late: number; drafts: number };

/** Submission counts per assignment for staff (one grouped query). */
export async function countSubmissions(db: DbOrTx, assignmentIds: string[]) {
  const counts = new Map<string, SubmissionCounts>();
  if (!assignmentIds.length) return counts;
  const rows = await db
    .select({
      assignmentId: submission.assignmentId,
      status: submission.status,
      isLate: submission.isLate,
      n: count(),
    })
    .from(submission)
    .where(inArray(submission.assignmentId, assignmentIds))
    .groupBy(submission.assignmentId, submission.status, submission.isLate);
  for (const r of rows) {
    const c = counts.get(r.assignmentId) ?? { submitted: 0, late: 0, drafts: 0 };
    if (r.status === "DRAFT") c.drafts += r.n;
    else {
      c.submitted += r.n;
      if (r.isLate) c.late += r.n;
    }
    counts.set(r.assignmentId, c);
  }
  return counts;
}

/** A submission with its assignment, owning course and the caller's membership. */
export async function getSubmissionAccess(db: DbOrTx, submissionId: string, userId: string) {
  const [row] = await db
    .select({ submission, assignment, course, role: courseMember.role })
    .from(submission)
    .innerJoin(assignment, eq(assignment.id, submission.assignmentId))
    .innerJoin(course, eq(course.id, assignment.courseId))
    .leftJoin(
      courseMember,
      and(eq(courseMember.courseId, course.id), eq(courseMember.userId, userId)),
    )
    .where(and(eq(submission.id, submissionId), isNull(assignment.deletedAt)))
    .limit(1);
  if (!row) return null;
  const member: Member | null = row.role ? { userId, role: row.role } : null;
  return { submission: row.submission, assignment: row.assignment, course: row.course, member };
}

// ---------------------------------------------------------------------------
// Writes (callers authorize first; deadline and status are re-checked here)
// ---------------------------------------------------------------------------

/**
 * Takes a shared lock on the assignment so closing it (FOR UPDATE) cannot interleave with a
 * save, then re-checks that the student may still write.
 */
async function lockOpenAssignment(tx: Tx, assignmentId: string, now: Date) {
  const [row] = await tx
    .select({
      status: assignment.status,
      dueAt: assignment.dueAt,
      allowLate: assignment.allowLate,
    })
    .from(assignment)
    .where(and(eq(assignment.id, assignmentId), isNull(assignment.deletedAt)))
    .for("share");
  if (!row) throw new AppError("NOT_FOUND", "Assignment not found.");
  if (row.status !== "PUBLISHED") {
    throw new AppError("CONFLICT", "This assignment is closed to submissions.");
  }
  if (!row.allowLate && isLate(now, row.dueAt)) {
    throw new AppError(
      "CONFLICT",
      "The deadline has passed and late submissions are not accepted.",
    );
  }
  return row;
}

type WriteInput = { assignmentId: string; studentId: string; content: string; now: Date };

/** Autosave: creates or updates the student's DRAFT. A submitted piece is only changed by resubmitting. */
export async function saveDraft(db: DbOrTx, input: WriteInput) {
  return db.transaction(async (tx) => {
    await lockOpenAssignment(tx, input.assignmentId, input.now);
    const wordCount = countWords(input.content);
    const [saved] = await tx
      .insert(submission)
      .values({
        assignmentId: input.assignmentId,
        studentId: input.studentId,
        content: input.content,
        wordCount,
      })
      .onConflictDoUpdate({
        target: [submission.assignmentId, submission.studentId],
        set: { content: input.content, wordCount, updatedAt: input.now },
        setWhere: eq(submission.status, "DRAFT"),
      })
      .returning(ownColumns);
    if (!saved) {
      throw new AppError(
        "CONFLICT",
        "You have already submitted. Use Resubmit to update your submission.",
      );
    }
    return saved;
  });
}

/** Submit or resubmit. The late flag and word count are computed here, never by the client. */
export async function submitSubmission(db: DbOrTx, input: WriteInput) {
  return db.transaction(async (tx) => {
    const open = await lockOpenAssignment(tx, input.assignmentId, input.now);
    const [graded] = await tx
      .select({ id: grade.id })
      .from(grade)
      .innerJoin(submission, eq(submission.id, grade.submissionId))
      .where(
        and(
          eq(submission.assignmentId, input.assignmentId),
          eq(submission.studentId, input.studentId),
        ),
      )
      .limit(1);
    if (graded) {
      throw new AppError(
        "CONFLICT",
        "Grading has started, so this submission can no longer change.",
      );
    }

    const values = {
      content: input.content,
      wordCount: countWords(input.content),
      status: "SUBMITTED" as const,
      submittedAt: input.now,
      isLate: isLate(input.now, open.dueAt),
    };
    const [saved] = await tx
      .insert(submission)
      .values({ assignmentId: input.assignmentId, studentId: input.studentId, ...values })
      .onConflictDoUpdate({
        target: [submission.assignmentId, submission.studentId],
        set: { ...values, updatedAt: input.now },
      })
      .returning(ownColumns);
    return saved!;
  });
}

/** Hard delete of the student's own unsubmitted draft; re-checked in the delete itself. */
export async function deleteOwnDraft(db: DbOrTx, submissionId: string, studentId: string) {
  const deleted = await db
    .delete(submission)
    .where(
      and(
        eq(submission.id, submissionId),
        eq(submission.studentId, studentId),
        eq(submission.status, "DRAFT"),
      ),
    )
    .returning({ id: submission.id });
  if (!deleted.length) {
    throw new AppError("CONFLICT", "Only an unsubmitted draft can be deleted.");
  }
}
