# RubricIQ — Full Plan (v1)

Permanent rules live in `/CLAUDE.md`. This document is the detailed plan behind them.

## Approved changes to the original plan

1. No 5-minute cron (Vercel Hobby runs cron jobs once a day). Stale PENDING AI runs (> 5 min) are
   marked FAILED when the grading queue or a submission page loads. The only cron job is the daily demo reset.
2. Added to v1: a visible notice that submissions may be sent to an AI provider, and a per-course
   setting to turn AI off.
3. Permission table confirmed: Instructor can release grades; TA cannot.
4. AI provider: Google Gemini (Flash model) behind the `AI_PROVIDER` switch.
5. Footer: Sujith Mondithoka · https://github.com/Sujith-Mondithoka · https://www.linkedin.com/in/sujith-m-a6b888249
6. Deadline is today. Cut order if needed: Phase 10, then Phase 9.
7. Performance rules added (Server Components by default, `next/dynamic`, safe caching with
   revalidation, pagination, no N+1).
8. Commits: small logical commits that each build; one branch + one PR per phase, merged when CI passes.
9. Hard delete where safe (with UI confirmation): DRAFT assignment with no submissions; rubric
   criteria/levels while DRAFT; a student's own unsubmitted draft.
10. Phase 11 protects the demo course (see §6b), and the daily demo reset cron moves from
    Phase 12 into Phase 11.

---

## 1. Scope

**In v1**

- Email/password accounts; seeded demo Instructor, TA and Student with one-click demo login.
- Courses with a join code; per-course roles.
- Assignments: DRAFT → PUBLISHED → CLOSED, deadline, allow-late flag.
- Rubric builder (criteria → levels with points); locked on publish.
- Text submissions: autosaved draft, submit, edit until the deadline, late flag.
- Grading queue + split-view grader; accept/override the AI suggestion for each criterion.
- AI drafts (single or bulk) with status, retry, stale-run handling and a manual fallback.
- AI notice for students + per-course AI on/off setting.
- Release grades one at a time or in bulk; students see only released grades.
- Regrade requests (student → Instructor) with a response.
- Per-criterion analytics (average and distribution).
- Audit log for grade changes, releases and regrade decisions.
- Footer with name, GitHub and LinkedIn.

**Out of v1:** file/PDF uploads, email verification, password reset, notifications, org/admin
level, LMS integration, plagiarism detection, submission history, group assignments, peer
review, rubric templates, realtime updates, social login, i18n.

## 2. Roles and permissions

Roles are per course. Whoever creates a course becomes its Instructor. No platform admin in v1.

| Action                                                                    | Instructor |   TA   |      Student       |
| ------------------------------------------------------------------------- | :--------: | :----: | :----------------: |
| Edit/archive course, regenerate join code, toggle AI                      |     ✅     |   ❌   |         ❌         |
| Add/remove TAs, remove students                                           |     ✅     |   ❌   |         ❌         |
| Create/edit assignment & rubric (rubric only while DRAFT)                 |     ✅     |   ❌   |         ❌         |
| Hard-delete DRAFT assignment (no submissions) / rubric items (DRAFT)      |     ✅     |   ❌   |         ❌         |
| View published assignment + rubric                                        |     ✅     |   ✅   |         ✅         |
| Create/edit own submission (until deadline); delete own unsubmitted draft |     ❌     |   ❌   |         ✅         |
| View submissions                                                          |   ✅ all   | ✅ all |      own only      |
| Run AI drafts (if course AI is on)                                        |     ✅     |   ✅   |         ❌         |
| Score + save grade draft                                                  |     ✅     |   ✅   |         ❌         |
| **Release grades**                                                        |     ✅     |   ❌   |         ❌         |
| View grade                                                                |     ✅     |   ✅   | only when RELEASED |
| Raise regrade (once per grade, ≤ 7 days after release)                    |     ❌     |   ❌   |         ✅         |
| Resolve regrade                                                           |     ✅     |   ❌   |         ❌         |
| View analytics                                                            |     ✅     |   ✅   |         ❌         |

Hard rules: released grades change only via a regrade (audited); students never see AI
confidence or unreleased drafts; courses are archived, never hard-deleted.

## 3. User journeys

