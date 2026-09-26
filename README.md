# RubricIQ

Rubric-based grading with AI-drafted feedback. Teachers build a rubric, students submit written
work, AI drafts a score, feedback and quoted evidence for each criterion, and a teacher reviews
and releases every grade.

Built for the House of Edtech Full-stack Developer assignment by
[Sujith Mondithoka](https://github.com/Sujith-Mondithoka) ·
[LinkedIn](https://www.linkedin.com/in/sujith-m-a6b888249).

**Live:** https://rubriciq-house-of-edtech.vercel.app

## Try it

Use **Try as Instructor / TA / Student** on the home or sign-in page, or sign in with password
`rubriciq-demo-2026`:

| Role       | Email                      | Good first step                                                    |
| ---------- | -------------------------- | ------------------------------------------------------------------ |
| Instructor | `instructor@rubriciq.demo` | Essay → Open grading queue → Generate AI drafts → review → release |
| TA         | `ta@rubriciq.demo`         | Grade a submission (TAs cannot release)                            |
| Student    | `student1@rubriciq.demo`   | Reflection → see the released grade → request a regrade            |

The demo course is shared, so demo accounts cannot archive it, remove its members, delete its
assignments or change its settings ("Disabled in the demo"). Create your own course from the
dashboard to try everything. Demo data resets every day at 03:00 UTC.

## Features

- Email/password accounts; courses with join codes; per-course roles (Instructor, TA, Student).
- Assignments (Draft → Published → Closed) with a rubric builder; the rubric locks on publish.
- Text submissions with autosave, deadlines and a server-computed late flag.
- Grading queue with status filters and a split-view grader (keyboard-friendly).
- AI drafts (single or bulk) with evidence quotes, low-confidence flags, retry and a manual
  fallback. A per-course AI switch and a clear notice to students.
- Release one grade or many (atomic, with confirmation); students see only released grades.
- Regrade requests (once, within 7 days) resolved by the Instructor, with an audited score change.
- Per-criterion analytics; an audit trail on every grade.

## Architecture

```
Browser ── proxy.ts (session-cookie redirect, CSP nonce)
   │
   ├─ Server Components (pages) ─┐
   └─ Server Actions ────────────┤  parse (Zod .strict) → requireUser → rate limit
                                 ▼
                      authz/policy.ts  can(member, action, resource)   ← pure, unit-tested
                                 ▼
                      services/*.service.ts  business rules, transactions, row locks
                                 ▼
                      Drizzle ORM → PostgreSQL (Neon)
AI: actions start PENDING runs → after() processes ≤3 at a time → ai/ (prompt, Gemini or mock,
postprocess) → grade draft written only WHERE run is still PENDING
```

| Folder                | What lives there                                                                 |
| --------------------- | -------------------------------------------------------------------------------- |
| `src/app`             | Routes only (`(marketing)`, `(auth)`, `(app)/courses/[courseId]/...`, `api/`)    |
| `src/components`      | UI (shadcn/ui + feature folders); no database or auth imports                    |
| `src/server/actions`  | Thin Server Actions; testable `*.handlers.ts` behind them                        |
| `src/server/authz`    | `policy.ts` (the permission table as code), demo-course protection, page loaders |
| `src/server/services` | Business logic; takes a `db`/transaction argument; no Next.js imports            |
| `src/server/ai`       | Provider switch, Gemini and mock providers, prompt, postprocess, run processor   |
| `src/lib/validation`  | Zod schemas shared by forms and the server                                       |
| `tests/`              | `unit`, `integration` (real Postgres), `e2e` (Playwright + axe)                  |

Key decisions:

- **Course is always resolved from the resource** (submission → assignment → course), never from
  a client-sent id. Non-members get 404 so courses are not revealed.
- **Optimistic locking** on grades (`version`); a stale save returns `CONFLICT`.
- **Released grades change only through a regrade**, which is audited with before/after totals.
- **AI is optional.** No key or AI switched off → AI controls are hidden and rejected on the
  server; manual grading is identical. AI never releases anything, and an AI draft must be saved
  by a person before it can be released.

Full design: [`docs/PLAN.md`](docs/PLAN.md). Permanent rules: [`CLAUDE.md`](CLAUDE.md).

## AI grading

- Gemini via the Vercel AI SDK (`generateText` + `Output.object` with a Zod schema), default
  model `gemini-3.5-flash-lite` (stable, free tier; `GEMINI_MODEL` overrides it).
- Student text sits between delimiters it cannot close, and the prompt treats it as data.
- Postprocess: levels must belong to their criterion; quotes must appear verbatim in the
  submission (otherwise dropped and the criterion flagged low-confidence); points come from the
  rubric, never the model.
- Every run is stored (`ai_grading_run`: status, model, prompt version, tokens, raw output, error
  code). 30 s timeout, one retry, then FAILED with a Retry button. One active run per submission,
  a daily cap per course, and PENDING runs older than 5 minutes are marked STALE when the queue
  or grader loads (no cron needed); a late result is ignored.
- Students are told their work may be sent to Google Gemini, and that on the free tier Google
  may use it to improve its products. Instructors can turn AI off per course.
- `pnpm ai:smoke` checks the real Gemini call with a sample essay (writes nothing).

## Security

- Better Auth (email/password), database sessions in httpOnly, SameSite=Lax cookies; `proxy.ts`
  only redirects signed-out visitors, every page and action re-checks the session.
- Every action and route validates input with a `.strict()` Zod schema (trimmed strings with max
  lengths, UUID ids, integer points 0–100, closed enums). Derived values (totals, late flag, word
  count, points) are computed on the server.
- Permissions: one pure policy function, tested as the full permission matrix. Services re-check
  state (rubric lock, deadlines, release conditions, delete conditions) under row locks.
- Rate limits (Postgres, work across serverless instances): every action 120/min per user, AI
  drafts 10 per 10 min, demo sign-in 10 per 10 min per IP; Better Auth limits sign-in/sign-up.
- Nonce-based CSP (`script-src 'nonce-…' 'strict-dynamic'`, `frame-ancestors 'none'`), HSTS,
  nosniff, `X-Frame-Options: DENY`, Referrer-Policy, Permissions-Policy.
- No raw SQL string building; user text is rendered as text (no `dangerouslySetInnerHTML`).
- Unexpected errors are logged with a request id; users see a generic message and the reference.
- Secrets live only in Vercel/`.env.local`; env vars are validated with Zod at startup.

## Testing

| Layer       | Tool                          | What it covers                                                                                                                                                                                                                            |
| ----------- | ----------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Unit        | Vitest                        | Permission matrix, schemas, scoring, deadlines, AI postprocess/prompt, CSP, cron                                                                                                                                                          |
| Integration | Vitest + real Postgres        | Every service/handler: cross-course access, TA cannot release, rubric lock, version conflict, atomic bulk release, AI success/failure/invalid/timeout/stale/late result, regrades, analytics on seeded data, demo protection, rate limits |
| End-to-end  | Playwright (desktop + 360 px) | Journeys A–E with the mock AI, keyboard-only grading, axe (WCAG 2.1 AA) on 13 pages                                                                                                                                                       |

Tests never call the real AI provider. CI runs all three layers on every pull request.

Coverage (Vitest, lines): services 94.9%; `policy.ts`, `authorize.ts`, demo protection and
`ai/postprocess.ts` 100%; AI layer 83.5%. The Next.js page loaders in `authz/load-course.ts`
(which call `notFound()`) are exercised by the Playwright suite rather than Vitest.

## Getting started

Requirements: Node.js 24, pnpm 12 and PostgreSQL (Neon recommended).

```bash
pnpm install
cp .env.example .env.local   # fill in the connection strings and BETTER_AUTH_SECRET
pnpm db:migrate
pnpm db:seed                 # demo course, users and submissions
pnpm dev                     # http://localhost:3000
```

Add `GOOGLE_GENERATIVE_AI_API_KEY` to enable AI drafts, or set `AI_PROVIDER=mock` to try them
offline. See [`.env.example`](.env.example) for every variable.

## Scripts

| Script                  | What it does                                               |
| ----------------------- | ---------------------------------------------------------- |
| `pnpm dev` / `build`    | Dev server / production build                              |
| `pnpm lint`             | ESLint (fails on warnings)                                 |
| `pnpm typecheck`        | Generate route types and run `tsc`                         |
| `pnpm test`             | Unit and component tests                                   |
| `pnpm test:integration` | Integration tests against `TEST_DATABASE_URL` (wiped)      |
| `pnpm test:e2e`         | Playwright against a production build (`pnpm build` first) |
| `pnpm test:coverage`    | All Vitest tests with coverage                             |
| `pnpm db:generate`      | Generate a migration from `src/server/db/schema.ts`        |
| `pnpm db:migrate`       | Apply migrations                                           |
| `pnpm db:seed`          | Reset demo data (only demo-owned rows)                     |
| `pnpm ai:smoke`         | One real Gemini call with a sample essay                   |

## CI/CD

- **Pull requests:** format, lint, typecheck, migration drift check, unit tests, build;
  integration tests on a Postgres 18 service; the full Playwright suite (desktop and 360 px, with axe) on
  its own Postgres with the mock AI; a Vercel preview.
- **`main`:** when all three jobs pass, GitHub Actions applies migrations to production, then
  deploys to Vercel (`sin1`, next to Neon `ap-southeast-1`). Vercel's Git deploys of `main` are
  off so code never goes live before its migrations.
- **Cron:** `/api/cron/reset-demo` daily (Bearer `CRON_SECRET`); the "Reset demo data" workflow
  does the same on demand.

Each build phase was developed on its own branch and merged through a pull request once CI passed.

## Contingency and known limits

- **Cut order under time pressure** was analytics, then regrades; neither had to be cut.
- **`after()` is not a durable queue.** A killed function leaves PENDING runs; the stale sweep
  turns them into FAILED with a Retry button. At scale: a queue (Inngest/QStash).
- **AI availability:** if Gemini is down or rate-limited, runs fail cleanly and grading continues
  manually; the model can be switched with `GEMINI_MODEL` without a code change.
- **Text-only submissions** (no PDF/DOCX), no email verification or password reset, no org admin,
  no rubric versioning, polling instead of realtime, no AI evaluation set yet.
- The grading queue lists current course members; work from a removed student stays stored but
  leaves the queue.

The full list is in [`docs/PLAN.md` §12](docs/PLAN.md#12-known-weak-points).
