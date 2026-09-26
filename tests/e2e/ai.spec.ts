import { expect, type Page, test } from "@playwright/test";

import {
  confirmDialog,
  joinCourse,
  publishAssignment,
  signInAsDemo,
  uniqueSuffix,
} from "./helpers";

/** Runs against AI_PROVIDER=mock (see playwright.config.ts); the real provider is never called. */

const STUDENT = "Ananya Rao (Demo Student)";
const FIRST_SENTENCE = "Peer feedback showed me that I bury my claims.";

async function submittedAssignment(page: Page, prefix: string, answer: string) {
  const id = uniqueSuffix();
  const { joinCode, assignmentUrl } = await publishAssignment(page, id, prefix);
  const courseUrl = assignmentUrl.replace(/\/assignments\/.*$/, "");
  await signInAsDemo(page, "Student");
  await joinCourse(page, joinCode, `${prefix} ${id}`);
  await page.goto(assignmentUrl);
  await page.getByLabel("Your answer").fill(answer);
  await page.getByRole("button", { name: "Submit", exact: true }).click();
  await expect(page.getByText("Submitted", { exact: true }).first()).toBeVisible();
  return { assignmentUrl, courseUrl, queueUrl: `${assignmentUrl}/submissions` };
}

test("AI drafts a grade; the instructor overrides it and releases; the student sees no AI details", async ({
  page,
}) => {
  const { assignmentUrl, queueUrl } = await submittedAssignment(
    page,
    "E2E AI",
    `${FIRST_SENTENCE} Next time I will lead with them.`,
  );

  await signInAsDemo(page, "Instructor");
  await page.goto(queueUrl);
  await page.getByRole("button", { name: "Generate AI drafts" }).click();
  await expect(page.getByText("Started 1 AI draft")).toBeVisible();
  // The queue polls until the run finishes.
  await expect(page.getByRole("link", { name: "AI drafted (1)" })).toBeVisible({ timeout: 20_000 });

  await page.getByRole("link", { name: `Grade ${STUDENT}` }).click();
  await expect(page.getByText("AI suggestion", { exact: true })).toBeVisible();
  // Evidence is quoted in the panel and highlighted in the answer.
  await expect(page.locator("mark")).toHaveText(FIRST_SENTENCE);
  // A short answer: the mock picks the lowest level. The instructor overrides it.
  await expect(page.getByRole("radio", { name: /Beginning · 0 points/ })).toBeChecked();
  await expect(page.getByText("Total: 0 / 10")).toBeVisible();
  await expect(page.getByRole("button", { name: "Release grade" })).toBeDisabled();
  await page.getByRole("radio", { name: /Proficient · 10 points/ }).check();
  await page.getByRole("button", { name: "Save grade" }).click();
  await expect(page.getByText("Grade saved (10 / 10)")).toBeVisible();
  await expect(page.getByText("AI suggestion, edited")).toBeVisible();

  await page.getByRole("button", { name: "Release grade" }).click();
  await confirmDialog(page, "Release grade");
  await expect(page.getByText("Grade released", { exact: true })).toBeVisible();

  await signInAsDemo(page, "Student");
  await page.goto(assignmentUrl);
  await expect(page.getByText("10 / 10", { exact: true })).toBeVisible();
  await expect(page.getByText(/AI suggestion|confidence|Evidence/i)).toHaveCount(0);
});

test("a teacher accepts an AI draft unchanged, releases it, and the student sees it", async ({
  page,
}) => {
  // 25–79 words: the mock picks the middle level (Developing · 5 points).
  const answer =
    "Peer feedback showed me that I bury my claims under quotations. In my next draft I will open every paragraph with my own sentence, then add one source, then explain how that source supports the claim I made.";
  const { assignmentUrl, queueUrl } = await submittedAssignment(page, "E2E AI accept", answer);

  await signInAsDemo(page, "Instructor");
  await page.goto(queueUrl);
  await page.getByRole("button", { name: "Generate AI drafts" }).click();
  await expect(page.getByRole("link", { name: "AI drafted (1)" })).toBeVisible({ timeout: 20_000 });
  await page.getByRole("link", { name: `Grade ${STUDENT}` }).click();

  // Not reviewed yet: it can be accepted as-is, but not released.
  await expect(page.getByRole("radio", { name: /Developing · 5 points/ })).toBeChecked();
  const accept = page.getByRole("button", { name: "Accept and save" });
  await expect(accept).toBeEnabled();
  await expect(page.getByRole("button", { name: "Release grade" })).toBeDisabled();
  await expect(page.getByText("Accept and save the AI draft before releasing.")).toBeVisible();

  await accept.click();
  await expect(page.getByText("Grade saved (5 / 10)")).toBeVisible();
  // Reviewed now: the usual rules apply again.
  await expect(page.getByRole("button", { name: "Save grade" })).toBeDisabled();
  await expect(page.getByText("AI suggestion", { exact: true })).toBeVisible();

  await page.getByRole("button", { name: "Release grade" }).click();
  await confirmDialog(page, "Release grade");
  await expect(page.getByText("Grade released", { exact: true })).toBeVisible();

  await signInAsDemo(page, "Student");
  await page.goto(assignmentUrl);
  await expect(page.getByText("5 / 10", { exact: true })).toBeVisible();
  await expect(page.getByText(/Mock feedback on Insight/)).toBeVisible();
  await expect(page.getByText(/AI suggestion|confidence|Evidence/i)).toHaveCount(0);
});

test("an AI failure shows Retry, and manual grading still works; AI off hides AI", async ({
  page,
}) => {
  const { courseUrl, queueUrl } = await submittedAssignment(
    page,
    "E2E AI fail",
    "This answer makes the mock provider fail. [mock:fail]",
  );

  await signInAsDemo(page, "Instructor");
  await page.goto(queueUrl);
  await page.getByRole("button", { name: "Generate AI drafts" }).click();
  await expect(page.getByText("AI draft failed", { exact: true })).toBeVisible({ timeout: 20_000 });
  await expect(page.getByText(/Retry or grade manually/)).toBeVisible();
  await expect(page.getByRole("button", { name: `Retry AI draft for ${STUDENT}` })).toBeVisible();

  await page.getByRole("link", { name: `Grade ${STUDENT}` }).click();
  await expect(page.getByText("AI draft failed: retry or grade manually")).toBeVisible();
  await page.getByRole("radio", { name: /Developing · 5 points/ }).check();
  await page.getByRole("button", { name: "Save grade" }).click();
  await expect(page.getByText("Grade saved (5 / 10)")).toBeVisible();
  // Once a person has graded, the AI prompts disappear.
  await expect(page.getByText("AI draft failed: retry or grade manually")).toHaveCount(0);

  // Turning AI off for the course hides every AI control.
  await page.goto(`${courseUrl}/settings`);
  await page.getByLabel("AI grading drafts").click();
  await expect(page.getByText("AI drafts turned off")).toBeVisible();
  await page.goto(queueUrl);
  await expect(page.getByRole("heading", { name: "Grading queue" })).toBeVisible();
  await expect(page.getByRole("button", { name: /AI draft/ })).toHaveCount(0);
});