**A. Instructor sets up an assignment**

1. Sign up → create a course (join code generated; AI on by default, can be switched off).
2. Share the join code; optionally add a TA by email (they must already have an account).
3. Create an assignment: title, instructions, due date/time, allow late.
4. Build the rubric: criteria, then levels (label, points, descriptor). Max score is computed.
5. Preview as a student → Publish. The rubric is now locked.

**B. Student submits and gets feedback**

1. Sign up → enter the join code → see assignments with deadlines.
2. Open an assignment; read the instructions, the rubric and the AI notice.
3. Write (autosaved draft) → Submit. Can edit and resubmit until the deadline.
4. After release: see per-criterion scores, feedback and the overall comment.
5. Optionally raise a regrade request on a criterion, with a reason.

**C. Grading**

1. Instructor/TA opens the submissions queue (filters: not submitted, submitted, AI drafted,
   reviewed, released). Loading the queue marks stale PENDING runs as FAILED.
2. "Generate AI drafts" (hidden if course AI is off) → each row shows Pending → Drafted / Failed (polling).
3. Open the split view: student text on the left with the AI's evidence highlighted, rubric on
   the right with low-confidence criteria flagged.
4. Accept or change each level, edit the feedback → Save (optimistic locking).
5. Instructor releases grades one at a time or in bulk (with a confirmation step).

**D. AI failure**

1. A run fails (timeout, provider error, invalid output, daily cap, or stale).
2. The row shows "AI draft failed — Retry or grade manually".
3. Manual grading works exactly the same, without suggestions.

**E. Regrade**

1. The Instructor sees open requests in the regrade queue.
2. Adjusts the score (audited) or leaves it; resolves with a response.
3. The student sees the outcome.

## 4. Database (PostgreSQL on Neon, Drizzle)

```
user ─┬─< session / account              (Better Auth tables)
      └─< course_member >── course
                              └─< assignment ─< rubric_criterion ─< rubric_level
                                     └─< submission (one per student per assignment)
                                            ├─< ai_grading_run
                                            └── grade (0..1) ─< criterion_score
                                                   └─< regrade_request
audit_log (actor_id, action, entity_type, entity_id, metadata jsonb, created_at)
```

| Table              | Key columns / constraints                                                                                                                                                                               |
| ------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `course`           | name, description, `join_code` unique, **`ai_enabled` bool default true**, created_by, archived_at                                                                                                      |
| `course_member`    | course_id, user_id, `role` (INSTRUCTOR, TA, STUDENT); unique (course_id, user_id)                                                                                                                       |
| `assignment`       | course_id, title, instructions, `due_at` UTC, allow_late, `status` (DRAFT, PUBLISHED, CLOSED), max_score, deleted_at                                                                                    |
| `rubric_criterion` | assignment_id, title, description, position                                                                                                                                                             |
| `rubric_level`     | criterion_id, label, points ≥ 0, descriptor, position; unique (criterion_id, points)                                                                                                                    |
| `submission`       | assignment_id, student_id, content (≤ 20,000 chars), word_count, `status` (DRAFT, SUBMITTED), submitted_at, is_late; unique (assignment_id, student_id)                                                 |
| `ai_grading_run`   | submission_id, `status` (PENDING, SUCCEEDED, FAILED), error_code (TIMEOUT, PROVIDER, INVALID_OUTPUT, CAP, STALE), model, prompt_version, input/output tokens, raw_output jsonb, started_at, finished_at |
| `grade`            | submission_id unique, `status` (DRAFT, RELEASED), total_score, overall_feedback, graded_by, released_by, released_at, `version` int                                                                     |
| `criterion_score`  | grade_id, criterion_id, level_id, points, feedback, `source` (AI, HUMAN, AI_EDITED), ai_confidence, ai_evidence jsonb; unique (grade_id, criterion_id)                                                  |
| `regrade_request`  | grade_id, criterion_id nullable, reason, `status` (OPEN, ACCEPTED, REJECTED), response, resolved_by                                                                                                     |

Deletes: courses are archived and published assignments are soft-deleted. Hard delete only for a
DRAFT assignment with no submissions, rubric criteria/levels while the assignment is DRAFT
(levels cascade from criteria), and a student's own DRAFT submission. The service re-checks the
condition inside the delete transaction; the UI shows a confirmation dialog first.

