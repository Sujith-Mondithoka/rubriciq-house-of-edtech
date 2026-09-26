# RubricIQ

Rubric-based grading with AI-drafted feedback. Teachers build a rubric, students submit written
work, AI drafts a score, feedback and quoted evidence for each criterion, and a teacher reviews
and releases every grade.

Built for the House of Edtech Full-stack Developer assignment by
[Sujith Mondithoka](https://github.com/Sujith-Mondithoka).

> **Status:** in development. Phase 0 (project setup) is complete. See the build phases in
> [`docs/PLAN.md`](docs/PLAN.md#11-build-phases).

## Tech stack

Next.js 16 (App Router) · TypeScript (strict) · Tailwind CSS v4 + shadcn/ui (Radix) · Vitest ·
GitHub Actions · Vercel. Planned: PostgreSQL (Neon) + Drizzle, Better Auth, Vercel AI SDK with
Google Gemini, Playwright.

## Getting started

Requirements: Node.js 24 and pnpm 12.

```bash
pnpm install
pnpm dev        # http://localhost:3000
```

## Scripts

| Script               | What it does                       |
| -------------------- | ---------------------------------- |
| `pnpm dev`           | Start the dev server               |
| `pnpm build`         | Production build                   |
| `pnpm lint`          | ESLint (fails on warnings)         |
| `pnpm typecheck`     | Generate route types and run `tsc` |
| `pnpm format`        | Format with Prettier               |
| `pnpm test`          | Unit and component tests (Vitest)  |
| `pnpm test:coverage` | Tests with a coverage report       |

## Project docs

- [`CLAUDE.md`](CLAUDE.md): permanent project rules (scope, roles, security, testing, Definition of Done)
- [`docs/PLAN.md`](docs/PLAN.md): full plan: journeys, database, AI design, testing, deployment, known weak points

## CI/CD

Every pull request runs format check, lint, typecheck, tests and a production build on GitHub
Actions. Each build phase is developed on its own branch and merged through a pull request once CI
passes.
