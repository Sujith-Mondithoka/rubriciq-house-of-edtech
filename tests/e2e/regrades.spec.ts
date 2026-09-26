import { expect, test } from "@playwright/test";

import {
  confirmDialog,
  joinCourse,
  publishAssignment,
  signInAsDemo,
  uniqueSuffix,
} from "./helpers";

const STUDENT = "Ananya Rao (Demo Student)";
const REASON = "My reflection names a specific habit, which the Proficient level asks for.";
const RESPONSE = "Agreed: you named the habit clearly. Raised to Proficient.";

test("student raises a regrade; the instructor accepts it; the student sees the new score", async ({
  page,
}) => {
  const id = uniqueSuffix();
  const { joinCode, assignmentUrl } = await publishAssignment(page, id, "E2E regrade");
  const queueUrl = `${assignmentUrl}/submissions`;

  await signInAsDemo(page, "Student");
  await joinCourse(page, joinCode, `E2E regrade ${id}`);
  await page.goto(assignmentUrl);
  await page.getByLabel("Your answer").fill("I bury my claims, so I will lead with them.");
  await page.getByRole("button", { name: "Submit", exact: true }).click();
  await expect(page.getByText("Submitted", { exact: true }).first()).toBeVisible();

  // Instructor grades 5 / 10 and releases.
  await signInAsDemo(page, "Instructor");
  await page.goto(queueUrl);
  await page.getByRole("link", { name: `Grade ${STUDENT}` }).click();
  await page.getByRole("radio", { name: /Developing · 5 points/ }).check();
  await page.getByRole("button", { name: "Save grade" }).click();
  await expect(page.getByText("Grade saved (5 / 10)")).toBeVisible();
  await page.getByRole("button", { name: "Release grade" }).click();
  await confirmDialog(page, "Release grade");
  await expect(page.getByText("Grade released", { exact: true })).toBeVisible();

  // Student asks for a regrade on the criterion (validation first).
  await signInAsDemo(page, "Student");
  await page.goto(assignmentUrl);
  await expect(page.getByText("5 / 10", { exact: true })).toBeVisible();
  await page.getByLabel("What should be looked at again?").selectOption({ label: "Insight" });
  await page.getByLabel("Why should it be regraded?").fill("Too short");
  await page.getByRole("button", { name: "Request regrade" }).click();
  await expect(page.getByText(/at least 10 characters/)).toBeVisible();
  await page.getByLabel("Why should it be regraded?").fill(REASON);
  await page.getByRole("button", { name: "Request regrade" }).click();
  await expect(page.getByText("Regrade request sent")).toBeVisible();
  await expect(page.getByText(/Waiting for your instructor/)).toBeVisible();
  await expect(page.getByRole("button", { name: "Request regrade" })).toHaveCount(0);

  // Instructor finds it in the regrade queue and accepts with a higher level.
  await signInAsDemo(page, "Instructor");
  await page.goto(assignmentUrl);
  await page.getByRole("link", { name: "Regrade requests (1 open)" }).click();
  await page.getByRole("link", { name: `Review request from ${STUDENT}` }).click();
  await expect(page.getByText(REASON)).toBeVisible();
  await page.getByLabel("Accept and change levels").check();
  await page.getByRole("radio", { name: /Proficient · 10 points/ }).check();
  await expect(page.getByText("New total: 10 / 10")).toBeVisible();
  await page.getByLabel("Response to the student").fill(RESPONSE);
  await page.getByRole("button", { name: "Resolve request" }).click();
  await confirmDialog(page, "Update grade");
  await expect(page.getByText("Regrade accepted: new score 10 / 10")).toBeVisible();
  await expect(page.getByText(/Grade changed by regrade: 5 → 10 points/)).toBeVisible();

  // Student sees the outcome and the new score.
  await signInAsDemo(page, "Student");
  await page.goto(assignmentUrl);
  await expect(page.getByText("10 / 10", { exact: true })).toBeVisible();
  await expect(page.getByText(/Accepted: the grade was updated/)).toBeVisible();
  await expect(page.getByText(RESPONSE)).toBeVisible();
});