Indexes: assignment(course_id), submission(assignment_id, status), course_member(user_id),
ai_grading_run(submission_id, created_at), ai_grading_run(status, started_at).

## 5. Folder structure

```
src/
  app/
    (marketing)/page.tsx                  landing + demo login
    (auth)/sign-in, sign-up
    (app)/layout.tsx                      shell, nav, footer
    (app)/dashboard/
    (app)/courses/[courseId]/
      page.tsx  members/  analytics/  settings/
      assignments/new/
      assignments/[assignmentId]/
        page.tsx  edit/  rubric/
        submissions/                      grading queue
        submissions/[submissionId]/       split-view grader
        regrades/
    api/auth/[...all]/route.ts            Better Auth handler
    api/cron/reset-demo/route.ts          daily demo reset (CRON_SECRET)
    error.tsx  not-found.tsx
  components/ui/                          shadcn
  components/{course,assignment,rubric,grading,submission}/
  server/
    db/{schema.ts, index.ts, migrations/, seed.ts}
    auth/{auth.ts, session.ts}
    authz/policy.ts
    services/*.service.ts
    actions/*.actions.ts
    ai/{provider.ts, grade-submission.ts, prompt.ts, postprocess.ts, mock-provider.ts}
  lib/validation/*.schema.ts
  lib/{env.ts, errors.ts, result.ts, rate-limit.ts, dates.ts}
  proxy.ts
tests/{unit, integration, e2e, fixtures}
.github/workflows/ci.yml
vercel.json                               daily cron only
```

## 6. Login and permissions

- Better Auth, email + password, DB sessions, httpOnly/Secure/SameSite=Lax cookies.
- `proxy.ts`: redirect signed-out users away from `(app)` routes only (optimistic check).
- In every action and data read: `requireUser()` → load the membership for the course that owns the
  resource (resolved from the resource, never from a client courseId) → `can(member, action,
resource)` → otherwise `FORBIDDEN`.
- Rate limits on sign-in and sign-up (IP + email) and on AI actions (Upstash).
- Demo accounts are seeded and reset daily by the cron job.

## 6b. Demo course protection (Phase 11)

The seeded demo course is shared by every reviewer, so one visitor must not be able to break it
for the next.

- **Blocked for demo accounts on the demo course:** archiving it, removing its members (TAs or
  students), deleting its assignments, and changing its settings (name/description, join code,
  AI on/off).
- **Enforced on the server:** a single check (`isProtectedDemoCourse(course)` + demo user id) in
  the course/assignment handlers returns `FORBIDDEN` with the message "Disabled in the demo".
  The UI is not the safeguard.
- **Shown in the UI:** the affected buttons and switches are disabled with the visible text
  "Disabled in the demo" (not colour alone, linked with `aria-describedby`).
- **Still allowed:** everything a reviewer needs to try the product in the demo course — create
  assignments and rubrics, submit, grade, run AI drafts, release, regrade — plus full control of
  any course a demo account creates itself.
- **Daily reset cron:** `vercel.json` schedules `/api/cron/reset-demo` once a day (Hobby limit).
  The route checks `Authorization: Bearer ${CRON_SECRET}` (constant-time compare), then runs
  `resetDemoData()`, which deletes and recreates only rows owned by the fixed demo user ids.
  It returns the seed summary and logs failures with a request id.
- **Tests:** integration tests for each blocked action (demo account → `FORBIDDEN`, same action on
  its own course → allowed, non-demo instructor unaffected); a unit test for the cron secret
  check; E2E shows "Disabled in the demo" on the settings page.

## 7. Validation and cleaning

- `.strict()` Zod schemas on every action and route handler, shared with the forms (react-hook-form).
- Limits: title 120, description/instructions 5,000, feedback 2,000, submission 20,000 chars;
  points integer 0–100; UUID ids; ISO dates → UTC; closed enums; trimmed strings.
- Drizzle parameterized queries only. User text rendered as plain text (`whitespace-pre-wrap`).
- CSP + security headers in `next.config`; Server Actions origin check; SameSite cookies.
- Business rules in services: deadline, rubric lock, published-only submissions, regrade window,
  released-only regrades, course AI switch.
