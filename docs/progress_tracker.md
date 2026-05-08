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
| Language-shepherd permissions (#80)   | 100%     | Shipped 2026-05-08 |
| Users admin UI (#96)                  | 100%     | Shipped 2026-05-08 |
| Epic #72 — Admin Portal Redesign      | ~50%     | In Progress        |

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
- [x] **#80** — Language-shepherd permissions (shipped 2026-05-08, PR #95 at `b349707`; 5 review rounds with Frank)
- [x] **#96** — Users admin UI for assigning rights (shipped 2026-05-08, follow-up to #80; backend PR #97 at `8a1c345`, frontend PR #100 at `e119596`)
- [ ] #74 — Pre-load structural heading scaffold for new language documents (now has the editor integration point from #73)
- [ ] #76 — Replace six-box mode editor with markdown editor + TOC (depends on #75 + engine #204)
- [ ] #77 — Comment-block syntax in editor (depends on #75; uses Ulysses `%%` + `++…++`)
- [ ] #81 — Wire test chat to active mode + language selection
- [ ] #82 — Mode data migration (portal side; depends on engine #204)

Engine repo (`unfoldingWord/bt-servant-engine`):

- [ ] #203 — `#<mode> @<language>` trigger syntax (prompt-driven, not regex)
- [ ] #204 — Mode migration Phase 1 (synthesize markdown on GET, tolerate both shapes)
- [ ] #205 — Strip Ulysses-style comments before assembling system prompt
- [ ] #206 — Language CRUD endpoints (companion to portal #79; mirror of modes endpoints) — filed 2026-05-08, blocks real validation of #73/#79 plumbing
- ~~#207~~ — Closed wontfix-by-design 2026-05-08. Engine cannot enforce per-user `language_rights` because admin endpoints take a single shared `ADMIN_API_TOKEN` with zero user identity. Trusted-portal model verified by reading engine code; portal owns enforcement (PR #95 + #97 + #100).

### Tech debt / housekeeping

- [ ] #91 — Bump JavaScript actions to Node 24-compatible majors (`actions/checkout@v4` etc.) before GitHub's Jun 2 2026 forced opt-out / Sep 16 2026 hard removal. Filed 2026-05-08 after the deprecation annotation surfaced on the first staging-on-merge run.
- [ ] #99 — Admin password reset via `/api/admin/users` PUT doesn't invalidate target user's existing sessions. Filed 2026-05-08 while building #96 — pulled the password-reset field from the edit dialog until this lands. Pre-existing on the X-Admin-Secret CLI path too.
- [ ] **AlertDialogAction race** (no issue yet) — Frank flagged on PR #100 that `src/components/language-selector.tsx` uses `AlertDialogAction` for Delete + Unpublish, which auto-closes the dialog on click and would dismiss inline async errors before they render. Same pattern fixed in `admin-users.tsx` (PR #100, fff8366). Sweep-worthy when next visiting that file.

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

### 2026-05-08 (afternoon) — Language-shepherd permissions end-to-end + Users admin UI

**Completed:**

- **PR #95 / #80 — Language-shepherd permissions (`language_rights`).** Worker-side defense-in-depth → sole authorization gate after architectural redesign. Frontend gating: activity-bar tab grays out + tooltips when rights is `[]`, dropdown filters via `filterAuthorizedLanguages`, `LanguageForbiddenError` typed exception surfaces inline (per #80 AC, not toast), auto-deselects persisted-but-now-forbidden selections, `NoAccessState` for URL-hacked navigation. Back-compat default: `undefined` → full access so existing pre-permission users aren't locked out. **Five Frank review rounds**:
  - **Round 1** — initial implementation. Filed engine companion `bt-servant-engine#207` under the wrong assumption that engine controls session payloads.
  - **Round 2 (P1+P2)** — `language_rights` had no source path (engine doesn't populate sessions; portal owns auth via `AUTH_KV`); delete 403s weren't surfaced inline. Investigated engine codebase via Explore agent: confirmed engine is a **trusted-portal model** (single shared `ADMIN_API_TOKEN`, zero user identity on admin paths). Closed engine #207 wontfix-by-design. Re-implemented with `StoredUser.language_rights` as the source: portal owns rights end-to-end, KV-backed, threaded through `worker/admin.ts createUser/updateUser/safeUser` → `handleLogin sessionData` → `AuthUser`. Filed follow-up #96 for the missing assignment UX.
  - **Round 3 (P1)** — stale sessions retained stale rights for up to 7 days. `validateSession` was reading the cached payload from `session:${id}` and skipping a live read on the `user:${email}` record. Fixed: hydrate `isAdmin` + `language_rights` from `StoredUser` on every request.
  - **Round 4 (P1)** — round-3 fix introduced a mixed-org authorization bug: hydrated privileges without hydrating their authorization boundary (`org`). Frank correctly pointed out every engine path is `/api/v1/.../orgs/${session.org}/...`, so a user moved org-A→org-B (with newly granted `isAdmin` from round-3 hydration) could exercise new privileges against org-A until expiry. Fixed: only `userId` and `createdAt` are session-immutable; everything else (email, name, org, isAdmin, language_rights) is derived live from `StoredUser`. Plus a low-severity stale-comment fix on round 5. Approved + merged at `b349707`.
- **PR #97 / #96 backend — Dual-auth + org-scoping on `/api/admin/users`.** New `requireAdminAuth` returning `AdminScope = { kind: "super" } | { kind: "org"; org; selfEmail }`. `X-Admin-Secret` keeps the super (cross-org, no-CSRF-needed) path. Cookie path requires `X-Requested-With: XMLHttpRequest` + `isAdmin === true` and is org-scoped. Cross-org ops 404 (avoid enumeration). Move-org PUT 403. Self-mutation guards: 400 on self-delete and self-demote (X-Admin-Secret stays as recovery). Frank P2 round 1: no executable verification of the matrix. **Bootstrapped vitest worker test infrastructure** mirroring `bt-servant-worker`'s pattern: `@cloudflare/vitest-pool-workers` + miniflare + `Cloudflare.Env` augmented to extend `WorkerEnv` so tests are fully typed; `tests/admin-auth.test.ts` with **17 tests** covering the full matrix (super-scope, cookie-scope, mixed paths, all 4 CRUD ops, self-mutation guards, language_rights assignment). CI runs `npm test` in the Code Quality job. Tests run in ~500ms. Frank cleared no medium+. Merged at `8a1c345`.
- **PR #100 / #96 frontend — Users admin page.** Built on top of the dual-auth backend: new activity-bar entry gated on `session.isAdmin`, `/admin/users` route with `<RequireAdmin>` gate, table view with create/edit/delete dialogs, reusable `LanguageRightsSelector` (full / specific / no-access modes with chip-style multi-select). Typed errors: `AdminUsersForbiddenError` + `AdminUsersRequestError`, inline error display on dialogs (no toasts). Pulled the password-reset field from the edit dialog after discovering the backend doesn't invalidate target user's existing sessions on PUT — filed #99 to fix that backend gap; field can be re-added once #99 lands. Frank caught **one P2** on round 1: delete-confirm `AlertDialogAction` auto-closed before async error could render, fixed by swapping for a plain destructive `Button` with manual close on success. Merged at `e119596`.

**Architectural decisions captured today:**

- **Engine is a trusted-portal model.** Verified by reading `bt_servant_engine/.../dependencies.py`: admin endpoints authenticate via a single shared `ADMIN_API_TOKEN`, no user identity extraction. Engine cannot enforce per-user authorization on admin paths because it doesn't know which user is calling. Implication: any portal feature involving per-user authorization on engine endpoints must be enforced by the portal worker BFF before calling engine.
- **Portal owns the user model end-to-end** (KV-backed `StoredUser` in `AUTH_KV`). `language_rights` lives on `StoredUser` and is set via `/api/admin/users`, threaded through `SessionData` at login. No engine integration to coordinate.
- **Live session hydration on every request.** `validateSession` reads the user record on every authenticated request and overlays everything except `userId` + `createdAt`. Privilege grants/revocations and org moves take effect on the next request, not at session expiry. Cost is one JSON parse — the KV read was already happening for the existence check.
- **Dual-auth on admin endpoints.** `X-Admin-Secret` stays as the super-admin / CLI recovery path (no CSRF needed; the secret IS the auth). Session-cookie + `isAdmin` is the browser path; org-scoped, requires `X-Requested-With` for CSRF. Self-mutation guards apply only to the cookie path so the secret remains a true recovery escape.
- **Worker test infrastructure now exists.** `@cloudflare/vitest-pool-workers` + miniflare for in-memory KV. `Cloudflare.Env` is augmented to extend `WorkerEnv` (single source of truth on the binding shape). Future worker PRs have a test surface ready.

**In Progress:**

- None — all today's PRs merged. #99 (password-reset session invalidation) and the AlertDialogAction sweep on `language-selector.tsx` are filed/noted for future work.

**Blockers:**

- **bt-servant-engine#206** — same status. End-to-end smoke test of language CRUD still blocked on engine team shipping the endpoints.
- **bt-servant-engine#203, #204, #205** — same status; engine-dependent portal sub-issues (#76, #77 prompt-stripping, #82) remain blocked.

**Next Steps:**

- **#74 (heading scaffold for new language documents)** is the smallest unblocked Epic-#72 win. The editor integration point from #73 is in place; just needs a parser/template that injects a default H2/H3 outline when creating a new language with empty document.
- **#77 editor-side** (Ulysses comment-block syntax in the markdown editor) is independent of engine #205. Editor parsing/highlighting can ship; engine-side stripping continues blocked.
- **#81** (wire test chat to active mode + language selection) is technically unblocked but coupling to chat plumbing makes it bigger than #74 or #77. Probably last of the trio.
- **#99** (password-reset session invalidation) and the **AlertDialogAction sweep** on `language-selector.tsx` are good handoff candidates if anyone else picks up small tasks.

## Known Issues

- **#99 — Admin password-reset doesn't invalidate target user's existing sessions.** `PUT /api/admin/users/{email}` accepts a `password` field that updates the hash but leaves the user's existing session records valid until expiry. Pre-existing on the X-Admin-Secret CLI path; pulled the password-reset field from the `AdminUserEditDialog` (PR #100) until this is fixed.
- **`AlertDialogAction` race in `src/components/language-selector.tsx`** (no issue filed). Delete + Unpublish actions use Radix `AlertDialogAction`, which auto-closes the dialog on click — async errors fire after the dialog is gone, so they never render. Same anti-pattern fixed in `admin-users.tsx` (PR #100, fff8366); the language-selector instance is sweep-worthy when next visiting that file.

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
- **Engine is a trusted-portal model.** Engine admin endpoints authenticate via a single shared `ADMIN_API_TOKEN` and extract zero user identity. Engine cannot enforce per-user authorization on admin paths. Any portal feature requiring per-user gating must be enforced in the portal worker before calling engine. Verified by reading engine code (`bt_servant_engine/.../dependencies.py`); engine companion #207 closed wontfix-by-design.
- **Live session hydration in `validateSession`.** Only `userId` + `createdAt` are session-immutable; everything else (email, name, org, isAdmin, language_rights) is derived from `StoredUser` on every authenticated request. Cost is one JSON parse (the KV read was already happening for the existence check). Means privilege grants/revocations and org moves take effect on the next request, not at 7-day session expiry.
- **Dual-auth on `/api/admin/users`.** `X-Admin-Secret` is the super-admin / CLI recovery path (cross-org, no CSRF check needed). Session-cookie + `isAdmin` is the browser path: org-scoped, requires `X-Requested-With: XMLHttpRequest` for CSRF. Self-mutation guards (no self-delete, no self-demote) apply only to the cookie path so the secret remains a true recovery escape. Modeled as `AdminScope = { kind: "super" } | { kind: "org"; org; selfEmail }` threaded through all handlers.
- **`AlertDialogAction` is unsafe for async confirmations.** Radix's primitive auto-closes the dialog on click, dismissing inline error UI before `onError` callbacks fire. Use a plain destructive `<Button>` and close manually on `onSuccess`. Pattern fixed in `src/app/pages/admin-users.tsx` (PR #100); same anti-pattern still present in `src/components/language-selector.tsx` (sweep-worthy follow-up).
- **Worker test infrastructure pattern.** `@cloudflare/vitest-pool-workers` + miniflare with bindings declared inline (`bindings`, `kvNamespaces`). `Cloudflare.Env` augmented in `worker/env.d.ts` to `extends WorkerEnv` so test code is fully typed and the binding interface stays single-sourced in `worker/helpers.ts`. Tests run in-process in workerd, ~500ms for the auth matrix.
