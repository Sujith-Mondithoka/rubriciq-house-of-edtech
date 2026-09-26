import { describe, expect, it } from "vitest";

import {
  type Action,
  can,
  type Member,
  type PolicyResources,
  REGRADE_WINDOW_MS,
  type Role,
} from "@/server/authz/policy";

const NOW = new Date("2026-09-26T12:00:00Z");
const HOUR = 60 * 60 * 1000;

const instructor: Member = { userId: "u-instructor", role: "INSTRUCTOR" };
const ta: Member = { userId: "u-ta", role: "TA" };
const student: Member = { userId: "u-student", role: "STUDENT" };
const otherStudent: Member = { userId: "u-other", role: "STUDENT" };
const members: Record<Role, Member> = { INSTRUCTOR: instructor, TA: ta, STUDENT: student };

const course = { archived: false, aiEnabled: true };
const archivedCourse = { archived: true, aiEnabled: true };

/** A resource in which the action is allowed for someone, so only the role decides. */
const allowed: { [A in Action]: PolicyResources[A] } = {
  "course:view": { course },
  "course:viewMembers": { course },
  "course:manage": { course },
  "course:manageMembers": { course },
  "assignment:create": { course },
  "assignment:update": { course, assignment: { status: "DRAFT" } },
  "assignment:view": { course, assignment: { status: "PUBLISHED" } },
  "assignment:delete": { course, assignment: { status: "DRAFT", hasSubmissions: false } },
  "rubric:edit": { course, assignment: { status: "DRAFT" } },
  "submission:write": {
    course,
    assignment: { status: "PUBLISHED", dueAt: new Date(NOW.getTime() + HOUR), allowLate: false },
    submission: { studentId: student.userId },
    now: NOW,
  },
  "submission:deleteDraft": { course, submission: { studentId: student.userId, status: "DRAFT" } },
  "submission:view": { course, submission: { studentId: student.userId } },
  "submission:viewAll": { course },
  "ai:run": { course },
  "grade:save": { course, grade: { status: "DRAFT" } },
  "grade:release": { course, grade: { status: "DRAFT" } },
  "grade:view": {
    course,
    submission: { studentId: student.userId },
    grade: { status: "RELEASED" },
  },
  "grade:viewAiDetails": { course },
  "regrade:create": {
    course,
    submission: { studentId: student.userId },
    grade: { status: "RELEASED", releasedAt: new Date(NOW.getTime() - HOUR) },
    hasExistingRequest: false,
    now: NOW,
  },
  "regrade:resolve": { course, regrade: { status: "OPEN" } },
  "analytics:view": { course },
};

type Expected = [instructor: boolean, ta: boolean, student: boolean];

/** The permission table from CLAUDE.md, row by row. */
const table: [row: string, actions: Action[], expected: Expected][] = [
  ["Edit/archive course, regenerate join code, toggle AI", ["course:manage"], [true, false, false]],
  ["Add/remove TAs, remove students", ["course:manageMembers"], [true, false, false]],
  [
    "Create/edit assignment & rubric (rubric only while DRAFT)",
    ["assignment:create", "assignment:update", "rubric:edit"],
    [true, false, false],
  ],
  [
    "Hard-delete DRAFT assignment (no submissions) / rubric items (DRAFT)",
    ["assignment:delete", "rubric:edit"],
    [true, false, false],
  ],
  ["View the course", ["course:view"], [true, true, true]],
  ["View the member list", ["course:viewMembers"], [true, true, false]],
  ["View published assignment + rubric", ["assignment:view"], [true, true, true]],
  [
    "Create/edit own submission (until deadline); delete own unsubmitted draft",
    ["submission:write", "submission:deleteDraft"],
    [false, false, true],
  ],
  ["View submissions (own)", ["submission:view"], [true, true, true]],
  ["View submissions (all)", ["submission:viewAll"], [true, true, false]],
  ["Run AI drafts (if course AI is on)", ["ai:run"], [true, true, false]],
  ["Score + save grade draft", ["grade:save"], [true, true, false]],
  ["Release grades", ["grade:release"], [true, false, false]],
  ["View grade (released)", ["grade:view"], [true, true, true]],
  [
    "Raise regrade (once per grade, ≤ 7 days after release)",
    ["regrade:create"],
    [false, false, true],
  ],
  ["Resolve regrade", ["regrade:resolve"], [true, false, false]],
  ["View analytics", ["analytics:view"], [true, true, false]],
  ["See AI confidence and evidence", ["grade:viewAiDetails"], [true, true, false]],
];

describe("permission table", () => {
  describe.each(table)("%s", (_row, actions, [asInstructor, asTa, asStudent]) => {
    it.each(actions)("%s", (action) => {
      const check = (member: Member) => can(member, action, allowed[action] as never);
      expect({
        INSTRUCTOR: check(members.INSTRUCTOR),
        TA: check(members.TA),
        STUDENT: check(members.STUDENT),
      }).toEqual({ INSTRUCTOR: asInstructor, TA: asTa, STUDENT: asStudent });
    });
  });

  it("covers every action", () => {
    const covered = new Set(table.flatMap(([, actions]) => actions));
    expect([...covered].sort()).toEqual(Object.keys(allowed).sort());
  });
});

describe("non-members", () => {
  it.each(Object.keys(allowed) as Action[])("cannot %s", (action) => {
    expect(can(null, action, allowed[action] as never)).toBe(false);
    expect(can(undefined, action, allowed[action] as never)).toBe(false);
  });
});

