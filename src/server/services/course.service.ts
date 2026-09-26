import { randomInt } from "node:crypto";

import { and, asc, count, desc, eq, inArray, isNotNull, isNull, sql } from "drizzle-orm";

import { AppError, isUniqueViolation } from "@/lib/errors";
import { type Page, type PageRequest, pageWindow, toPage } from "@/lib/pagination";
import {
  JOIN_CODE_ALPHABET,
  JOIN_CODE_LENGTH,
  type CreateCourseInput,
} from "@/lib/validation/course.schema";
import type { CourseState, Member, Role } from "@/server/authz/policy";
import type { DbOrTx } from "@/server/db/client";
import { auditLog, course, courseMember, user } from "@/server/db/schema";

export type Course = typeof course.$inferSelect;

/** The course that owns a resource, plus the caller's membership in it (null if none). */
export type CourseAccess = { course: Course; member: Member | null };

export function courseState(c: Pick<Course, "archivedAt" | "aiEnabled">): CourseState {
  return { archived: c.archivedAt !== null, aiEnabled: c.aiEnabled };
}

export function generateJoinCode(): string {
  let code = "";
  for (let i = 0; i < JOIN_CODE_LENGTH; i++) {
    code += JOIN_CODE_ALPHABET[randomInt(JOIN_CODE_ALPHABET.length)];
  }
  return code;
}

const JOIN_CODE_ATTEMPTS = 5;

/** Retries `write` with a fresh code if it collides with an existing join code. */
async function withUniqueJoinCode<T>(write: (joinCode: string) => Promise<T>): Promise<T> {
  for (let attempt = 1; ; attempt++) {
    try {
      return await write(generateJoinCode());
    } catch (error) {
      if (attempt >= JOIN_CODE_ATTEMPTS || !isUniqueViolation(error, "course_join_code_unique")) {
        throw error;
      }
    }
  }
}

async function audit(
  db: DbOrTx,
  entry: { actorId: string; courseId: string; action: string; metadata?: Record<string, unknown> },
) {
  await db.insert(auditLog).values({
    ...entry,
    entityType: "course",
    entityId: entry.courseId,
  });
}

// ---------------------------------------------------------------------------
// Reads
// ---------------------------------------------------------------------------

export async function getCourseAccess(
  db: DbOrTx,
  courseId: string,
  userId: string,
): Promise<CourseAccess | null> {
  const [row] = await db
    .select({ course, role: courseMember.role })
    .from(course)
    .leftJoin(
      courseMember,
      and(eq(courseMember.courseId, course.id), eq(courseMember.userId, userId)),
    )
    .where(eq(course.id, courseId))
    .limit(1);
  if (!row) return null;
  return { course: row.course, member: row.role ? { userId, role: row.role } : null };
}

export type CourseListItem = {
  id: string;
  name: string;
  description: string | null;
  role: Role;
  archivedAt: Date | null;
  memberCount: number;
};

/** Courses the user belongs to, newest first. `archived` switches between the two tabs. */
export async function listMyCourses(
  db: DbOrTx,
  userId: string,
  { archived }: { archived: boolean },
  pageRequest: PageRequest,
): Promise<Page<CourseListItem>> {
  const { limit, offset } = pageWindow(pageRequest);
  const rows = await db
    .select({
      id: course.id,
      name: course.name,
      description: course.description,
      role: courseMember.role,
      archivedAt: course.archivedAt,
    })
    .from(courseMember)
    .innerJoin(course, eq(course.id, courseMember.courseId))
    .where(
      and(
        eq(courseMember.userId, userId),
        archived ? isNotNull(course.archivedAt) : isNull(course.archivedAt),
      ),
    )
    .orderBy(desc(course.createdAt), desc(course.id))
    .limit(limit)
    .offset(offset);

  const page = toPage(rows, pageRequest);
  const counts = page.items.length
    ? await db
        .select({ courseId: courseMember.courseId, n: count() })
        .from(courseMember)
        .where(
          inArray(
            courseMember.courseId,
            page.items.map((c) => c.id),
          ),
        )
        .groupBy(courseMember.courseId)
    : [];
  const countById = new Map(counts.map((c) => [c.courseId, c.n]));

  return {
    ...page,
    items: page.items.map((c) => ({ ...c, memberCount: countById.get(c.id) ?? 0 })),
  };
}

export type MemberListItem = {
  id: string;
  userId: string;
  name: string;
  email: string;
  role: Role;
  joinedAt: Date;
};

const roleOrder = sql`case ${courseMember.role} when 'INSTRUCTOR' then 0 when 'TA' then 1 else 2 end`;

export async function listMembers(
  db: DbOrTx,
  courseId: string,
  pageRequest: PageRequest,
): Promise<Page<MemberListItem>> {
  const { limit, offset } = pageWindow(pageRequest);
  const rows = await db
    .select({
      id: courseMember.id,
      userId: user.id,
      name: user.name,
      email: user.email,
      role: courseMember.role,
      joinedAt: courseMember.createdAt,
    })
    .from(courseMember)
    .innerJoin(user, eq(user.id, courseMember.userId))
    .where(eq(courseMember.courseId, courseId))
    .orderBy(roleOrder, asc(user.name), asc(courseMember.id))
    .limit(limit)
    .offset(offset);
  return toPage(rows, pageRequest);
}

export async function countMembersByRole(db: DbOrTx, courseId: string) {
  const rows = await db
    .select({ role: courseMember.role, n: count() })
    .from(courseMember)
    .where(eq(courseMember.courseId, courseId))
    .groupBy(courseMember.role);
  const counts: Record<Role, number> = { INSTRUCTOR: 0, TA: 0, STUDENT: 0 };
  for (const r of rows) counts[r.role] = r.n;
  return counts;
}

