# BT Servant Admin Portal — Progress Tracker

> Single source of truth for project status. Updated via `/progress` and `/eod`.

## Current Status

**Phase**: Active development on Epic #72 (Admin Portal Redesign for Response Tuning)
**Last Updated**: 2026-05-08
**Demo target**: June 9 — `#spoken @arabic` working end-to-end with the new editor

## Milestones

| Milestone                             | Progress | Status             |
| ------------------------------------- | -------- | ------------------ |
| Per-PR ephemeral CF Workers (#83)     | 100%     | Shipped 2026-05-07 |
| Auto-staging deploy on PR merge (#89) | 100%     | Shipped 2026-05-08 |
| Epic #72 — Admin Portal Redesign      | ~30%     | In Progress        |

### Per-PR ephemeral CF Workers — Shipped

- [x] Issue filed (#83)
- [x] Implementation (#84) — `deploy-pr.yml` + `cleanup-pr.yml`
- [x] Frank review + P1 fix (`--force` on wrangler delete)
- [x] Merged at `3e8d087`
- [x] Validated end-to-end via #85 deploy + cleanup
- [x] Pattern documented for Ian's adoption in sibling repos

### Auto-staging deploy on PR merge — Shipped

- [x] Issue filed (#89) with three implementation options + recommendation
- [x] Implementation (#90) — `deploy-staging.yml` rewired from `workflow_run` to `pull_request:closed + merged==true`
- [x] Frank P2 fix: `npm run typecheck` before `npm run build` (vite strips types)
- [x] Merged at `2ee79a9`
- [x] Validated end-to-end: PR #90 merge fired the new workflow → 33s deploy + comment-back on PR; PR #92 + #93 also fired cleanly (40s + 45s)
- [x] Comment-back posts staging URL + merge commit SHA on the merged PR

### Epic #72 — Admin Portal Redesign for Response Tuning (In Progress)

This-repo sub-issues:

- [x] **#75** — Markdown editor + TOC component (shipped 2026-05-07, PR #85)
- [x] **#79** — Languages CRUD API (shipped 2026-05-08, PR #92 at `91da4c5`)
- [x] **#73** — Languages sidebar tab + editor integration (shipped 2026-05-08, PR #93 at `c5dc94a`)
- [ ] #74 — Pre-load structural heading scaffold for new language documents (now has the editor integration point from #73)
- [ ] #76 — Replace six-box mode editor with markdown editor + TOC (depends on #75 + engine #204)
- [ ] #77 — Comment-block syntax in editor (depends on #75; uses Ulysses `%%` + `++…++`)
- [ ] #80 — Define and enforce language-shepherd permissions (currently stubbed in #73 as always-visible; portal-side `TODO(#80)` in `activity-bar.tsx`)
- [ ] #81 — Wire test chat to active mode + language selection
- [ ] #82 — Mode data migration (portal side; depends on engine #204)

Engine repo (`unfoldingWord/bt-servant-engine`):

- [ ] #203 — `#<mode> @<language>` trigger syntax (prompt-driven, not regex)
- [ ] #204 — Mode migration Phase 1 (synthesize markdown on GET, tolerate both shapes)
- [ ] #205 — Strip Ulysses-style comments before assembling system prompt
- [ ] #206 — Language CRUD endpoints (companion to portal #79; mirror of modes endpoints) — filed 2026-05-08, blocks real validation of #73/#79 plumbing

### Tech debt / housekeeping

- [ ] #91 — Bump JavaScript actions to Node 24-compatible majors (`actions/checkout@v4` etc.) before GitHub's Jun 2 2026 forced opt-out / Sep 16 2026 hard removal. Filed 2026-05-08 after the deprecation annotation surfaced on the first staging-on-merge run.

## Session Log

### 2026-05-07 — Project kickoff + per-PR deploys + #75 markdown editor

**Completed:**

- **Repo setup** — `git init` in `/workspace/bt-servant-admin-portal`, added `unfoldingWord` remote, fetched `main`. Migrated Claude state from host to uw-sandbox container.
- **Epic #72 triage** — Read all existing sub-issues (#73–#77), audited the codebase, identified gaps in the Epic's filings, drafted six new sub-issues (Drafts A–F) covering: Languages CRUD API, language-shepherd permissions, test-chat wiring, trigger syntax, mode migration, comment-block stripping.
- **Filed sub-issues** — #79, #80, #81, #82 (this repo); #203, #204, #205 (engine repo). All cross-linked. #82 + #204 paired and gated.
- **Updated #77 + engine #205** — Tim Jore corrected the comment-syntax convention to canonical Ulysses (`%%` paragraph + `++…++` span, not the `&&...&&` originally proposed). Researched against official Ulysses docs (help.ulysses.app), posted findings with provenance on both issues.
- **#83 — Per-PR ephemeral CF Workers** — filed, implemented, reviewed by Frank (P1 caught: `wrangler delete` needs `--force` in CI), fixed, re-reviewed clean, merged at `3e8d087`.
- **#75 — Markdown editor + TOC** — Designed via cowork mockup with frontend-design skill pass ("Outline-as-Index-Page" direction: spine rail + Roman numerals + active-section pin + paper-toned editor surface). Aligned mockup to project tokens (Outfit-only typography, FA Pro convention noted). Lifted into source: parser, types, two components, three hooks, design tokens. Merged at `e347370`.
- **Pattern doc** — Wrote up the per-PR deploy mechanism as a reusable reference for Ian to adopt in sibling repos (engine, data-loaders).

**In Progress:**

- None — both shipped items merged. Next session opens with sub-issue selection from the Epic #72 list above.

**Blockers:**

- None.

**Next Steps:**

- Pick the next Epic #72 sub-issue to start. Most foundational and parallelizable: **#79 (Languages CRUD API)** — design-independent, foundational for #73 + #80. After that, **#76 (replace six-box editor)** is the natural follow-on now that #75 has shipped, but it's gated on engine #204 deploying first.
- Validate engine team progress on #203, #204, #205 before locking the consumer-side work.
- AGENTS.md is untracked (Codex-equivalent of CLAUDE.md, generated locally, not in git). Decide whether to commit, add to `.gitignore`, or leave untracked.
- Consider whether the GitHub Actions workflows are using deprecated Node.js 20 — `actions/checkout@v4`, `actions/setup-node@v4` etc. flagged as deprecated by Sept 2026. Worth a tech-debt issue but not urgent.

### 2026-05-08 — Lockfile/Node bump, staging-on-merge, Languages API + sidebar

**Completed:**

- **PR #86** — committed yesterday's progress-tracker entry (`docs: seed progress_tracker with 2026-05-07 EOD entry`); also picked up a CI tweak that landed the same morning (`d5dc15d` — skip `deploy-pr.yml` + `cleanup-pr.yml` for docs-only PRs via `paths-ignore`). Merged.
- **PR #87 — Lockfile refresh + Node 20→22 bump.** Pre-commit (husky → lint-staged) was failing locally with `ERR_MODULE_NOT_FOUND` on `nano-spawn/source/index.js` — the published `nano-spawn@2.0.0` tarball is missing `source/index.js` and the lockfile pinned that broken version. Refreshed the lockfile (lint-staged 16.2.7 → 16.4.0 within `^16.2.7`, drops nano-spawn entirely). Lockfile refresh also bumped wrangler 4.69.0 → 4.90.0 within `^4.62.0`, and 4.90.0 requires Node ≥22 — so all five workflows bumped from `node-version: 20` → `22`. Verified safe vs sister repos (Python; independent CI). Merged.
- **PR #88 — `chore: track AGENTS.md + reference mockup`.** Committed AGENTS.md (Codex equivalent of CLAUDE.md) and `mockups/mockup.png`. Validated the docs-only paths-ignore from `d5dc15d` end-to-end — the per-PR Cloudflare Worker deploy job was correctly absent from PR #88's checks. Merged.
- **PR #90 / #89 — Direct staging deploy on PR merge.** Filed #89 capturing Ian's request with three implementation options. Implemented Option A: `deploy-staging.yml` trigger swapped from indirect `workflow_run: { workflows: ["CI"] }` to `pull_request: { types: [closed] }` gated on `merged == true`. Same `paths-ignore` as `deploy-pr.yml` (docs-only PRs skip), `concurrency: deploy-staging` for serialization, `workflow_dispatch` retained as manual recovery, comment-back on the merged PR with worker name + URL + merge commit SHA. Frank P2: added `npm run typecheck` before `npm run build` (vite strips types). Merged. Validated end-to-end: the merge of #90 itself fired the new workflow, then #92 and #93 each fired cleanly (33s / 45s).
- **PR #92 / #79 — Languages CRUD API in worker BFF + frontend client.** Mirrors the existing modes API surface. New `worker/config.ts` routes `/api/config/languages` (GET) + `/api/config/languages/{name}` (GET/PUT/DELETE) proxying to engine `/api/v1/admin/orgs/{org}/languages`. New `Language { name, label?, document, published? }` type — asymmetric from `PromptMode` because language tuning is one markdown `document`, not slotted overrides (per #76). New `src/lib/languages-api.ts` with `listLanguages` / `getLanguage` / `putLanguage` / `deleteLanguage` mirroring config-api mode helpers. Filed engine companion `bt-servant-engine#206` and linked from #79 per the acceptance criterion. Frank cleared with no findings. Merged.
- **PR #93 / #73 — Languages sidebar tab + editor integration.** First user-visible consumer of the editor + TOC components from #75 and the API client from #79. New activity-bar entry (`faLanguage` Pro icon, light + solid) below the existing manual-config entry. New `/languages` route → `LanguagesPage` with `LanguageSelector` toolbar + `MarkdownToc` (280px) + `MarkdownEditor` (flex-1). Auto-save with 800ms debounce + manual `Save` button + status indicator. Two unsaved-changes guards: cross-route `useBlocker` confirm + in-page language-switch confirm. Permission gating stubbed with `TODO(#80)` (always visible until engine delivers `session.language_rights`). Frank caught **two P1s + one P2** across two reviews:
  - **P1.1**: `useBlocker` only works under a data router. Migrated `App.tsx` from `<BrowserRouter>` to `createBrowserRouter` + `RouterProvider`; hooks needing router context (`useSyncSection`, `useSessionGuard`) moved into a new `RootLayout` route element.
  - **P1.2**: Autosave race could lose user edits — the post-save `setDraft(serverDocument)` overwrote in-flight typing because the React Query cache lags real saves. Replaced `serverDocument`-based dirty-detection with a separate `lastSyncedDoc` advanced only on (a) initial load / language switch (gated on `query.data.name === selectedLanguage` so a stale response from the previous selection can't slip in) and (b) successful save with the value captured in the mutation closure. Autosave effect's deps now include `saveLanguage.isPending` + `lastSyncedDoc` so it retries when an in-flight save settles.
  - **P2**: Same class of bug for `published` — autosave fired right after Publish/Unpublish read stale `serverPublished` from the cache and reverted the toggle. Added parallel `lastSyncedPublished` tracking, advanced on the same triggers as `lastSyncedDoc`. Frank cleared the re-re-review. Merged.
- **#91 filed** — `Bump JavaScript actions to Node 24-compatible majors`. Surfaced via the GitHub deprecation annotation on the first staging-on-merge run. Captures the five action pins (`actions/checkout@v4`, `actions/setup-node@v4`, `actions/github-script@v7`, `actions/upload-artifact@v4`, `gitleaks/gitleaks-action@v2`) and the `FORCE_JAVASCRIPT_ACTIONS_TO_NODE24=true` escape hatch. Deadline Jun 2 2026 forced opt-out / Sep 16 2026 hard removal.

**In Progress:**

- None — all today's PRs merged. #93's permission gating is the only stubbed work, blocked on #80 (engine half).

**Blockers:**

- **bt-servant-engine#206** (Language CRUD endpoints) blocks real end-to-end validation of #79 + #73 plumbing. Until it lands, GET/PUT/DELETE calls on `/api/config/languages/*` go through the worker proxy and return whatever the engine returns for the unimplemented path (likely 404). The empty-state in `LanguagesPage` handles this gracefully.
- **bt-servant-engine#203, #204, #205** — same status as yesterday; consumer work in #76 / #82 / #77's prompt-stripping half remains blocked on engine progress.

**Next Steps:**

- **#80 (language-shepherd permissions)** is the natural next pick. It directly unblocks proper gating in the Languages tab I just shipped (currently stubbed `TODO(#80)`). Portal-side scope is small: extend `/api/auth/session` consumer to read `language_rights`, gate the activity-bar entry, layer 403 handling in `languages-api.ts`. Engine half (admin tooling for granting rights) is independent.
- Other unblocked candidates: **#74** (heading scaffold for new language documents — now has the editor integration point from #73) and **#77 editor-side** (comment-block syntax — engine-side stripping at #205 is still blocked).
- Watch for **bt-servant-engine#206** to land so we can smoke-test the language CRUD round-trip end-to-end. Coordinate with engine team.

## Known Issues

- None

## Architectural Decisions

Track ADRs under `docs/adr/` if/when needed.

Notable decisions made 2026-05-07 (captured here pending ADRs):

- **Ulysses comment syntax** — Mode and language documents use `%%` (paragraph comment) and `++…++` (paired inline span), verbatim Ulysses convention per Tim Jore. Source: [help.ulysses.app](https://help.ulysses.app/en_US/comments-notes-annotations).
- **Per-PR deploy pattern** — Each PR deploys to `bt-servant-admin-portal-pr-<N>`, auto-deleted on close. `wrangler delete --force` is required for non-interactive runs (per Frank review).
- **Trigger-syntax parsing** — `#<mode> @<language>` should be parsed using BT Servant's existing prompt-driven intent classification pattern, not regex (per Ian).
- **Editor design direction** — "Outline-as-Index-Page": spine rail with Roman-numeral H2s and subordinate-rail H3s, active-section pin (`--editor-active`), warm-paper editor surface distinct from the chrome's neutral `--card`. Lives in `src/components/markdown-toc.tsx`.

Notable decisions made 2026-05-08:

- **Staging deploys are merge-event-driven, not CI-chained.** `deploy-staging.yml` triggers on `pull_request: closed + merged == true`, not `workflow_run` on CI. Direct provenance, surfaces under PR checks, comment-back on the merged PR. `workflow_dispatch` retained as the manual escape hatch.
- **Cache-vs-local-state pattern for autosave UIs.** When wiring autosave via React Query mutations, never use cache values (`query.data.x`) as the source of truth for dirty detection or post-save sync — the cache lags PUTs we just made. Track each saved-back field as separate local state advanced only on (a) initial sync at load/selection-change and (b) successful save with the value we sent. Pattern is in `src/app/pages/languages.tsx` for `lastSyncedDoc` + `lastSyncedPublished`.
- **`useBlocker` requires a data router.** When a feature needs `useBlocker`, loaders, or actions, the app must use `createBrowserRouter` + `RouterProvider`, not `<BrowserRouter>`. Migrated 2026-05-08 in PR #93.
- **Per-PR worker name as visible state.** Frank's review pattern: when a CI job comments back on a PR with a deployed URL or merge SHA, that comment is the artifact. Use it for both per-PR ephemeral workers (`deploy-pr.yml`) and the staging-on-merge deploy (`deploy-staging.yml`).
- **Languages are single-document, modes are slotted.** `Language { document: string }` vs `PromptMode { overrides: PromptOverrides }`. Reflected in: client signature, hooks (no `useSetLanguagePublished` partial-update hook because there's only one editable field), UI (single editor, no slot grid), engine contract (#206 mirrors #79).
