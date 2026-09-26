import { expect, test } from "@playwright/test";

import { confirmDialog, publishAssignment, signInAsDemo, uniqueSuffix } from "./helpers";

test("student joins, drafts with autosave, deletes a draft, submits and resubmits", async ({
  page,
}) => {
  const id = uniqueSuffix();
  const { joinCode, assignmentUrl } = await publishAssignment(page, id);

  // Student joins with a messy join code.
  await signInAsDemo(page, "Student");
  await page
    .getByLabel("Join code")
    .fill(` ${joinCode.toLowerCase().slice(0, 4)}-${joinCode.slice(4)} `);
  await page.getByRole("button", { name: "Join course" }).click();
  await expect(page.getByText(`Joined E2E submit ${id}`)).toBeVisible();
  await expect(page.getByText("Not started")).toBeVisible();
  await expect(page.getByText(/may be sent to Google Gemini/)).toBeVisible();

  await page.getByRole("link", { name: `Reflection ${id}` }).click();
  await expect(page.getByRole("heading", { name: "Your submission" })).toBeVisible();
  await expect(page.getByText("A teacher reviews every grade.")).toBeVisible();

  // Submit is disabled until there is text; autosave stores a draft.
  const editor = page.getByLabel("Your answer");
  await expect(page.getByRole("button", { name: "Submit", exact: true })).toBeDisabled();
  await editor.fill("First attempt at a reflection.");
  await expect(page.getByText("5 words")).toBeVisible();
  await expect(page.getByText(/Draft saved at/)).toBeVisible({ timeout: 10_000 });

  // The draft survives a reload.
  await page.reload();
  await expect(page.getByLabel("Your answer")).toHaveValue("First attempt at a reflection.");
  await expect(page.getByText("Draft saved", { exact: true })).toBeVisible();

  // Delete the draft (Cancel first, then confirm).
  await page.getByRole("button", { name: "Delete draft" }).click();
  await page.getByRole("alertdialog").getByRole("button", { name: "Cancel" }).click();
  await expect(page.getByRole("alertdialog")).toBeHidden();
  await expect(page.getByLabel("Your answer")).toHaveValue("First attempt at a reflection.");
  await page.getByRole("button", { name: "Delete draft" }).click();
  await confirmDialog(page, "Delete draft");
  await expect(page.getByText("Draft deleted")).toBeVisible();
  await expect(page.getByLabel("Your answer")).toHaveValue("");

  // Write again and submit.
  await page.getByLabel("Your answer").fill("This week I learned to lead with my own claim.");
  await page.getByRole("button", { name: "Submit", exact: true }).click();
  await expect(page.getByText("Submitted", { exact: true }).first()).toBeVisible();
  await expect(page.getByText(/You can edit and resubmit until the deadline/)).toBeVisible();
  await expect(page.getByRole("button", { name: "Resubmit" })).toBeDisabled();

  // Edit and resubmit.
  await page
    .getByLabel("Your answer")
    .fill("This week I learned to lead with my own claim, always.");
  await expect(
    page.getByText("Unsaved changes. Resubmit to update your submission."),
  ).toBeVisible();
  await page.getByRole("button", { name: "Resubmit" }).click();
  await expect(page.getByText("Resubmitted")).toBeVisible();
  await page.reload();
  await expect(page.getByLabel("Your answer")).toHaveValue(
    "This week I learned to lead with my own claim, always.",
  );

  // The course list shows the student's status.
  await page.getByRole("link", { name: "Overview" }).click();
  await expect(page.getByText("Submitted", { exact: true })).toBeVisible();

  // Staff see the count, not an editor.
  await signInAsDemo(page, "Instructor");
  await page.goto(assignmentUrl);
  await expect(page.getByRole("heading", { name: "Your submission" })).toHaveCount(0);
  await expect(page.getByRole("heading", { name: "Submissions" })).toBeVisible();
  await expect(page.getByText("Drafts in progress")).toBeVisible();
});

test("a closed assignment is read-only for the student", async ({ page }) => {
  await signInAsDemo(page, "Student");
  await page.getByRole("link", { name: "Academic Writing 101 (Demo)" }).click();
  await page.getByRole("link", { name: "Reflection: peer feedback" }).click();
  await expect(page.getByText(/This assignment is closed/)).toBeVisible();
  await expect(page.getByLabel("Your answer")).toHaveCount(0);
  await expect(page.getByText(/My peer reviewer pointed out/)).toBeVisible();
});