// ---------------------------------------------------------------------------
// Writes (callers authorize first; see course.handlers.ts)
// ---------------------------------------------------------------------------

/** Creates the course and makes its creator the Instructor, atomically. */
export async function createCourse(db: DbOrTx, userId: string, input: CreateCourseInput) {
  return withUniqueJoinCode((joinCode) =>
    db.transaction(async (tx) => {
      const [created] = await tx
        .insert(course)
        .values({
          name: input.name,
          description: input.description || null,
          joinCode,
          createdBy: userId,
        })
        .returning();
      await tx.insert(courseMember).values({ courseId: created!.id, userId, role: "INSTRUCTOR" });
      return created!;
    }),
  );
}

export async function updateCourse(
  db: DbOrTx,
  courseId: string,
  input: { name: string; description: string },
) {
  await db
    .update(course)
    .set({ name: input.name, description: input.description || null })
    .where(eq(course.id, courseId));
}

/** Joins an active course as a Student. Joining a course you are already in is a no-op. */
export async function joinCourseByCode(db: DbOrTx, userId: string, joinCode: string) {
  const [target] = await db
    .select({ id: course.id, name: course.name })
    .from(course)
    .where(and(eq(course.joinCode, joinCode), isNull(course.archivedAt)))
    .limit(1);
  if (!target) {
    throw new AppError("NOT_FOUND", "No active course uses that join code.", {
      joinCode: ["No active course uses that join code."],
    });
  }

  const inserted = await db
    .insert(courseMember)
    .values({ courseId: target.id, userId, role: "STUDENT" })
    .onConflictDoNothing({ target: [courseMember.courseId, courseMember.userId] })
    .returning({ id: courseMember.id });

  return { courseId: target.id, courseName: target.name, alreadyMember: inserted.length === 0 };
}

export async function regenerateJoinCode(db: DbOrTx, actorId: string, courseId: string) {
  return withUniqueJoinCode((joinCode) =>
    db.transaction(async (tx) => {
      await tx.update(course).set({ joinCode }).where(eq(course.id, courseId));
      await audit(tx, { actorId, courseId, action: "course.join_code_regenerated" });
      return joinCode;
    }),
  );
}

export async function setCourseAiEnabled(
  db: DbOrTx,
  actorId: string,
  courseId: string,
  aiEnabled: boolean,
) {
  await db.transaction(async (tx) => {
    await tx.update(course).set({ aiEnabled }).where(eq(course.id, courseId));
    await audit(tx, { actorId, courseId, action: "course.ai_toggled", metadata: { aiEnabled } });
  });
}

/** Courses are archived, never hard-deleted. Archiving twice is a no-op. */
export async function archiveCourse(db: DbOrTx, actorId: string, courseId: string, now: Date) {
  await db.transaction(async (tx) => {
    const archived = await tx
      .update(course)
      .set({ archivedAt: now })
      .where(and(eq(course.id, courseId), isNull(course.archivedAt)))
      .returning({ id: course.id });
    if (archived.length) await audit(tx, { actorId, courseId, action: "course.archived" });
  });
}

/** Adds an existing account as a TA. The person must already have signed up. */
export async function addTaByEmail(db: DbOrTx, actorId: string, courseId: string, email: string) {
  const [target] = await db
    .select({ id: user.id, name: user.name })
    .from(user)
    .where(eq(user.email, email))
    .limit(1);
  if (!target) {
    throw new AppError("NOT_FOUND", "No account uses that email. Ask them to sign up first.", {
      email: ["No account uses that email. Ask them to sign up first."],
    });
  }

  return db.transaction(async (tx) => {
    const inserted = await tx
      .insert(courseMember)
      .values({ courseId, userId: target.id, role: "TA" })
      .onConflictDoNothing({ target: [courseMember.courseId, courseMember.userId] })
      .returning({ id: courseMember.id });
    if (!inserted.length) {
      const message = "That person is already a member of this course.";
      throw new AppError("CONFLICT", message, { email: [message] });
    }
    await audit(tx, {
      actorId,
      courseId,
      action: "course.ta_added",
      metadata: { userId: target.id },
    });
    return { memberId: inserted[0]!.id, name: target.name };
  });
}

export async function getMembership(db: DbOrTx, memberId: string) {
  const [row] = await db
    .select({ id: courseMember.id, courseId: courseMember.courseId, userId: courseMember.userId })
    .from(courseMember)
    .where(eq(courseMember.id, memberId))
    .limit(1);
  return row ?? null;
}

/**
 * Removes a TA or a student. The Instructor cannot be removed (the course would be orphaned).
 * Their submissions and grades stay; only the membership goes.
 */
export async function removeMember(db: DbOrTx, actorId: string, memberId: string) {
  await db.transaction(async (tx) => {
    const [removed] = await tx
      .delete(courseMember)
      .where(and(eq(courseMember.id, memberId), inArray(courseMember.role, ["TA", "STUDENT"])))
      .returning({
        courseId: courseMember.courseId,
        userId: courseMember.userId,
        role: courseMember.role,
      });
    if (!removed) {
      throw new AppError("CONFLICT", "The course instructor cannot be removed.");
    }
    await audit(tx, {
      actorId,
      courseId: removed.courseId,
      action: "course.member_removed",
      metadata: { userId: removed.userId, role: removed.role },
    });
  });
}
