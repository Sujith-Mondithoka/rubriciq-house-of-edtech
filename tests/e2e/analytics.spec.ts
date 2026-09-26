import { expect, test } from "@playwright/test";

import { openCourseFromDashboard, signInAsDemo } from "./helpers";

const DEMO_COURSE = "Academic Writing 101 (Demo)";

test("staff see per-criterion analytics for the seeded demo course; students do not", async ({
  page,
}) => {
  await signInAsDemo(page, "TA");
  await openCourseFromDashboard(page, DEMO_COURSE);
  await page.getByRole("link", { name: "Analytics" }).click();
  await expect(page.getByRole("heading", { name: "Analytics" })).toBeVisible();

  await page.getByRole("link", { name: "Reflection: peer feedback" }).click();
  await expect(page).toHaveURL(/assignment=/);
  await expect(page.getByText("15 / 15", { exact: true })).toBeVisible();
  await expect(page.getByText("10 / 10", { exact: true })).toBeVisible(); // Insight average
  // The chart is a table: every level has a row with its count, keyboard-focusable.
  const deep = page.getByRole("row", { name: /Deep \(10 points\): 1 of 1 \(100%\)/ });
  await deep.focus();
  await expect(page.getByRole("tooltip")).toHaveText("Deep (10 points): 1 of 1 (100%)");

  // Nothing graded on the essay yet: an empty state, not zeros dressed up as data.
  await page.getByRole("link", { name: "Argumentative essay: remote learning" }).click();
  await expect(page.getByText("No confirmed grades for this assignment yet.")).toBeVisible();

  // Students have no Analytics tab and get a 404 on the URL.
  const url = page.url();
  await signInAsDemo(page, "Student");
  await openCourseFromDashboard(page, DEMO_COURSE);
  await expect(page.getByRole("link", { name: "Analytics" })).toHaveCount(0);
  await page.goto(url);
  await expect(page.getByRole("heading", { name: "Not found" })).toBeVisible();
});
