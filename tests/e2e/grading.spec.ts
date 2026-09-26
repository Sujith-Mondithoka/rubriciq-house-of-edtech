import { expect, type Page, test } from "@playwright/test";

import {
  confirmDialog,
  joinCourse,
  publishAssignment,
  signInAsDemo,
  uniqueSuffix,
} from "./helpers";

const STUDENT = "Ananya Rao (Demo Student)";
const ANSWER = "Peer feedback showed me that I bury my claims. Next time I will lead with them.";
const CRITERION_FEEDBACK = "You named a specific habit and a concrete fix.";
const OVERALL = "A focused, honest reflection.";

/** Instructor publishes an assignment; the demo student joins and submits. */
async function submittedAssignment(page: Page, prefix: string) {
  const id = uniqueSuffix();
  const { joinCode, assignmentUrl } = await publishAssignment(page, id, prefix);
  const courseUrl = assignmentUrl.replace(/\/assignments\/.*$/, "");

  await signInAsDemo(page, "Student");
  await joinCourse(page, joinCode, `${prefix} ${id}`);
  await page.goto(assignmentUrl);
  await page.getByLabel("Your answer").fill(ANSWER);
  await page.getByRole("button", { name: "Submit", exact: true }).click();
  await expect(page.getByText("Submitted", { exact: true }).first()).toBeVisible();
  // Submitted, not graded: the grade section says so and shows no score.
  await expect(page.getByRole("heading", { name: "Your grade" })).toBeVisible();
  await expect(page.getByText(/Not released yet/)).toBeVisible();
  return { assignmentUrl, courseUrl, queueUrl: `${assignmentUrl}/submissions` };
}

/** Picks a level with the keyboard only (focus + Space), then writes feedback and saves. */
async function gradeWithKeyboard(page: Page) {
  const proficient = page.getByRole("radio", { name: /Proficient · 10 points/ });
  await proficient.focus();
  await page.keyboard.press("Space");
  await expect(proficient).toBeChecked();
  await page.getByLabel("Feedback on Insight").fill(CRITERION_FEEDBACK);
  await page.getByLabel("Overall feedback").fill(OVERALL);
  await expect(page.getByText("Total: 10 / 10")).toBeVisible();
  await expect(page.getByText("Unsaved changes")).toBeVisible();
  await page.getByRole("button", { name: "Save grade" }).click();
  await expect(page.getByText("Grade saved (10 / 10)")).toBeVisible();
  await expect(page.getByText("All changes saved")).toBeVisible();
}

async function expectStudentSeesNoGrade(page: Page, assignmentUrl: string) {
  await signInAsDemo(page, "Student");
  await page.goto(assignmentUrl);
  await expect(page.getByText(/Not released yet/)).toBeVisible();
  await expect(page.getByText(CRITERION_FEEDBACK)).toHaveCount(0);
  await expect(page.getByText(OVERALL)).toHaveCount(0);
  await expect(page.getByText(/Score:/)).toHaveCount(0);
  // Grading froze the submission.
  await expect(page.getByText(/Grading has started/)).toBeVisible();
  await expect(page.getByLabel("Your answer")).toHaveCount(0);
}

async function expectStudentSeesGrade(page: Page, assignmentUrl: string, courseUrl: string) {
  await signInAsDemo(page, "Student");
  await page.goto(assignmentUrl);
  await expect(page.getByText(/Not released yet/)).toHaveCount(0);
  await expect(page.getByText("10 / 10", { exact: true })).toBeVisible();
  await expect(page.getByText(CRITERION_FEEDBACK)).toBeVisible();
  await expect(page.getByText(OVERALL)).toBeVisible();
  await page.goto(courseUrl);
  await expect(page.getByText("Graded", { exact: true })).toBeVisible();
}

test("TA grades, the student sees nothing until the instructor releases in bulk", async ({
  page,
}) => {
  const { assignmentUrl, courseUrl, queueUrl } = await submittedAssignment(page, "E2E grade");

  // The student cannot open the grading pages.
  await page.goto(queueUrl);
  await expect(page.getByRole("heading", { name: "Not found" })).toBeVisible();

  // Instructor adds the demo TA.
  await signInAsDemo(page, "Instructor");
  await page.goto(`${courseUrl}/members`);
  await page.getByLabel("Add a TA by email").fill("ta@rubriciq.demo");
  await page.getByRole("button", { name: "Add TA" }).click();
  await expect(page.getByText(/added as a TA/)).toBeVisible();

  // The TA grades from the queue but cannot release.
  await signInAsDemo(page, "TA");
  await page.goto(queueUrl);
  await expect(page.getByRole("heading", { name: "Grading queue" })).toBeVisible();
  await expect(page.getByRole("link", { name: "Needs grading (1)" })).toBeVisible();
  await expect(page.getByRole("button", { name: /Release/ })).toHaveCount(0);
  await page.getByRole("link", { name: `Grade ${STUDENT}` }).click();
  await expect(page.getByText(ANSWER)).toBeVisible();
  await gradeWithKeyboard(page);
  await expect(page.getByRole("button", { name: "Release grade" })).toHaveCount(0);
  await expect(page.getByText("The instructor reviews and releases grades")).toBeVisible();

  await expectStudentSeesNoGrade(page, assignmentUrl);

  // Instructor releases every reviewed grade from the queue (with a confirmation).
  await signInAsDemo(page, "Instructor");
  await page.goto(`${queueUrl}?status=REVIEWED`);
  await expect(page.getByRole("link", { name: "Reviewed (1)" })).toHaveAttribute(
    "aria-current",
    "page",
  );
  await page.getByRole("button", { name: "Release 1 reviewed grade" }).click();
  await page.getByRole("alertdialog").getByRole("button", { name: "Cancel" }).click();
  await expect(page.getByRole("link", { name: "Released (0)" })).toBeVisible();
  await page.getByRole("button", { name: "Release 1 reviewed grade" }).click();
  await confirmDialog(page, "Release 1 grade");
  await expect(page.getByText("Released 1 grade")).toBeVisible();
  await expect(page.getByRole("link", { name: "Released (1)" })).toBeVisible();

  await expectStudentSeesGrade(page, assignmentUrl, courseUrl);
});

test("instructor grades and releases one grade from the split view", async ({ page }) => {
  const { assignmentUrl, courseUrl, queueUrl } = await submittedAssignment(page, "E2E release");

  await signInAsDemo(page, "Instructor");
  await page.goto(queueUrl);
  await page.getByRole("link", { name: `Grade ${STUDENT}` }).click();
  // Release waits for a saved, complete grade.
  await expect(page.getByRole("button", { name: "Release grade" })).toBeDisabled();
  await expect(page.getByText("Save the grade before releasing.")).toBeVisible();
  await gradeWithKeyboard(page);

  await expectStudentSeesNoGrade(page, assignmentUrl);

  await signInAsDemo(page, "Instructor");
  await page.goto(queueUrl);
  await page.getByRole("link", { name: `Grade ${STUDENT}` }).click();
  await page.getByRole("button", { name: "Release grade" }).click();
  await confirmDialog(page, "Release grade");
  await expect(page.getByText("Grade released", { exact: true })).toBeVisible();
  // Released grades are read-only for staff too.
  await expect(page.getByText(/This grade is released/)).toBeVisible();
  await expect(page.getByRole("button", { name: "Save grade" })).toHaveCount(0);

  await expectStudentSeesGrade(page, assignmentUrl, courseUrl);
});
