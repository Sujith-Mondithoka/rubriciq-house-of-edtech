/**
 * The permission table from CLAUDE.md as one pure function. No I/O and no Next.js imports:
 * callers load the membership and resource state, then ask `can(member, action, resource)`.
 *
 * Services still re-check state-based conditions (rubric lock, delete conditions, ...)
 * inside their transactions; this layer decides who may try.
 */

export type Role = "INSTRUCTOR" | "TA" | "STUDENT";
export type AssignmentStatus = "DRAFT" | "PUBLISHED" | "CLOSED";
export type SubmissionStatus = "DRAFT" | "SUBMITTED";
export type GradeStatus = "DRAFT" | "RELEASED";
export type RegradeStatus = "OPEN" | "ACCEPTED" | "REJECTED";

/** The signed-in user's membership in the course that owns the resource (null if none). */
export type Member = { userId: string; role: Role };

/** Archived courses are read-only. */
export type CourseState = { archived: boolean; aiEnabled: boolean };

export const REGRADE_WINDOW_MS = 7 * 24 * 60 * 60 * 1000;

type WithCourse<T = object> = { course: CourseState } & T;

/** The resource state each action needs. The course is always the one owning the resource. */
export type PolicyResources = {
  /** See the course, its published assignments and the member list. */
  "course:view": WithCourse;
  /** Edit or archive the course, regenerate the join code, toggle AI. */
  "course:manage": WithCourse;
  /** Add/remove TAs, remove students. */
  "course:manageMembers": WithCourse;
  "assignment:create": WithCourse;
  /** Edit details and move DRAFT → PUBLISHED → CLOSED. */
  "assignment:update": WithCourse<{ assignment: { status: AssignmentStatus } }>;
  "assignment:view": WithCourse<{ assignment: { status: AssignmentStatus } }>;
  /** Hard delete: only a DRAFT assignment that has no submissions. */
  "assignment:delete": WithCourse<{
    assignment: { status: AssignmentStatus; hasSubmissions: boolean };
  }>;
  /** Create, edit and hard-delete rubric criteria and levels (rubric locks on publish). */
  "rubric:edit": WithCourse<{ assignment: { status: AssignmentStatus } }>;
  /** Create or edit a submission; `submission` is null when creating the first draft. */
  "submission:write": WithCourse<{
    assignment: { status: AssignmentStatus; dueAt: Date; allowLate: boolean };
    submission: { studentId: string } | null;
    now: Date;
  }>;
  "submission:deleteDraft": WithCourse<{
    submission: { studentId: string; status: SubmissionStatus };
  }>;
  "submission:view": WithCourse<{ submission: { studentId: string } }>;
  /** The grading queue: every submission for an assignment. */
  "submission:viewAll": WithCourse;
  "ai:run": WithCourse;
  /** Score + save a grade draft; `grade` is null before the first save. */
  "grade:save": WithCourse<{ grade: { status: GradeStatus } | null }>;
  "grade:release": WithCourse<{ grade: { status: GradeStatus } }>;
  "grade:view": WithCourse<{
    submission: { studentId: string };
    grade: { status: GradeStatus };
  }>;
  /** AI confidence, evidence and unreleased drafts: never shown to students. */
  "grade:viewAiDetails": WithCourse;
  "regrade:create": WithCourse<{
    submission: { studentId: string };
    grade: { status: GradeStatus; releasedAt: Date | null };
    hasExistingRequest: boolean;
    now: Date;
  }>;
  "regrade:resolve": WithCourse<{ regrade: { status: RegradeStatus } }>;
  "analytics:view": WithCourse;
};

export type Action = keyof PolicyResources;

type Rule<A extends Action> = (member: Member, resource: PolicyResources[A]) => boolean;

export function isStaff(role: Role): boolean {
  return role === "INSTRUCTOR" || role === "TA";
}

const isInstructor = (m: Member) => m.role === "INSTRUCTOR";
const isStudent = (m: Member) => m.role === "STUDENT";
const writable = (r: { course: CourseState }) => !r.course.archived;

const rules: { [A in Action]: Rule<A> } = {
  "course:view": () => true,
  "course:manage": (m, r) => isInstructor(m) && writable(r),
  "course:manageMembers": (m, r) => isInstructor(m) && writable(r),

  "assignment:create": (m, r) => isInstructor(m) && writable(r),
  "assignment:update": (m, r) => isInstructor(m) && writable(r),
  "assignment:view": (m, r) => isStaff(m.role) || r.assignment.status !== "DRAFT",
  "assignment:delete": (m, r) =>
    isInstructor(m) &&
    writable(r) &&
    r.assignment.status === "DRAFT" &&
    !r.assignment.hasSubmissions,
  "rubric:edit": (m, r) => isInstructor(m) && writable(r) && r.assignment.status === "DRAFT",

  "submission:write": (m, r) =>
    isStudent(m) &&
    writable(r) &&
    r.assignment.status === "PUBLISHED" &&
    (r.submission === null || r.submission.studentId === m.userId) &&
    (r.assignment.allowLate || r.now.getTime() <= r.assignment.dueAt.getTime()),
  "submission:deleteDraft": (m, r) =>
    isStudent(m) &&
    writable(r) &&
    r.submission.studentId === m.userId &&
    r.submission.status === "DRAFT",
  "submission:view": (m, r) => isStaff(m.role) || r.submission.studentId === m.userId,
  "submission:viewAll": (m) => isStaff(m.role),

  "ai:run": (m, r) => isStaff(m.role) && writable(r) && r.course.aiEnabled,
  // Released grades change only through a regrade.
  "grade:save": (m, r) =>
    isStaff(m.role) && writable(r) && (r.grade === null || r.grade.status === "DRAFT"),
  "grade:release": (m, r) => isInstructor(m) && writable(r) && r.grade.status === "DRAFT",
  "grade:view": (m, r) =>
    isStaff(m.role) || (r.submission.studentId === m.userId && r.grade.status === "RELEASED"),
  "grade:viewAiDetails": (m) => isStaff(m.role),

  "regrade:create": (m, r) =>
    isStudent(m) &&
    writable(r) &&
    r.submission.studentId === m.userId &&
    r.grade.status === "RELEASED" &&
    r.grade.releasedAt !== null &&
    !r.hasExistingRequest &&
    r.now.getTime() - r.grade.releasedAt.getTime() <= REGRADE_WINDOW_MS,
  "regrade:resolve": (m, r) => isInstructor(m) && writable(r) && r.regrade.status === "OPEN",

  "analytics:view": (m) => isStaff(m.role),
};

/** Non-members can do nothing; members are checked against the permission table. */
export function can<A extends Action>(
  member: Member | null | undefined,
  action: A,
  resource: PolicyResources[A],
): boolean {
  if (!member) return false;
  return rules[action](member, resource);
}
