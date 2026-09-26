import { hashPassword } from "better-auth/crypto";
import { eq, inArray, or } from "drizzle-orm";

import { countWords } from "@/lib/text";

import type { Db, Tx } from "./client";
import { DEMO_JOIN_CODE, DEMO_PASSWORD, DEMO_USER_IDS, DEMO_USERS } from "./demo-accounts";
import {
  account,
  assignment,
  course,
  courseMember,
  criterionScore,
  grade,
  rubricCriterion,
  rubricLevel,
  submission,
  user,
} from "./schema";

/**
 * Demo data for reviewers. Everything here is owned by the fixed demo user ids, so
 * resetting only ever touches demo-owned rows and is safe to run in production.
 */

export { DEMO_JOIN_CODE, DEMO_USERS } from "./demo-accounts";

const DAY_MS = 24 * 60 * 60 * 1000;

type LevelSeed = { label: string; points: number; descriptor: string };
type CriterionSeed = { title: string; description: string; levels: LevelSeed[] };

const essayRubric: CriterionSeed[] = [
  {
    title: "Thesis and argument",
    description: "A clear, arguable position that is developed throughout the essay.",
    levels: [
      { label: "Missing", points: 0, descriptor: "No identifiable thesis." },
      { label: "Developing", points: 4, descriptor: "Thesis is vague or only partly argued." },
      { label: "Proficient", points: 7, descriptor: "Clear thesis, mostly sustained." },
      { label: "Excellent", points: 10, descriptor: "Precise thesis, sustained and nuanced." },
    ],
  },
  {
    title: "Evidence and support",
    description: "Claims are backed by relevant, specific evidence that is explained.",
    levels: [
      { label: "Missing", points: 0, descriptor: "No supporting evidence." },
      { label: "Developing", points: 4, descriptor: "General or loosely connected examples." },
      { label: "Proficient", points: 7, descriptor: "Relevant evidence for most claims." },
      {
        label: "Excellent",
        points: 10,
        descriptor: "Specific, well-explained evidence throughout.",
      },
    ],
  },
  {
    title: "Organisation",
    description: "Logical paragraphing and transitions that guide the reader.",
    levels: [
      { label: "Weak", points: 0, descriptor: "Hard to follow." },
      { label: "Developing", points: 2, descriptor: "Some structure; abrupt transitions." },
      { label: "Proficient", points: 4, descriptor: "Clear structure with minor lapses." },
      { label: "Excellent", points: 5, descriptor: "Seamless structure and transitions." },
    ],
  },
  {
    title: "Language and mechanics",
    description: "Grammar, spelling and style appropriate for academic writing.",
    levels: [
      { label: "Weak", points: 0, descriptor: "Errors obscure meaning." },
      { label: "Developing", points: 2, descriptor: "Frequent errors." },
      { label: "Proficient", points: 4, descriptor: "Occasional minor errors." },
      { label: "Excellent", points: 5, descriptor: "Polished and precise." },
    ],
  },
];

const reflectionRubric: CriterionSeed[] = [
  {
    title: "Insight",
    description: "Identifies specific lessons from the peer feedback.",
    levels: [
      { label: "Surface", points: 2, descriptor: "Restates the feedback." },
      { label: "Thoughtful", points: 6, descriptor: "Explains what the feedback revealed." },
      { label: "Deep", points: 10, descriptor: "Connects feedback to their own writing habits." },
    ],
  },
  {
    title: "Action plan",
    description: "Concrete next steps for the next draft.",
    levels: [
      { label: "Vague", points: 1, descriptor: "No concrete steps." },
      { label: "Specific", points: 3, descriptor: "Some concrete steps." },
      { label: "Actionable", points: 5, descriptor: "Clear, measurable steps." },
    ],
  },
];

const ESSAY_STRONG = `Remote learning should remain an option in higher education, not because it is easier, but because it widens access without lowering standards when it is designed well.

First, remote options serve students whom campus timetables exclude. In our college survey, 38% of part-time students said they had missed at least one required class because of work shifts. Recorded lectures and asynchronous discussion boards let those students keep up instead of dropping the course.

Second, well-designed online courses can match classroom outcomes. A 2021 meta-analysis of 45 studies found no significant difference in exam performance when online courses included weekly live sessions and prompt instructor feedback. The key variable was structure, not location.

Critics argue that remote learning isolates students. This is a real risk, but it is an argument for better design, such as small-group video seminars, rather than for removing the option entirely.

Therefore, colleges should keep remote learning as a structured choice and invest in the practices that make it work.`;

const ESSAY_WEAK = `Remote learning is good and bad. Some people like it and some people dont.

I think it is good because you can stay at home and you dont need to travel. Also you can watch the videos again. My cousin did online classes and he said it was fine.

But sometimes the internet is slow and it is boring to look at a screen all day. Teachers cant see if you are paying attention.

In conclusion remote learning has good points and bad points and colleges should think about it.`;