describe("archived courses are read-only", () => {
  const readActions: Action[] = [
    "course:view",
    "course:viewMembers",
    "assignment:view",
    "submission:view",
    "submission:viewAll",
    "grade:view",
    "grade:viewAiDetails",
    "analytics:view",
  ];

  it.each(Object.keys(allowed) as Action[])("%s", (action) => {
    const resource = { ...allowed[action], course: archivedCourse } as never;
    const anyoneCan = Object.values(members).some((m) => can(m, action, resource));
    expect(anyoneCan).toBe(readActions.includes(action));
  });
});

describe("assignments and rubrics", () => {
  it("students cannot see DRAFT assignments; staff can", () => {
    const r = { course, assignment: { status: "DRAFT" as const } };
    expect(can(student, "assignment:view", r)).toBe(false);
    expect(can(ta, "assignment:view", r)).toBe(true);
    expect(can(instructor, "assignment:view", r)).toBe(true);
  });

  it("students can see CLOSED assignments", () => {
    expect(can(student, "assignment:view", { course, assignment: { status: "CLOSED" } })).toBe(
      true,
    );
  });

  it.each(["PUBLISHED", "CLOSED"] as const)("the rubric is locked once %s", (status) => {
    expect(can(instructor, "rubric:edit", { course, assignment: { status } })).toBe(false);
  });

  it.each(["PUBLISHED", "CLOSED"] as const)(
    "the instructor can still update a %s assignment",
    (status) => {
      expect(can(instructor, "assignment:update", { course, assignment: { status } })).toBe(true);
    },
  );

  it.each([
    ["PUBLISHED", false],
    ["CLOSED", false],
    ["DRAFT", true],
  ] as const)(
    "cannot hard-delete a %s assignment (has submissions: %s)",
    (status, hasSubmissions) => {
      expect(
        can(instructor, "assignment:delete", { course, assignment: { status, hasSubmissions } }),
      ).toBe(false);
    },
  );
});

describe("submissions", () => {
  const base = allowed["submission:write"];
  const past = new Date(NOW.getTime() - HOUR);

  it("a student can start a first draft", () => {
    expect(can(student, "submission:write", { ...base, submission: null })).toBe(true);
  });

  it("a student cannot write someone else's submission", () => {
    expect(can(otherStudent, "submission:write", base)).toBe(false);
  });

  it("closes at the deadline unless late work is allowed", () => {
    const due = { ...base.assignment, dueAt: past };
    expect(can(student, "submission:write", { ...base, assignment: due })).toBe(false);
    expect(
      can(student, "submission:write", { ...base, assignment: { ...due, allowLate: true } }),
    ).toBe(true);
  });

  it("is still open exactly at the deadline", () => {
    const assignment = { ...base.assignment, dueAt: NOW };
    expect(can(student, "submission:write", { ...base, assignment })).toBe(true);
  });

  it.each(["DRAFT", "CLOSED"] as const)("is not possible on a %s assignment", (status) => {
    const assignment = { ...base.assignment, status, allowLate: true };
    expect(can(student, "submission:write", { ...base, assignment })).toBe(false);
  });

  it("only the owner can delete a draft, and only while unsubmitted", () => {
    const own = { course, submission: { studentId: student.userId, status: "DRAFT" as const } };
    expect(can(otherStudent, "submission:deleteDraft", own)).toBe(false);
    expect(
      can(student, "submission:deleteDraft", {
        course,
        submission: { ...own.submission, status: "SUBMITTED" },
      }),
    ).toBe(false);
  });

  it("students see only their own submission", () => {
    expect(can(otherStudent, "submission:view", allowed["submission:view"])).toBe(false);
  });
});

describe("AI", () => {
  it("is rejected for everyone when the course turned AI off", () => {
    const r = { course: { archived: false, aiEnabled: false } };
    expect(can(instructor, "ai:run", r)).toBe(false);
    expect(can(ta, "ai:run", r)).toBe(false);
  });
});

describe("grades", () => {
  it("released grades cannot be edited directly (only via a regrade)", () => {
    const r = { course, grade: { status: "RELEASED" as const } };
    expect(can(instructor, "grade:save", r)).toBe(false);
    expect(can(ta, "grade:save", r)).toBe(false);
  });

  it("graders can save the first draft before a grade exists", () => {
    expect(can(ta, "grade:save", { course, grade: null })).toBe(true);
  });

  it("a released grade cannot be released again", () => {
    expect(can(instructor, "grade:release", { course, grade: { status: "RELEASED" } })).toBe(false);
  });

  it("students never see an unreleased grade, even their own", () => {
    const r = { ...allowed["grade:view"], grade: { status: "DRAFT" as const } };
    expect(can(student, "grade:view", r)).toBe(false);
    expect(can(ta, "grade:view", r)).toBe(true);
  });

  it("students never see another student's grade", () => {
    expect(can(otherStudent, "grade:view", allowed["grade:view"])).toBe(false);
  });
});

describe("regrades", () => {
  const base = allowed["regrade:create"];

  it("only once per grade", () => {
    expect(can(student, "regrade:create", { ...base, hasExistingRequest: true })).toBe(false);
  });

  it("only on the student's own released grade", () => {
    expect(can(otherStudent, "regrade:create", base)).toBe(false);
    expect(
      can(student, "regrade:create", { ...base, grade: { status: "DRAFT", releasedAt: null } }),
    ).toBe(false);
  });

  it("within 7 days of release", () => {
    const at = (msAgo: number) => ({
      ...base,
      grade: { status: "RELEASED" as const, releasedAt: new Date(NOW.getTime() - msAgo) },
    });
    expect(can(student, "regrade:create", at(REGRADE_WINDOW_MS))).toBe(true);
    expect(can(student, "regrade:create", at(REGRADE_WINDOW_MS + 1))).toBe(false);
  });

  it.each(["ACCEPTED", "REJECTED"] as const)("a %s regrade cannot be resolved again", (status) => {
    expect(can(instructor, "regrade:resolve", { course, regrade: { status } })).toBe(false);
  });
});
