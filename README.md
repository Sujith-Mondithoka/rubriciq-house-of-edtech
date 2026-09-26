# RubricIQ

Rubric-based grading with AI-drafted feedback. Teachers build a rubric, students submit written
work, AI drafts a score, feedback and quoted evidence for each criterion, and a teacher reviews
and releases every grade.

Built for the House of Edtech Full-stack Developer assignment by
[Sujith Mondithoka](https://github.com/Sujith-Mondithoka).

**Live:** https://rubriciq-house-of-edtech.vercel.app

> **Status:** in development. Phases 0–1 (setup, database) are complete. See the build phases
> in [`docs/PLAN.md`](docs/PLAN.md#11-build-phases).

## Tech stack

Next.js 16 (App Router) · TypeScript (strict) · Tailwind CSS v4 + shadcn/ui (Radix) ·
PostgreSQL (Neon) + Drizzle ORM · Zod · Vitest · GitHub Actions · Vercel. Planned: Better Auth,
Vercel AI SDK with Google Gemini, Playwright.

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
