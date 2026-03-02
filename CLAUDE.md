# BT Servant Admin Portal

Admin portal for managing bt-servant-worker configurations.

## Tech Stack

- React 19 + Vite + Cloudflare Vite Plugin
- TypeScript (strict mode)
- Tailwind CSS 4 + Radix UI + shadcn-style components
- React Router v7 (client-side SPA routing)
- TanStack React Query v5 (server state)
- Zustand v5 (client state)
- Worker BFF for API proxy (`worker/index.ts`)

## Commands

```bash
npm run dev          # Start Vite dev server
npm run build        # Production build
npm run preview      # Preview build via Cloudflare Workers runtime
npm run lint         # ESLint (zero warnings allowed)
npm run lint:fix     # ESLint with auto-fix
npm run format       # Prettier format all files
npm run format:check # Prettier check (CI)
npm run typecheck    # TypeScript type check (project references)
npm run deploy       # Deploy to production via wrangler
npm run deploy:staging # Deploy to staging
```

## Architecture

Onion architecture — enforced by ESLint `no-restricted-imports`:

```
src/
├── types/       → Domain types (no internal imports)
├── lib/         → Core utilities (can import: types)
├── hooks/       → Business logic (can import: lib, types)
├── components/  → UI components (can import: hooks, lib, types)
└── app/         → Routes/pages (can import: all layers)
worker/
└── index.ts     → Cloudflare Worker BFF (API proxy)
```

**Rule: Never import "upward" in the hierarchy.**

## Workflow

- Create feature branches off `main`
- Open PRs for review — **dev** deploys automatically on PR
- **NEVER merge to `main` without explicit user permission.** Always ask first.
- Before any merge discussion, a **code review must be completed** on the PR
- All issues found during code review with **medium severity or higher must be fixed** before merging
- Low severity issues may be converted to GitHub issues, but **only with user permission**
- Push/merge to `main` — **staging** deploys automatically (after CI passes)
- **Production** deploys via manual workflow dispatch (Actions → Deploy Production → Run workflow)
- No direct deploys from local machines

## Pre-commit Hooks

Husky runs on every commit:

1. `lint-staged` — ESLint + Prettier on staged files
2. `npm run typecheck` — Full type check
3. `npm run build` — Ensure clean build

All three must pass before a commit is accepted.

## Conventions

- Use `@/` path alias for imports (e.g., `@/lib/utils`)
- Use `cn()` helper from `@/lib/utils` for conditional class names
- shadcn components go in `src/components/ui/`
- CSS variables for theming (light/dark mode via `.dark` class)
- Font Awesome Pro + Lucide React for icons