- Result type from actions; field errors shown inline; `error.tsx` per route segment; server logs
  with a request id; no stack traces to users.

## 7b. Performance

- Server Components by default; `'use client'` only on interactive leaves (forms, grader panel).
- `next/dynamic` for heavy client parts (rubric builder, analytics chart).
- Next.js 16 caching only for data safe to share; revalidate affected paths/tags after every
  mutation. Read the Next.js 16 caching docs before adding a cache.
- Every list paginated (max 50 per page). Queue and analytics queries use joins or batched
  `inArray` lookups — no N+1.

## 8. AI

**Use:** per-criterion draft scores and feedback only.

**Flow:**

1. A grader clicks Generate. The server checks: role, `course.ai_enabled`, daily cap, and that no
   active run exists.
2. The server creates PENDING runs and processes them in `after()`, at most 3 at a time.
3. Each run calls Gemini Flash via `@ai-sdk/google` (default `gemini-3.8-flash`, a stable model on
   the free tier) with a Zod schema:
   `{ criteria: [{ criterionId, levelId, feedback, evidence[], confidence }], overallFeedback }`.
   AI SDK 7 deprecates `generateObject`; its replacement `generateText` + `Output.object` is used,
   with the same schema-constrained output.
4. Postprocess: reject unknown levelIds, drop evidence not found verbatim in the submission, flag
   low confidence.
5. Write `criterion_score` rows (source AI) into a DRAFT grade and set the run to SUCCEEDED, using a
   conditional update `WHERE status = 'PENDING'`.

**Prompt safety:** student text goes inside delimiters, with a system instruction to treat it as
data; the output is schema-constrained; humans release.

**Failures:**

| Failure                              | Handling                                                        |
| ------------------------------------ | --------------------------------------------------------------- |
| Timeout (30 s) / 5xx / network error | 1 retry with backoff → FAILED (TIMEOUT/PROVIDER) + Retry button |
| Schema mismatch                      | FAILED (INVALID_OUTPUT), raw output stored                      |
| Daily cap / rate limit               | Not started; a message explains why                             |
| Function killed, run stuck           | On queue or submission load, PENDING > 5 min → FAILED (STALE)   |
| Late result after STALE              | Ignored (conditional update matches 0 rows)                     |
| No API key / `ai_enabled = false`    | AI UI hidden; server rejects AI actions                         |

In every case manual grading keeps working.

**Notice:** the course page and the submission page show "Submissions in this course may be sent
to Google Gemini to draft feedback. A teacher reviews every grade." or "AI is turned off for this
course."

## 9. Testing

- **Unit (Vitest):** the policy matrix; schemas; score totals; deadline/late; grade transitions;
  AI postprocess.
- **Integration (Vitest + Postgres service container):** cross-course access denied; TA release
  denied; rubric lock; optimistic-lock conflict; atomic bulk release; AI success, failure,
  invalid output, stale sweep, late-result-ignored, AI-disabled rejection (mock model).
- **E2E (Playwright, prod build, seeded DB, `AI_PROVIDER=mock`):**
  1. Instructor creates a course, assignment and rubric, then publishes.
  2. Student joins and submits; can't see an unreleased grade.
  3. Grader generates AI drafts, overrides a criterion, releases; the student sees the grade.
  4. AI failure → manual grading.
  5. Regrade raised → resolved.
- **Accessibility:** `@axe-core/playwright` on the main pages; keyboard-only grading flow.
- Coverage > 80 % on authz, services, ai/postprocess.

## 10. Deployment and CI/CD

- GitHub, protected `main`, Conventional Commits. Small commits that each build; one branch
  (`phase-N-short-name`) and one PR per phase, merged only when CI passes.
- `ci.yml` on push and PR: pnpm install (cached) → lint → typecheck → unit → integration (Postgres
  service) → build → Playwright.
- Vercel: preview deploys per PR. Production: after CI passes on `main`, run `pnpm db:migrate`
  on the production DB, then `vercel deploy --prod` (`vercel.json` disables Git deploys of `main`).
- Regions: Vercel functions in `sin1` (Singapore), Neon in `aws-ap-southeast-1`.
- Neon branches: `main` = production, `dev` = local development + Vercel previews, `test` = local
  integration tests. CI integration tests use a Postgres 18 service container instead (same
  major version as Neon).
