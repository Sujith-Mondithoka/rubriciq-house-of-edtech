import { expect, test } from "@playwright/test";

import { confirmDialog, localDateTime, signInAsDemo, uniqueSuffix } from "./helpers";

test("instructor creates a course, an assignment and a rubric, then publishes", async ({
  page,
}) => {
  const id = uniqueSuffix();
  await signInAsDemo(page, "Instructor");

  // Create a course.
  await page.getByRole("link", { name: "Teaching? Create a course" }).click();
  await page.getByLabel("Course name").fill(`E2E course ${id}`);
  await page.getByLabel("Description (optional)").fill("Created by Playwright.");
  await page.getByRole("button", { name: "Create course" }).click();
  await expect(page.getByRole("heading", { level: 1, name: `E2E course ${id}` })).toBeVisible();

  // Empty state, then create an assignment (validation first).
  await expect(page.getByText("No assignments yet")).toBeVisible();
  await page.getByRole("link", { name: "New assignment" }).click();
  await page.getByRole("button", { name: "Create and add rubric" }).click();
  await expect(page.getByText("Enter a title")).toBeVisible();
  await expect(page.getByText("Choose a due date and time")).toBeVisible();
  await expect(page.getByLabel("Title")).toHaveAttribute("aria-invalid", "true");

  await page.getByLabel("Title").fill(`Essay ${id}`);
  await page.getByLabel("Instructions").fill("Argue for or against remote learning.");
  await page.getByLabel("Due date and time").fill(localDateTime(7));
  await page.getByLabel("Accept late submissions").check();
  await page.getByRole("button", { name: "Create and add rubric" }).click();

  // Rubric builder (lazy-loaded).
  await expect(page.getByRole("heading", { name: `Rubric for Essay ${id}` })).toBeVisible();
  await page.getByLabel("Title").first().fill("Thesis");
  await expect(page.getByText("Max score: 10 points")).toBeVisible();

  // Duplicate points are caught before saving.
  await page.getByLabel("Points").nth(1).fill("10");
  await page.getByRole("button", { name: "Save rubric" }).click();
  await expect(page.getByText("Each level needs different points")).toBeVisible();
  await page.getByLabel("Points").nth(1).fill("6");

  await page.getByRole("button", { name: "Add criterion" }).click();
  await page.getByLabel("Title").nth(1).fill("Evidence");
  await page.getByLabel("Points").nth(5).fill("5");
  await page.getByRole("button", { name: "Remove level 2" }).nth(1).click();
  await expect(page.getByText("Max score: 15 points")).toBeVisible();

  // Reorder with the keyboard-accessible buttons.
  await page.getByRole("button", { name: "Move criterion 2 up" }).click();
  await expect(page.getByLabel("Title").first()).toHaveValue("Evidence");

  await page.getByRole("button", { name: "Save rubric" }).click();
  await expect(page.getByText("Rubric saved · 15 points")).toBeVisible();

  // Detail page shows the rubric in the saved order.
  await expect(page.getByRole("heading", { level: 2, name: `Essay ${id}` })).toBeVisible();
  await expect(page.getByText("Total: 15 points")).toBeVisible();
  await expect(page.getByRole("heading", { name: "1. Evidence" })).toBeVisible();
  await expect(page.getByText("Late submissions accepted")).toBeVisible();

  // Publish behind a confirmation; the rubric locks.
  await page.getByRole("button", { name: "Publish" }).click();
  await confirmDialog(page, "Publish");
  await expect(page.getByText("Assignment published")).toBeVisible();
  await expect(page.getByText("Published", { exact: true })).toBeVisible();
  await expect(page.getByRole("link", { name: "Edit rubric" })).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Close submissions" })).toBeVisible();

  // The rubric URL is no longer reachable once published.
  await page.goto(`${page.url()}/rubric`);
  await expect(page.getByRole("heading", { name: "Not found" })).toBeVisible();
});

test("instructor edits a draft and deletes it", async ({ page }) => {
  const id = uniqueSuffix();
  await signInAsDemo(page, "Instructor");
  await page.getByRole("link", { name: "Teaching? Create a course" }).click();
  await page.getByLabel("Course name").fill(`E2E delete ${id}`);
  await page.getByRole("button", { name: "Create course" }).click();

  await page.getByRole("link", { name: "New assignment" }).click();
  await page.getByLabel("Title").fill(`Draft ${id}`);
  await page.getByLabel("Due date and time").fill(localDateTime(3));
  await page.getByRole("button", { name: "Create and add rubric" }).click();
  await expect(page.getByRole("heading", { name: `Rubric for Draft ${id}` })).toBeVisible();

  // Leave the builder without saving, then edit details: the due date round-trips.
  await page.getByRole("link", { name: "Back to the assignment" }).click();
  await expect(page.getByRole("button", { name: "Publish" })).toBeDisabled();
  await page.getByRole("link", { name: "Edit details" }).click();
  const due = page.getByLabel("Due date and time");
  await expect(due).toHaveValue(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/);
  await page.getByLabel("Title").fill(`Draft ${id} (renamed)`);
  await page.getByRole("button", { name: "Save changes" }).click();
  await expect(
    page.getByRole("heading", { level: 2, name: `Draft ${id} (renamed)` }),
  ).toBeVisible();

  // Cancel keeps it; confirming deletes it.
  await page.getByRole("button", { name: "Delete draft" }).click();
  await page.getByRole("alertdialog").getByRole("button", { name: "Cancel" }).click();
  await expect(page.getByRole("alertdialog")).toBeHidden();
  await expect(
    page.getByRole("heading", { level: 2, name: `Draft ${id} (renamed)` }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Delete draft" }).click();
  await confirmDialog(page, "Delete");
  await expect(page.getByText("Draft deleted")).toBeVisible();
  await expect(page.getByText("No assignments yet")).toBeVisible();
});

test("students never see draft assignments", async ({ page }) => {
  await signInAsDemo(page, "Student");
  await page.getByRole("link", { name: "Academic Writing 101 (Demo)" }).click();
  await expect(page.getByRole("link", { name: /Argumentative essay/ })).toBeVisible();
  await expect(page.getByRole("link", { name: /Research proposal/ })).toHaveCount(0);
  await expect(page.getByRole("link", { name: "New assignment" })).toHaveCount(0);
});