const ESSAY_DRAFT = `Remote learning changed how I study. In this essay I will argue that`;

const REFLECTION_TEXT = `My peer reviewer pointed out that my paragraphs often start with a quotation instead of my own claim. Looking back at my last three essays, I do this almost every time, because I feel safer leading with a source.

For my next draft I will write a one-sentence claim at the start of every body paragraph before adding any evidence, and I will ask my reviewer to check only that.`;

export type SeedSummary = {
  users: number;
  courses: number;
  assignments: number;
  submissions: number;
  grades: number;
};

/** Removes every row owned by the demo users (in foreign-key-safe order). */
export async function deleteDemoData(db: Db) {
  await db.transaction(async (tx) => {
    const demoCourses = await tx
      .select({ id: course.id })
      .from(course)
      .where(inArray(course.createdBy, DEMO_USER_IDS));
    const courseIds = demoCourses.map((c) => c.id);

    const demoAssignments = courseIds.length
      ? await tx
          .select({ id: assignment.id })
          .from(assignment)
          .where(inArray(assignment.courseId, courseIds))
      : [];
    const assignmentIds = demoAssignments.map((a) => a.id);

    // Submissions in demo courses, plus anything demo students submitted elsewhere.
    const submissionFilter = assignmentIds.length
      ? or(
          inArray(submission.assignmentId, assignmentIds),
          inArray(submission.studentId, DEMO_USER_IDS),
        )
      : inArray(submission.studentId, DEMO_USER_IDS);
    const demoSubmissions = await tx
      .select({ id: submission.id })
      .from(submission)
      .where(submissionFilter);
    const submissionIds = demoSubmissions.map((s) => s.id);

    if (submissionIds.length) {
      // Cascades to criterion scores and regrade requests.
      await tx.delete(grade).where(inArray(grade.submissionId, submissionIds));
      // Cascades to AI runs.
      await tx.delete(submission).where(inArray(submission.id, submissionIds));
    }
    if (assignmentIds.length) {
      // Cascades to rubric criteria and levels.
      await tx.delete(assignment).where(inArray(assignment.id, assignmentIds));
    }
    if (courseIds.length) {
      // Cascades to memberships, AI runs and audit entries.
      await tx.delete(course).where(inArray(course.id, courseIds));
    }
    // Cascades to sessions, accounts, memberships and regrade requests.
    await tx.delete(user).where(inArray(user.id, DEMO_USER_IDS));
  });
}

async function insertRubric(tx: Tx, assignmentId: string, rubric: CriterionSeed[]) {
  const criteria = await tx
    .insert(rubricCriterion)
    .values(
      rubric.map((c, position) => ({
        assignmentId,
        title: c.title,
        description: c.description,
        position,
      })),
    )
    .returning({ id: rubricCriterion.id });

  const levels = await tx
    .insert(rubricLevel)
    .values(
      rubric.flatMap((c, ci) =>
        c.levels.map((l, position) => ({ criterionId: criteria[ci]!.id, ...l, position })),
      ),
    )
    .returning({
      id: rubricLevel.id,
      criterionId: rubricLevel.criterionId,
      points: rubricLevel.points,
    });

  const maxScore = rubric.reduce((sum, c) => sum + Math.max(...c.levels.map((l) => l.points)), 0);
  await tx.update(assignment).set({ maxScore }).where(eq(assignment.id, assignmentId));

  return { criteria, levels, maxScore };
}

