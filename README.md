# RubricIQ

Rubric-based grading with AI-drafted feedback. Teachers build a rubric, students submit written
work, AI drafts a score, feedback and quoted evidence for each criterion, and a teacher reviews
and releases every grade.

Built for the House of Edtech Full-stack Developer assignment by
[Sujith Mondithoka](https://github.com/Sujith-Mondithoka).

**Live:** https://rubriciq-house-of-edtech.vercel.app

> **Status:** in development. Phases 0–2 (setup, database, auth + demo login) are complete. See
> the build phases in [`docs/PLAN.md`](docs/PLAN.md#11-build-phases).

## Demo

Use the **Try as Instructor / TA / Student** buttons on the home or sign-in page, or sign in
manually with password `rubriciq-demo-2026`:

| Role       | Email                      |
| ---------- | -------------------------- |
| Instructor | `instructor@rubriciq.demo` |
| TA         | `ta@rubriciq.demo`         |
| Student    | `student1@rubriciq.demo`   |

## Tech stack

Next.js 16 (App Router) · TypeScript (strict) · Tailwind CSS v4 + shadcn/ui (Radix) ·
PostgreSQL (Neon) + Drizzle ORM · Better Auth · Zod · React Hook Form · Vitest · GitHub Actions ·
Vercel. Planned: Vercel AI SDK with Google Gemini, Playwright.

## Authentication

- Better Auth with email and password; sessions stored in Postgres, sent as httpOnly cookies.
- `src/proxy.ts` only redirects visitors without a session cookie (optimistic). Every protected
  page and action calls `requireUser()` (`src/server/auth/session.ts`), which checks the session
  in the database.
- Sign-up input is validated twice: in the form and again on the server with the same Zod schema.
- Rate limits (stored in Postgres): 5 sign-in attempts per minute and 5 sign-ups per hour per IP.
- Redirects after sign-in accept same-site paths only (no open redirects).

## Getting started

Requirements: Node.js 24, pnpm 12 and a PostgreSQL database (Neon recommended).

```bash
pnpm install
cp .env.example .env.local   # then fill in the connection strings
pnpm db:migrate
pnpm db:seed                 # demo course, users and submissions
pnpm dev                     # http://localhost:3000
```

## Scripts

| Script                  | What it does                                           |
| ----------------------- | ------------------------------------------------------ |
| `pnpm dev`              | Start the dev server                                   |
| `pnpm build`            | Production build                                       |
| `pnpm lint`             | ESLint (fails on warnings)                             |
| `pnpm typecheck`        | Generate route types and run `tsc`                     |
| `pnpm format`           | Format with Prettier                                   |
| `pnpm test`             | Unit and component tests (Vitest)                      |
| `pnpm test:integration` | Integration tests against `TEST_DATABASE_URL` (wiped)  |
| `pnpm test:coverage`    | All tests with a coverage report                       |
| `pnpm db:generate`      | Generate a migration from `src/server/db/schema.ts`    |
| `pnpm db:migrate`       | Apply migrations (uses `DATABASE_URL_UNPOOLED` if set) |
| `pnpm db:seed`          | Reset demo data (only touches demo-owned rows)         |
| `pnpm db:studio`        | Open Drizzle Studio                                    |

## Project docs

- [`CLAUDE.md`](CLAUDE.md): permanent project rules (scope, roles, security, testing, Definition of Done)
- [`docs/PLAN.md`](docs/PLAN.md): full plan: journeys, database, AI design, testing, deployment, known weak points

## CI/CD

- **Pull requests:** format check, lint, typecheck, migration drift check, unit tests and build;
  integration tests against a Postgres 18 service container; a Vercel preview deployment.
- **`main`:** after both jobs pass, GitHub Actions applies database migrations to production and
  then deploys to Vercel. Vercel's own Git deploys of `main` are disabled (`vercel.json`) so code
  never goes live before its migrations.

Each build phase is developed on its own branch and merged through a pull request once CI passes.
