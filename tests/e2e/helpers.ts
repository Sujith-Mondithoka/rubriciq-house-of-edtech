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

/** Confirms the open AlertDialog with the given button. */
export async function confirmDialog(page: Page, button: string) {
  const dialog = page.getByRole("alertdialog");
  await expect(dialog).toBeVisible();
  await dialog.getByRole("button", { name: button }).click();
  await expect(dialog).toBeHidden();
}
