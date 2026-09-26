import { expect, type Page } from "@playwright/test";

export type DemoRole = "Instructor" | "TA" | "Student";

/** Signs in with the one-click demo button (goes through the real Server Action). */
export async function signInAsDemo(page: Page, role: DemoRole) {
  await page.context().clearCookies();
  await page.goto("/sign-in");
  await page.getByRole("button", { name: `Try as ${role}` }).click();
  await expect(page).toHaveURL(/\/dashboard/);
}

/** A `datetime-local` value `days` from now, in the browser's local time. */
export function localDateTime(days: number) {
  const d = new Date(Date.now() + days * 24 * 60 * 60 * 1000);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

export const uniqueSuffix = () =>
  `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`;

/**
 * Instructor creates a course with one published assignment (one criterion: 0 / 5 / 10 points).
 * Returns the assignment URL and the join code.
 */
export async function publishAssignment(page: Page, id: string, prefix = "E2E submit") {
  await signInAsDemo(page, "Instructor");
  await page.getByRole("link", { name: "Teaching? Create a course" }).click();
  await page.getByLabel("Course name").fill(`${prefix} ${id}`);
  await page.getByRole("button", { name: "Create course" }).click();
  await expect(page.getByRole("heading", { level: 1, name: `${prefix} ${id}` })).toBeVisible();
  const joinCode = (await page.getByText(/^[A-Z0-9]{8}$/).textContent())!.trim();

  await page.getByRole("link", { name: "New assignment" }).click();
  await page.getByLabel("Title").fill(`Reflection ${id}`);
  await page.getByLabel("Instructions").fill("Reflect on this week.");
  await page.getByLabel("Due date and time").fill(localDateTime(2));
  await page.getByRole("button", { name: "Create and add rubric" }).click();
  await expect(page.getByRole("heading", { name: `Rubric for Reflection ${id}` })).toBeVisible();
  await page.getByLabel("Title").first().fill("Insight");
  await page.getByRole("button", { name: "Save rubric" }).click();
  await expect(page.getByText("Total: 10 points")).toBeVisible();
  await page.getByRole("button", { name: "Publish" }).click();
  await confirmDialog(page, "Publish");
  await expect(page.getByText("Assignment published")).toBeVisible();
  return { joinCode, assignmentUrl: page.url() };
}

/** Joins a course from the dashboard with a join code. */
export async function joinCourse(page: Page, joinCode: string, courseName: string) {
  await page.getByLabel("Join code").fill(joinCode);
  await page.getByRole("button", { name: "Join course" }).click();
  await expect(page.getByText(`Joined ${courseName}`)).toBeVisible();
}

/** Confirms the open AlertDialog with the given button. */
export async function confirmDialog(page: Page, button: string) {
  const dialog = page.getByRole("alertdialog");
  await expect(dialog).toBeVisible();
  await dialog.getByRole("button", { name: button }).click();
  await expect(dialog).toBeHidden();
}
