import { expect, type Page, test } from "@playwright/test";

import { openCourseFromDashboard, signInAsDemo } from "../e2e/helpers";

const DEMO_COURSE = "Academic Writing 101 (Demo)";
const label = process.env.SHOT_LABEL ?? "current";

async function shot(page: Page, name: string, projectName: string) {
  // Let fonts, dynamic imports and transitions settle.
  await page.waitForLoadState("networkidle");
  await page.waitForTimeout(400);
  await page.screenshot({
    path: `screenshots/${label}/${projectName}-${name}.png`,
    fullPage: true,
  });
}

test("key screens", async ({ page }, info) => {
  const p = info.project.name;

  await page.goto("/");
  await shot(page, "01-landing", p);
  await page.goto("/sign-in");
  await shot(page, "02-sign-in", p);

  // Staff: queue with AI drafts, then the grader.
  await signInAsDemo(page, "Instructor");
  await shot(page, "03-dashboard-instructor", p);
  await openCourseFromDashboard(page, DEMO_COURSE);
  await shot(page, "04-course-overview", p);
  const courseUrl = page.url();
  await page.getByRole("link", { name: "Argumentative essay: remote learning" }).click();
  await page.getByRole("link", { name: "Open grading queue" }).click();
  await expect(page.getByRole("heading", { name: "Grading queue" })).toBeVisible();
  const generate = page.getByRole("button", { name: "Generate AI drafts" });
  if (await generate.count()) {
    await generate.click();
    await expect(page.getByRole("link", { name: /^AI drafted \(2\)$/ })).toBeVisible({
      timeout: 30_000,
    });
  }
  await shot(page, "05-grading-queue", p);
  await page
    .getByRole("link", { name: /^Grade / })
    .first()
    .click();
  await expect(page.getByRole("form", { name: "Grade" })).toBeVisible();
  // Override one AI suggestion (not saved) to show "AI suggested X; your choice Y".
  await page
    .getByRole("radio", { name: /Proficient · 7 points/ })
    .first()
    .check();
  await shot(page, "06-grader", p);
  await page.goto(`${courseUrl}/analytics`);
  await shot(page, "07-analytics", p);
  await page.goto(`${courseUrl}/settings`);
  await shot(page, "08-settings-demo-locked", p);

  // Student: dashboard, course, released grade.
  await signInAsDemo(page, "Student");
  await shot(page, "09-dashboard-student", p);
  await openCourseFromDashboard(page, DEMO_COURSE);
  await shot(page, "10-course-student", p);
  await page.getByRole("link", { name: "Reflection: peer feedback" }).click();
  await expect(page.getByRole("heading", { name: "Your grade" })).toBeVisible();
  await shot(page, "11-student-grade", p);
  await page.goBack();
  await page.getByRole("link", { name: "Argumentative essay: remote learning" }).click();
  await shot(page, "12-student-submission", p);
});
