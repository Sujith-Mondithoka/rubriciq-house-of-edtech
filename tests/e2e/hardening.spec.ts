import AxeBuilder from "@axe-core/playwright";
import { expect, type Page, test } from "@playwright/test";

import { openCourseFromDashboard, signInAsDemo } from "./helpers";

const DEMO_COURSE = "Academic Writing 101 (Demo)";

/** Fails on serious or critical axe violations and prints them readably. */
async function expectNoSeriousAxeIssues(page: Page, name: string) {
  const results = await new AxeBuilder({ page })
    .withTags(["wcag2a", "wcag2aa", "wcag21aa"])
    .analyze();
  const serious = results.violations.filter(
    (v) => v.impact === "serious" || v.impact === "critical",
  );
  const summary = serious.map(
    (v) => `${v.id} (${v.impact}): ${v.nodes.map((n) => n.target.join(" ")).join(", ")}`,
  );
  expect(summary, `axe on ${name}`).toEqual([]);
}

/** Collects CSP violations reported by the browser. */
function watchCsp(page: Page) {
  const violations: string[] = [];
  page.on("console", (message) => {
    if (message.type() === "error" && /Content Security Policy/i.test(message.text())) {
      violations.push(message.text());
    }
  });
  return violations;
}

test("no serious accessibility issues on public and student pages; CSP is enforced cleanly", async ({
  page,
}) => {
  const csp = watchCsp(page);
  const home = await page.goto("/");
  expect(home?.headers()["content-security-policy"]).toMatch(/script-src 'self' 'nonce-/);
  expect(home?.headers()["x-frame-options"]).toBe("DENY");
  await expectNoSeriousAxeIssues(page, "landing");
  await page.goto("/sign-in");
  await expectNoSeriousAxeIssues(page, "sign-in");
  await page.goto("/sign-up");
  await expectNoSeriousAxeIssues(page, "sign-up");

  await signInAsDemo(page, "Student");
  await expectNoSeriousAxeIssues(page, "student dashboard");
  await openCourseFromDashboard(page, DEMO_COURSE);
  await expectNoSeriousAxeIssues(page, "student course");
  await page.getByRole("link", { name: "Reflection: peer feedback" }).click();
  await expect(page.getByRole("heading", { name: "Your grade" })).toBeVisible();
  await expectNoSeriousAxeIssues(page, "student assignment with released grade");
  expect(csp).toEqual([]);
});

test("no serious accessibility issues on staff pages", async ({ page }) => {
  const csp = watchCsp(page);
  await signInAsDemo(page, "Instructor");
  await openCourseFromDashboard(page, DEMO_COURSE);
  await expectNoSeriousAxeIssues(page, "course overview");
  const courseUrl = page.url();

  await page.getByRole("link", { name: "Argumentative essay: remote learning" }).click();
  await expectNoSeriousAxeIssues(page, "assignment (staff)");
  await page.getByRole("link", { name: "Open grading queue" }).click();
  await expect(page.getByRole("heading", { name: "Grading queue" })).toBeVisible();
  await expectNoSeriousAxeIssues(page, "grading queue");
  await page
    .getByRole("link", { name: /^Grade / })
    .first()
    .click();
  await expect(page.getByRole("form", { name: "Grade" })).toBeVisible();
  await expectNoSeriousAxeIssues(page, "grader");

  for (const [path, name] of [
    ["members", "members"],
    ["settings", "settings"],
    ["analytics", "analytics"],
  ] as const) {
    await page.goto(`${courseUrl}/${path}`);
    await expect(page.getByRole("main")).toBeVisible();
    await expectNoSeriousAxeIssues(page, name);
  }
  expect(csp).toEqual([]);
});

test("the demo course cannot be archived, emptied or reconfigured by demo accounts", async ({
  page,
}) => {
  await signInAsDemo(page, "Instructor");
  await openCourseFromDashboard(page, DEMO_COURSE);
  const courseUrl = page.url();

  await page.goto(`${courseUrl}/settings`);
  await expect(page.getByText("Settings are disabled in the demo")).toBeVisible();
  for (const label of ["Edit details", "Turn AI off", "Regenerate code", "Archive course"]) {
    const button = page.getByRole("button", { name: label });
    await expect(button).toBeDisabled();
    await expect(button).toHaveAccessibleDescription("Disabled in the demo");
  }
  await expect(page.getByLabel("AI grading drafts")).toHaveCount(0);

  await page.goto(`${courseUrl}/members`);
  const removes = page.getByRole("button", { name: "Remove" });
  await expect(removes.first()).toBeDisabled();
  await expect(page.getByText("Disabled in the demo").first()).toBeVisible();

  await page.goto(courseUrl);
  await page.getByRole("link", { name: "Research proposal (draft)" }).click();
  await expect(page.getByRole("button", { name: "Delete draft" })).toBeDisabled();
  await expect(page.getByText("Disabled in the demo")).toBeVisible();
});