- CI also fails if `schema.ts` changed without a generated migration.
- Env: `DATABASE_URL` (Neon pooled), `DATABASE_URL_UNPOOLED` (direct, migrations),
  `TEST_DATABASE_URL` (local tests only), `BETTER_AUTH_SECRET`, `BETTER_AUTH_URL`, `AI_PROVIDER`,
  `GOOGLE_GENERATIVE_AI_API_KEY`, `GEMINI_MODEL`, `UPSTASH_REDIS_REST_URL/TOKEN`, `CRON_SECRET`.
  All validated in `lib/env.ts`.
- `vercel.json`: one daily cron → `/api/cron/reset-demo`.

## 11. Build phases

| #   | Phase                                                                                                                                                       | Done when                                                                |
| --- | ----------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------ |
| 0   | Next 16 + strict TS + Tailwind + shadcn + ESLint/Prettier + Vitest + footer + basic CI; deploy to Vercel                                                    | Live URL with footer; CI green                                           |
| 1   | Drizzle + Neon, full schema, migrations, seed                                                                                                               | `db:migrate` + `db:seed` work locally and in CI                          |
| 2   | Better Auth, `proxy.ts`, `requireUser`, demo login                                                                                                          | Sign in works in production                                              |
| 3   | `policy.ts` + unit tests                                                                                                                                    | Permission table passes as tests                                         |
| 4   | Courses: create, join by code, members, add TA, archive, AI toggle                                                                                          | Cross-course access tests pass                                           |
| 5   | Assignments CRUD, rubric builder, publish/close, rubric lock, safe hard deletes                                                                             | Validation, lock and delete-condition tests pass                         |
| 6   | Submissions: autosaved draft, submit, deadline/late, delete own draft, AI notice                                                                            | Journey B through submit works                                           |
| 7   | Manual grading: queue, split view, save with optimistic lock, release, student grade view                                                                   | Journey C works without AI                                               |
| 8   | AI: provider switch, Gemini + mock, postprocess, runs, bulk, retry, cap, stale sweep                                                                        | AI integration tests pass                                                |
| 9   | Regrade requests + audit log                                                                                                                                | Journey E works                                                          |
| 10  | Analytics page                                                                                                                                              | Correct numbers on seeded data                                           |
| 11  | Hardening: rate limits, CSP, error boundaries, loading/empty states, a11y pass; demo course protection ("Disabled in the demo", §6b); daily demo reset cron | No serious axe issues; demo protection tests pass; cron resets demo data |
| 12  | Full Playwright suite in CI, README (architecture, security, contingency)                                                                                   | CI green; README complete                                                |

Cut order under time pressure: Phase 10, then Phase 9. The audit log for grade changes and
releases moves into Phase 7 if Phase 9 is cut.

## 12. Known weak points

1. Text-only submissions (no PDF/DOCX) — the biggest realism gap.
2. `after()` is not a durable queue; the load-time stale sweep limits the damage but does not prevent
   lost runs, and runs are only swept when someone opens the queue. At scale: Inngest/QStash.
3. No evaluation set for AI grading quality; add a small golden set with a manual script later.
4. Prompt injection is reduced, not solved; human release is the real safeguard.
5. Privacy is handled by a notice + per-course switch only; no formal consent or data-retention policy.
6. Rubric locked on publish is rigid; rubric versioning later.
7. No password reset or email verification.
8. No org admin; a course can be orphaned if its Instructor leaves.
9. Time zone edge cases around deadlines (stored UTC, shown in local time).
10. Polling for AI status instead of SSE.
11. E2E uses the mock AI only; the real Gemini call needs a manual smoke test before release
    (`pnpm ai:smoke`: one sample essay, prints the postprocessed draft, writes nothing).
12. Scope is large for a one-day deadline; rely on the cut order.
13. Demo sign-in runs in a Server Action, which bypasses Better Auth's HTTP rate limiter; repeated
    clicks can create many demo sessions. Covered by the Phase 11 rate limit on actions.
14. The grading queue lists current students of the course; work from a student who was removed
    after submitting stays in the database but no longer appears in the queue.
