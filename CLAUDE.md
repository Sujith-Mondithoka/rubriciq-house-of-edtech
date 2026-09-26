@AGENTS.md

# RubricIQ — Project Rules

AI-assisted, rubric-based grading. Teachers build a rubric, students submit written work, AI drafts
per-criterion scores + feedback with evidence quotes, a human reviews and releases every grade.
Full plan: `docs/PLAN.md`. This file holds the permanent rules; if they conflict, this file wins.

Footer (required on every page): **Sujith Mondithoka** ·
GitHub https://github.com/Sujith-Mondithoka ·
LinkedIn https://www.linkedin.com/in/sujith-m-a6b888249

## Scope (v1)

**In:** email/password auth + demo login · courses with join codes · per-course roles · assignments
(DRAFT → PUBLISHED → CLOSED) · rubric builder (locked on publish) · text submissions with deadline/late
logic · grading queue + split-view grader · AI drafts (single/bulk, retry, manual fallback) · AI
notice + per-course AI off switch · grade release (single/bulk) · regrade requests · per-criterion
analytics · audit log.

**Out:** file uploads, email (verification/reset/notifications), org admin, LMS integration,
plagiarism, submission history, group/peer work, rubric templates, realtime, i18n.

**If short on time:** cut Phase 10 (analytics) first, then Phase 9 (regrades). Never cut tests,
validation or authorization to save time.

## Roles & permissions (per course; course creator = Instructor)

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

Hard rules: released grades change only via a regrade (audited) · students never see AI confidence
or unreleased drafts · courses are archived, never hard-deleted.

## Tech stack

Next.js 16 (App Router, `proxy.ts`) · TypeScript strict · Tailwind CSS + shadcn/ui (Radix) ·
PostgreSQL (Neon) + Drizzle ORM · Better Auth (DB sessions, httpOnly cookies) · Zod +
react-hook-form · Vercel AI SDK + `@ai-sdk/google` (Gemini Flash) · Upstash Ratelimit · Vitest ·
Playwright + axe · pnpm · GitHub Actions · Vercel (Hobby, functions in `sin1` next to Neon
`ap-southeast-1`). Neon branches: `main` = production, `dev` = local + previews, `test` = local
integration tests (wiped on every run).
Next.js 16 changed several APIs — read the version-matched guides in `node_modules/next/dist/docs/`
(see `AGENTS.md`) before using routing, caching or proxy APIs.

## Folder structure & layer rules

```
src/app/            routes only: (marketing) (auth) (app)/courses/[courseId]/... api/
src/components/     ui/ (shadcn) + feature folders; no DB or auth imports
src/server/db/      schema.ts, index.ts, migrations/, seed.ts
src/server/auth/    Better Auth config, requireUser()
src/server/authz/   policy.ts — pure can(member, action, resource)
src/server/services/  business logic; no Next.js imports; takes a db/tx argument
src/server/actions/   'use server' — thin: parse → auth → authorize → service → Result
src/server/ai/      provider switch, prompt, postprocess, mock provider
src/lib/validation/ Zod schemas shared by client + server
tests/{unit,integration,e2e,fixtures}
```

- Calls flow one way: page/action → policy → service → db. Never skip the policy check.
- Server Components read through services; Client Components never import from `src/server`.
- Actions return `{ ok: true, data } | { ok: false, code, message, fieldErrors? }`; never throw to the client.

## Database rules

- Schema changes only via Drizzle migrations committed to the repo; never edit an applied migration.
- UUID primary keys, `created_at`/`updated_at` on every table, all timestamps UTC. Exception:
  Better Auth tables (`user`, `session`, `account`, `verification`) use Better Auth's text ids.
- Seed and demo reset touch only rows owned by the fixed demo user ids (`src/server/db/demo-seed.ts`).
- Multi-row writes (grade + criterion scores, bulk release) run in one transaction.
- `grade.version` implements optimistic locking; a stale save returns `CONFLICT`.
- Derived values (total_score, max_score, is_late, word_count) are computed on the server only.
- Soft delete (`deleted_at` / `archived_at`) for courses and assignments; queries exclude them.
- Hard delete is allowed only where nothing depends on the row: a DRAFT assignment with no
  submissions (Instructor); rubric criteria and levels while the assignment is DRAFT (Instructor);
  a student's own unsubmitted DRAFT submission (Student). The service re-checks these conditions
  inside the delete transaction. The UI always asks for confirmation before deleting.
- Index every foreign key used in filters.

## Validation & security rules

- Every action and route handler parses input with a `.strict()` Zod schema: trimmed strings with
  max lengths, UUID ids, integer points 0–100, closed enums.
