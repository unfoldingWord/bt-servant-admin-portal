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
npm run deploy       # Wrangler prod deploy — CI only (deploy-prod.yml on a v* tag), never locally
npm run deploy:staging # Wrangler staging deploy — CI only (deploy-staging.yml), never locally
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

## CRITICAL: Branching Model (develop → main)

Two long-lived branches, since 2026-11-07:

- **`develop`** is the integration branch and the default branch. Every feature branch is cut from `develop` and every feature PR targets `develop`. Merging a PR into `develop` deploys **staging** automatically (`deploy-staging.yml`).
- **`main`** is the release branch. It only ever receives `develop` (a release PR, "Release vX.Y.Z: develop → main") or a `hotfix/*` branch. Only the repo owner can merge to `main` (code-owner review via `.github/CODEOWNERS`). **Production** deploys from a `v*` tag on `main`.
- **Rule: `develop` is always releasable.** Work that is not ready to ship stays on its feature branch, or merges behind a flag that is off in production. Never cherry-pick into `main`; if something on `develop` must not ship, revert it on `develop` or flag it off, then release.
- **Hotfix:** branch from `main` as `hotfix/<name>`, PR into `main`, then open a PR from `main` into `develop` the same day so `develop` stays ahead of `main`. (That sync PR is what puts the hotfix on staging.)
- **Release:** merge the release PR, tag `v<version>` on the resulting `main` commit (`git checkout main && git pull && git tag v<version> && git push origin v<version>`), then dispatch the production deploy on that tag: `gh workflow run deploy-prod.yml --ref v<version>`.
- **Merge methods:** feature PRs into `develop` are **squash**-merged. Release and hotfix PRs into `main` use a **merge commit**, never squash or rebase. A squash would copy `develop`'s work into a new commit that `develop` never contains, so the branches would diverge and every later release PR would re-list already-shipped commits. With merge commits, the next release PR shows only what is new, and `git log --first-parent main` lists one commit per release. Never delete `develop` when merging a release PR.
- **Version bumps:** every PR bumps the version in its own branch with `npm version patch|minor --no-git-tag-version` (patch for fixes/docs/CI, minor for features), committing `package.json` and `package-lock.json`. Tags are only created on `main`, after a release merge.

Enforcement in CI:

- CI (`ci.yml`) runs on pushes to `develop` and `main` and on every PR. Its **Release Source** job refuses a PR into `main` from any branch other than `develop` or `hotfix/*` (it is skipped for PRs into `develop`).
- Per-PR preview workers (`deploy-pr.yml`) deploy for PRs into `develop` and `main`; `cleanup-pr.yml` deletes them when the PR closes.
- Staging (`deploy-staging.yml`) deploys only when a PR into `develop` merges. A release PR merging into `main` does not redeploy staging.
- Production (`deploy-prod.yml`) refuses to run unless dispatched on a `v*` tag whose commit is on `main`.

## Workflow

- Create feature branches off `develop` and open PRs against `develop` (see "Branching Model" above)
- Open PRs for review — a per-PR **preview** worker deploys automatically on PR
- **NEVER merge a PR (into `develop` or `main`) without explicit user permission.** Always ask first. Never assume permission — even if CI passes and reviews are clean, wait for the user to say "merge".
- Before any merge discussion, a **code review must be completed** on the PR using the `claude-code-review` sub-agent
- All issues found during code review with **medium severity or higher must be fixed** before merging
- After fixing review issues, **always push the fixes and kick off a new review** using the `claude-code-review` sub-agent. Repeat this fix → re-review cycle until the reviewer approves with no medium+ issues remaining.
- Low severity issues may be converted to GitHub issues, but **only with user permission**
- Merge to `develop` — **staging** deploys automatically
- **Production** deploys via manual workflow dispatch **on a `v*` release tag on `main`** (`gh workflow run deploy-prod.yml --ref v<version>`, or Actions → Deploy Production → Run workflow → select the tag). Dispatching on a branch is refused.
- No direct deploys from local machines

## After Every Push

Whenever you push to the remote, **always** do the following automatically:

1. **Monitor CI/CD** — watch `gh pr checks` (or `gh run list`) until all checks pass or fail. If a check fails, investigate and fix it.
2. **Create a PR if one doesn't exist** — if you're on a feature branch and no PR exists yet, create one against `develop` (`gh pr create --base develop`). Only release (`develop`) and `hotfix/*` branches open PRs into `main`.
3. **Report results** — tell the user whether CI passed or failed, and share the PR URL if one was created.

Do this every time without being asked.

## Git Commit Rules

1. **Commit Author**: Claude is the SOLE author. Do NOT include:
   - Co-Authored-By lines
   - Any reference to the user's name
   - Any "Generated with Claude Code" footer
   - Use `--author="Claude <claude@anthropic.com>"` on every commit
2. **Commit Messages**: ALWAYS include both a good subject AND description - neither should EVER be blank
3. **Pre-commit Must Pass**: NEVER commit if the pre-commit hook is failing. Loop until you fix all issues.
4. **No Suppression**: NEVER suppress warnings, disable linting rules, or skip checks without explicitly asking the user first
5. **No --no-verify**: NEVER use `--no-verify` or any flag to skip pre-commit hooks

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

## UI Design

- **Always use the `frontend-design` skill** when building or modifying UI components, pages, or layouts
- **Always use the `refactoring-ui` skill** when reviewing or polishing UI code
- **Use the shadcn MCP** to look up component APIs, examples, and add new components
- Aim for distinctive, production-grade interfaces — avoid generic "AI slop" aesthetics
- Every UI element should have intentional design direction: typography, color, spacing, motion