/** Deletes and recreates all demo data. `now` is injectable for deterministic tests. */
export async function resetDemoData(db: Db, now: Date = new Date()): Promise<SeedSummary> {
  // Hash once, outside the transaction (scrypt is deliberately slow).
  const passwordHash = await hashPassword(DEMO_PASSWORD);
  await deleteDemoData(db);

  return db.transaction(async (tx) => {
    const { instructor, ta, student1, student2, student3 } = DEMO_USERS;

    await tx
      .insert(user)
      .values(Object.values(DEMO_USERS).map((u) => ({ ...u, emailVerified: true })));

    // Email/password credentials in Better Auth's format.
    await tx.insert(account).values(
      Object.values(DEMO_USERS).map((u) => ({
        id: `${u.id}-credential`,
        accountId: u.id,
        providerId: "credential",
        userId: u.id,
        password: passwordHash,
      })),
    );

    const [demoCourse] = await tx
      .insert(course)
      .values({
        name: "Academic Writing 101 (Demo)",
        description: "A demo course with essays at every stage of grading.",
        joinCode: DEMO_JOIN_CODE,
        createdBy: instructor.id,
      })
      .returning({ id: course.id });
    const courseId = demoCourse!.id;

    await tx.insert(courseMember).values([
      { courseId, userId: instructor.id, role: "INSTRUCTOR" },
      { courseId, userId: ta.id, role: "TA" },
      { courseId, userId: student1.id, role: "STUDENT" },
      { courseId, userId: student2.id, role: "STUDENT" },
      { courseId, userId: student3.id, role: "STUDENT" },
    ]);

    // 1. Published essay, due next week: two submitted, one draft.
    const [essay] = await tx
      .insert(assignment)
      .values({
        courseId,
        title: "Argumentative essay: remote learning",
        instructions:
          "Write a 300–600 word argumentative essay on whether colleges should keep remote learning options. Take a clear position and support it with evidence.",
        dueAt: new Date(now.getTime() + 7 * DAY_MS),
        status: "PUBLISHED",
        publishedAt: new Date(now.getTime() - 3 * DAY_MS),
        createdBy: instructor.id,
      })
      .returning({ id: assignment.id });
    await insertRubric(tx, essay!.id, essayRubric);

    const submittedAt = new Date(now.getTime() - DAY_MS);
    await tx.insert(submission).values([
      {
        assignmentId: essay!.id,
        studentId: student1.id,
        content: ESSAY_STRONG,
        wordCount: countWords(ESSAY_STRONG),
        status: "SUBMITTED",
        submittedAt,
      },
      {
        assignmentId: essay!.id,
        studentId: student2.id,
        content: ESSAY_WEAK,
        wordCount: countWords(ESSAY_WEAK),
        status: "SUBMITTED",
        submittedAt,
      },
      {
        assignmentId: essay!.id,
        studentId: student3.id,
        content: ESSAY_DRAFT,
        wordCount: countWords(ESSAY_DRAFT),
        status: "DRAFT",
      },
    ]);

    // 2. Closed reflection with a released grade, so the student view has feedback.
    const [reflection] = await tx
      .insert(assignment)
      .values({
        courseId,
        title: "Reflection: peer feedback",
        instructions: "Reflect on the peer feedback you received and plan your next draft.",
        dueAt: new Date(now.getTime() - 10 * DAY_MS),
        status: "CLOSED",
        publishedAt: new Date(now.getTime() - 20 * DAY_MS),
        createdBy: instructor.id,
      })
      .returning({ id: assignment.id });
    const reflectionRubricRows = await insertRubric(tx, reflection!.id, reflectionRubric);

    const [reflectionSubmission] = await tx
      .insert(submission)
      .values({
        assignmentId: reflection!.id,
        studentId: student1.id,
        content: REFLECTION_TEXT,
        wordCount: countWords(REFLECTION_TEXT),
        status: "SUBMITTED",
        submittedAt: new Date(now.getTime() - 11 * DAY_MS),
      })
      .returning({ id: submission.id });

    const pick = (criterionIndex: number, points: number) => {
      const criterionId = reflectionRubricRows.criteria[criterionIndex]!.id;
      const level = reflectionRubricRows.levels.find(
        (l) => l.criterionId === criterionId && l.points === points,
      )!;
      return { criterionId, levelId: level.id, points };
    };
    const insightScore = pick(0, 10);
    const planScore = pick(1, 5);

    const [releasedGrade] = await tx
      .insert(grade)
      .values({
        submissionId: reflectionSubmission!.id,
        status: "RELEASED",
        totalScore: insightScore.points + planScore.points,
        overallFeedback: "A precise, honest reflection with a plan you can actually follow.",
        gradedBy: instructor.id,
        releasedBy: instructor.id,
        releasedAt: new Date(now.getTime() - 8 * DAY_MS),
      })
      .returning({ id: grade.id });

    await tx.insert(criterionScore).values([
      {
        gradeId: releasedGrade!.id,
        ...insightScore,
        source: "HUMAN",
        feedback: "You traced the feedback to a habit across three essays. That is real insight.",
      },
      {
        gradeId: releasedGrade!.id,
        ...planScore,
        source: "HUMAN",
        feedback: "One concrete rule and a focused check. Clear and measurable.",
      },
    ]);

    // 3. Draft assignment the instructor is still building.
    const [draft] = await tx
      .insert(assignment)
      .values({
        courseId,
        title: "Research proposal (draft)",
        instructions: "Propose a research question and outline your method.",
        dueAt: new Date(now.getTime() + 21 * DAY_MS),
        status: "DRAFT",
        createdBy: instructor.id,
      })
      .returning({ id: assignment.id });
    await insertRubric(tx, draft!.id, essayRubric.slice(0, 2));

    return { users: 5, courses: 1, assignments: 3, submissions: 4, grades: 1 };
  });
}