- Resolve the course from the resource (submission → assignment → course), never from a
  client-sent courseId.
- `proxy.ts` only redirects signed-out users; real authorization happens in actions and data reads.
- Auth config lives in `createAuth()` (`src/server/auth/create-auth.ts`, testable); pages and
  actions use `requireUser()` / `getCurrentUser()`. Email sign-in/up go through the Better Auth
  HTTP handler (rate-limited), not Server Actions.
- No raw SQL string building. No `dangerouslySetInnerHTML`; user text renders as plain text.
- Security headers + CSP in `next.config`. Rate-limit sign-in, sign-up and AI actions.
- Env vars are validated with Zod at startup; secrets are never committed (`.env.example` only).
- Log unexpected errors on the server with a request id; users see a generic message.
- Every grade change, release and regrade decision writes an `audit_log` row.

## AI rules

- AI is used only to draft per-criterion scores and feedback. It never releases a grade, and nothing
  depends on it: manual grading must always work.
- Provider chosen by `AI_PROVIDER=gemini|mock`; model id in `GEMINI_MODEL`. No API key → AI UI hidden.
- `generateObject` with a Zod schema (levelId, feedback, evidence[], confidence). Postprocess:
  reject levelIds not in that criterion; drop evidence quotes not found verbatim in the submission
  and mark that criterion low-confidence.
- Student text goes inside clear delimiters and is treated as data, never as instructions.
- Every run is stored in `ai_grading_run` (status, model, prompt_version, tokens, error_code).
- One active run per submission; max 3 concurrent via `after()`; 30 s timeout; 1 retry with
  backoff; then FAILED with a Retry button. A daily AI cap applies per course.
- **Stale runs:** when the grading queue or a submission loads, mark PENDING runs older than
  5 minutes as FAILED (`STALE`). A late-finishing run may write only `WHERE status = 'PENDING'`.
  No cron job does this.
- `course.ai_enabled = false` → AI buttons are hidden and AI actions are rejected on the server.
- Students see a clear notice on the course and submission pages when their submissions may be
  sent to an AI provider (Google Gemini), or that AI is off for the course.

## Performance rules

- Server Components by default; `'use client'` only on the interactive leaf components.
- Lazy-load heavy client components with `next/dynamic` (e.g. charts, the rubric builder).
- Use Next.js 16 caching only where data is safe to share (never per-user grades/submissions
  across users), and revalidate the affected paths/tags after every mutation. Check the Next.js 16
  caching docs before adding any cache.
- Paginate every list (cursor or limit/offset, max 50 per page). No N+1 queries: use joins or
  batched `inArray` queries.

## UI & accessibility rules

- shadcn/ui + Tailwind only; mobile-first; works at 360 px width.
- Every input has a label; errors are linked with `aria-describedby`; visible focus rings.
- Everything must be usable with a keyboard only; dialogs trap focus; don't rely on color alone
  (status badges have text).
- Every data view has loading, empty and error states. Filters and tabs live in URL query params.
- Toasts for results of actions; confirm before destructive actions and releases.

## Testing rules

- **Unit (Vitest):** policy matrix (the table above, as tests), Zod schemas, scoring, deadline/late,
  grade state transitions, AI postprocess.
- **Integration (Vitest + real Postgres):** services/actions with fake sessions — cross-course
  access, TA cannot release, rubric lock, version conflict, atomic bulk release, AI
  success/failure/invalid output/stale run via the mock model.
- **E2E (Playwright, `AI_PROVIDER=mock`, seeded DB):** the main user journeys from `docs/PLAN.md` + axe checks.
- Tests never call the real AI provider. Coverage > 80 % on authz, services, ai/postprocess.

## Commits

Conventional Commits (`feat:`, `fix:`, `test:`, `chore:`, `docs:`, `refactor:`, `ci:`).

- Small, logical commits inside each phase; every commit must build.
- One branch per phase (`phase-N-short-name`) and one pull request per phase, merged into `main`
  only when CI passes.

## Definition of Done (every phase)

1. The phase's "Done when" check in `docs/PLAN.md` passes.
2. `pnpm lint`, `pnpm typecheck` and `pnpm test` pass; new logic has unit and/or integration tests.
3. Every new action validates input with Zod and checks permissions through `policy.ts`.
4. New UI has loading/empty/error states and passes a quick keyboard + label check.
5. Migrations are committed if the schema changed; `.env.example` is updated if env vars changed.
6. `pnpm build` succeeds; CI is green on the phase's pull request.
7. Lists are paginated, no N+1 queries, and mutations revalidate affected data.
8. The PR is merged; tell the user what was done and what was verified, then wait for approval.
