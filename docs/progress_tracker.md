# BT Servant Admin Portal — Progress Tracker

> Single source of truth for project status. Updated via `/progress` and `/eod`.

## Current Status

**Phase**: Active development on Epic #72 (Admin Portal Redesign for Response Tuning)
**Last Updated**: 2026-05-11
**Demo target**: June 9 — `#spoken @arabic` working end-to-end with the new editor

## Milestones

| Milestone                             | Progress | Status             |
| ------------------------------------- | -------- | ------------------ |
| Per-PR ephemeral CF Workers (#83)     | 100%     | Shipped 2026-05-07 |
| Auto-staging deploy on PR merge (#89) | 100%     | Shipped 2026-05-08 |
| Language-shepherd permissions (#80)   | 100%     | Shipped 2026-05-08 |
| Users admin UI (#96)                  | 100%     | Shipped 2026-05-08 |
| Mode/language context accents (#78)   | 100%     | Shipped 2026-05-08 |
| Language scaffold preload (#74)       | 100%     | Shipped 2026-05-11 |
| Test chat trigger wiring (#81)        | 100%     | Shipped 2026-05-11 |
| AlertDialogAction sweep (#102)        | 100%     | Shipped 2026-05-11 |
| Epic #72 — Admin Portal Redesign      | ~75%     | In Progress        |

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
- [x] **#78** — Visual differentiation between mode/language editor (shipped 2026-05-08, PR #103 at `4cb84cd`; brand-color top-strip accent on `PageHeader`)
- [x] **#74** — Pre-load structural heading scaffold for new language documents (shipped 2026-05-11, PR #106 at `266017b`; Frank P2 fix: scaffold-readiness gate on Create button + hard guard in handler)
- [x] **#81** — Wire test chat to active mode + language selection (shipped 2026-05-11, PR #107 at `3902613`; pre-pends `#<mode> @<lang>` per worker #211/#212 deterministic cascade)
- [ ] #76 — Replace six-box mode editor with markdown editor + TOC — **NOW UNBLOCKED by worker #213 (Phase 1 migration shipped 2026-05-11)**
- [ ] #77 — Comment-block syntax in editor (visual highlighting half: paused awaiting Ian's editor-library decision, tentative pick CodeMirror 6; backend stripping half tracked as bt-servant-worker#201)
- [ ] #82 — Mode data migration (portal side) — **NOW UNBLOCKED by worker #213**

Backend dependencies (all in `unfoldingWord/bt-servant-worker`, the actual API server — see 2026-05-08 evening session for the engine→worker refile audit):

- [x] bt-servant-worker#197 — Language CRUD endpoints — shipped 2026-05-09 (worker PR #202).
- [x] bt-servant-worker#198 — Per-org language scaffold endpoint — shipped 2026-05-09 (worker PR #205).
- [x] bt-servant-worker#199 — `#<mode> @<language>` trigger syntax — superseded by worker #211; deterministic 3-tier cascade (exact → prefix → Levenshtein ≤ 2) with LLM-driven disambiguation downstream of parsing shipped 2026-05-11 (worker PR #212).
- [x] bt-servant-worker#200 — Mode data migration Phase 1 (synthesize markdown on GET, tolerate both shapes on PUT) — shipped 2026-05-11 (worker PR #213).
- [ ] bt-servant-worker#201 — Strip Ulysses-style comments at prompt assembly — filed 2026-05-08, replaces misfiled engine #205. **Last open worker blocker**; gates portal #77 backend half.

### Tech debt / housekeeping

- [ ] #91 — Bump JavaScript actions to Node 24-compatible majors (`actions/checkout@v4` etc.) before GitHub's Jun 2 2026 forced opt-out / Sep 16 2026 hard removal. Filed 2026-05-08 after the deprecation annotation surfaced on the first staging-on-merge run.
- [ ] #99 — Admin password reset via `/api/admin/users` PUT doesn't invalidate target user's existing sessions. Filed 2026-05-08 while building #96 — pulled the password-reset field from the edit dialog until this lands. Pre-existing on the X-Admin-Secret CLI path too.
- [x] **#102 — AlertDialogAction sweep** — shipped 2026-05-11, PR #108 at `65d69b5`. All five remaining destructive-confirm dialogs now use plain `<Button>` + manual close on success; policy extracted as `runConfirmedAction` helper in `src/lib/run-confirmed-action.ts` with 6 unit tests pinning the contract.

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

### 2026-05-08 (evening) — Cross-repo issue audit, family-wide misfile correction, #78 shipped

**Completed:**

- **PR #103 / #78 — Brand-color context accents for mode/language editor pages.** First Epic-#72 win this session. `PageHeader` gains an optional `variant: "modes" | "languages"` prop that paints a 3px top accent strip in Inspire blue (`oklch(0.71 0.108 226)`) for Modes / Cultivate teal (`oklch(0.78 0.054 195)`) for Languages. Other PageHeader consumers (Baruch, Admin Users) stay neutral. New tokens land as `--brand-modes` / `--brand-languages` in `globals.css` (light + dark). Color carries via CSS variable so future theme work can re-tune without touching the component. Frank cleared no medium+. Merged at `4cb84cd`.
- **Cross-repo issue audit + 5 misfile corrections.** Discovered the portal's `ENGINE_BASE_URL` (`api.btservant.ai`) actually proxies to **`bt-servant-worker`**, not `bt-servant-engine`. The engine is a separate Python/FastAPI service that's been dormant since 2026-01-16 (last commit) — closed engine #178 "EPIC: CloudFlare Rebuild" (2026-01-15) was the cutover point. All chat orchestration, modes, prompt-overrides, languages-when-they-exist, and per-user state live in `bt-servant-worker/src/index.ts`. Five engine issues filed during the Epic-#72 push were misfiled: refiled to bt-servant-worker as #197 (Languages CRUD ← engine #206), #199 (trigger syntax ← engine #203), #200 (mode migration ← engine #204), #201 (Ulysses comment stripping ← engine #205); engine #207 was already self-closed wontfix-by-design earlier in the day. Each engine issue closed with a redirect comment.
- **New worker issue filed: bt-servant-worker#198** (per-org language scaffold endpoint) — companion to portal #74 once languages CRUD ships in worker.
- **Portal issue triage pass.** 36 open admin-portal issues inventoried; only 7 were on radar via the progress tracker. Outcomes:
  - **Filed:** portal #102 (AlertDialogAction sweep — known anti-pattern in `language-selector.tsx` + `mode-selector.tsx` + `user-memory-dialog.tsx`).
  - **Closed-with-evidence:** #15 (org-badge `dark:text-primary/70` removed at cited location), #17 (theme-toggle icon flipped per recommended fix), #26 (baruch SSE handling already in `worker/baruch.ts:148-190` since baruch PR #4 merged 2026-03-09), #42 (worker `MAX_OVERRIDE_LENGTH` 4000→8000 in worker PR #167 + portal doesn't enforce client-side limit anyway).
  - **Cross-linked:** #74 → worker #198 dependency; #76 → noted #28 / #54 / #55 / #59-bullet-3 will be obsoleted/subsumed; #81 → noted #50 dedupe overlap.
  - **Stamped:** ~21 March-2026 backlog issues each got a "confirmed still applicable as of 2026-05-08" comment with current file:line evidence, so future contributors don't redo the verification.

**In Progress:**

- **#77 visual highlighting half** — paused awaiting Ian's input on editor-library decision (CodeMirror 6 tentative; comment posted with three options + tradeoffs).

**Blockers:**

- **bt-servant-worker#197** (Languages CRUD) — gates portal #74, #76, #82 + real validation of #79 / #73.
- **bt-servant-worker#198** (Language scaffold endpoint) — gates portal #74.
- **bt-servant-worker#199** (`#<mode> @<language>` trigger syntax) — gates full functionality of portal #81.
- **bt-servant-worker#200** (Mode data migration Phase 1) — gates portal #76, #82.
- **bt-servant-worker#201** (Ulysses comment stripping at prompt assembly) — engine half of portal #77; portal-side editor highlighting is independent.
- **Portal #77 (visual highlighting)** — paused on Ian for editor-library decision.

**Architectural decisions captured today:**

- **The portal's API target is `bt-servant-worker`, not `bt-servant-engine`.** Verified via `wrangler.jsonc:15` (`ENGINE_BASE_URL: https://api.btservant.ai`) + `bt-servant-worker/src/index.ts:488-604` (modes endpoints registered there) + `bt-servant-engine/bt_servant_engine/apps/api/app.py` (no `orgs/*` admin routes — only `health`, `admin_logs`, `admin_status_messages`, `admin_datastore`, `admin_keys`, `chat`, `users`). The env var name is misleading; semantically it's `WORKER_BASE_URL`. Worker is the actual orchestrator: chat (Claude Sonnet), MCP tool dispatch, sandbox, memory, user state, modes/prompt-overrides/languages-when-they-ship. Future backend work for the portal lands in `bt-servant-worker`.
- **bt-servant-engine is dormant.** Last commit 2026-01-16; last merged PR 2026-01-07 (#177). Closed engine #178 "CloudFlare Rebuild" (2026-01-15) was the migration. Engine #172 "Detangle WhatsApp logic from BT Servant Engine logic" (closed 2025-12-09) confirms WhatsApp also moved off engine. The whatsapp-gateway repo's `wrangler.toml` confirms `ENGINE_BASE_URL = https://api.btservant.ai` (= worker). Future portal/whatsapp-gateway backend work goes to bt-servant-worker.
- **bt-servant family inventory (15 repos):** `bt-servant-worker` (active, primary API), `bt-servant-admin-portal` (this), `bt-servant-engine` (dormant), `bt-servant-engine-data-loaders`, `bt-servant-whatsapp-gateway`, `bt-servant-web-client`, `bt-servant-message-broker`, `bt-servant-kb-worker`, `bt-servant-log-viewer`, `bt-servant-telemetry`, `bt-servant-site`, `bt-servant-report-sender`, `baruch` (separate prefix; setup AI assistant), `engineering-practices`. The portal's Epic-#72 backend dependencies all live in `bt-servant-worker`.

**Next Steps:**

- **Wait on Ian for portal #77 editor-library decision** (CodeMirror 6 tentative; awaiting sign-off before code).
- **Unblocked Epic-#72 picks:** **#81 mode-only** ships as a half-feature against worker today (language portion blocked on worker #197 + #199); avoid unless half-feature is acceptable. **#74, #76, #77 visual half, #82** all blocked on bt-servant-worker.
- **Other unblocked portal-side wins** (not Epic #72): **#102** (AlertDialogAction sweep — small, mechanical, three components), **#99** (admin password-reset session invalidation in portal worker BFF), **#91** (Node 24 actions bump, time-bound Sep 2026).
- **Watch bt-servant-worker** for any of #197 / #198 / #199 / #200 / #201 to land — each unblocks portal-side work.

### 2026-05-11 — Worker weekend cleared 4 blockers; portal shipped #74, #81, #102

**Context entering the session:** Ian shipped five worker PRs over the weekend, closing four of the five worker blockers (#197, #198, #199, #200; only #201 remained). Demo path `#spoken @arabic` end-to-end is now unblocked at the engine layer.

**Completed:**

- **PR #105 — AGENTS.md uw-sandbox routing note.** Tiny housekeeping: explicit "run npm/wrangler/etc. inside `uw-sandbox`" instruction added at the top of `AGENTS.md` Commands section. Prevents host/container toolchain drift. Frank cleared no findings. Merged at `cca0f72`.
- **PR #106 / #74 — Pre-load structural scaffold for new language documents.** Wires the portal to bt-servant-worker's new per-org `language-scaffold` endpoint (worker PR #205). New `useLanguageScaffold` hook + `getLanguageScaffold` API client + BFF route (`GET /api/config/language-scaffold` only; PUT/DELETE not exposed yet — no UI to gate them). `LanguagesPage.handleCreateLanguage` reads cached scaffold; on create the new doc opens with the org's structural template (5 H2 sections with `%%` Ulysses guidance comments) instead of an empty textarea. **Drive-by:** `putLanguage` unwrap fix to match `getLanguage` (response shape was `{ org, language, message }` but the client cast it directly as `Language`). Tests added for scaffold + putLanguage unwrap (10 cases total via `vi.spyOn(globalThis.fetch)`). **Frank P2:** the initial cut fell back to `document: ""` when the scaffold query hadn't resolved or had failed — that's exactly the bug the feature meant to fix. Two-layer gate landed in `5b532f4`: Create button disabled until `scaffoldQuery.isSuccess`, with inline loading/error message; `handleCreateLanguage` hard-returns if scaffold data is absent. Frank re-reviewed clean. Merged at `266017b`.
- **PR #107 / #81 — Wire test chat to active mode + language selection.** Pre-pends `#<mode> @<language>` from the editor-tab selections to the outgoing chat message; the worker classifier strips both matched and unmatched tokens before history, so the prepended trigger never pollutes the stored conversation. New `applyTriggerPrefix` pure helper + 9 unit tests covering all (mode×lang) null/set permutations, message preservation, power-user mid-message-trigger override case, and empty message edge. New `<ActiveTriggerStrip>` row below the chat header shows the literal trigger that will be prepended (e.g. `#spoken @arabic`) in monospace, or _Default — no override_ italic muted when neither is set; reads live from `ui-store` so it updates as the user navigates tabs. Frank cleared both rounds. Merged at `3902613`.
- **PR #108 / #102 — AlertDialogAction sweep.** All five remaining destructive-confirm dialogs (`language-selector` Unpublish + Delete, `mode-selector` Unpublish + Delete, `user-memory-dialog` ClearMemoryButton) now use plain `<Button>` + controlled-dialog state + manual close on success, matching the `admin-users.tsx` precedent from PR #100. Policy extracted as `runConfirmedAction` in `src/lib/run-confirmed-action.ts` — 6 unit tests pin the contract (happy path, rejection → no onSuccess, Error.message extraction, non-Error fallback, default fallback, temporal ordering). Parent callback signatures changed to `Promise<void>` so dialogs can await; `mutateAsync` adopted in `languages.tsx` and `manual-config.tsx`. **Frank P2:** the synchronous-fire Publish button (no confirmation dialog) was calling `void onSetPublished(...)` — `void` doesn't catch a rejection, so a failed publish bubbled as an unhandled promise rejection. Fixed in `1197608` with explicit `.catch(() => {})` matching pre-PR silent-failure behavior. Frank re-reviewed clean. Merged at `65d69b5`.
- **Upstream PR: `unfoldingWord/uw-dev-skills#1` — local-date session conventions.** Surfaced when wrapping up: the SOD/EOD/progress templates implicitly assumed `date` in the shell, but `uw-sandbox` reports UTC so evening sessions could create a duplicate next-day tracker entry. Updated all three command templates to (a) use the user-local date from the system prompt's `currentDate` field and (b) document the multi-session-per-day convention (append qualifier `morning`/`afternoon`/`evening`/`late-evening` rather than duplicate top-level date heading). Merged.

**In Progress:**

- None — all four PRs merged.

**Blockers:**

- **bt-servant-worker#201** (Strip Ulysses-style comments at prompt assembly) — only remaining open worker blocker; gates portal #77 backend half. Portal #77 visual-highlighting half remains paused on Ian's editor-library decision.

**Frank review patterns surfaced this session:**

- **Cite the SHA you reviewed.** Two reviews this session bit on stale code — Frank cited line numbers from an older commit while CI ran against a newer one. Both resolved by re-running review against the fix SHA. The fix → re-review cycle works as long as the SHA the reviewer cites is named explicitly.
- **`mutateAsync` rejection handling.** Switching from `mutate` to `mutateAsync` is not free — `void` operator suppresses no-floating-promises lint but does NOT catch the rejection. Any sync-fire caller of an async callback needs an explicit `.catch()`, or it'll show up as an unhandled promise rejection in production console.

**Patterns / decisions captured today:**

- **Tests under `tests/` can pull from `src/` via `@/*` path mapping in `tsconfig.worker.json`.** Added the path mapping so `tests/chat-api.test.ts`, `tests/languages-api.test.ts`, etc. can `import { applyTriggerPrefix } from "@/lib/chat-api"`. Transitively-imported `src/` modules typecheck under worker tsconfig as long as they only use Web/Worker types (no DOM, no JSX). Lives in `tsconfig.worker.json:32-35`.
- **`runConfirmedAction` is the canonical destructive-dialog policy.** Single helper in `src/lib/run-confirmed-action.ts` owns the "clear error → await → close on success, set error and stay open on failure" lifecycle. All five destructive-confirm dialogs call it identically; future destructive UIs should reuse it rather than re-implementing.
- **Worker contract validation: static analysis suffices when both sides are source-readable.** The Languages CRUD + scaffold endpoint contracts were validated by reading worker `src/index.ts` head + portal client code, without live curl. Worker has 572 tests + Ian designed the endpoints to match portal calls. Net cost: ~10 minutes; net value: high confidence to start building. Live smoke can come pre-demo.
- **The `#mode @language` trigger lives entirely in the message text.** No new wire field on the chat endpoint. Worker classifier extracts tokens deterministically (3-tier cascade: exact → unique prefix → unique Levenshtein ≤ 2; worker #211 / PR #212), strips both matched and unmatched tokens before history, and routes unmatched to the orchestrator's system prompt for a contextual "did you mean…" reply. Portal-side: just prepend `#<mode> @<lang>` to the outgoing message.
- **Local user date for session entries, not container `date`.** `uw-sandbox`'s system clock often reports UTC; during local-evening sessions that's tomorrow's date. SOD/EOD/progress templates and memory entry `feedback_local_date_for_sessions.md` now codify: read from system prompt's `currentDate`, append session-qualified sub-entries for same-day continuation rather than duplicate date headings.

**Next Steps:**

- **#76 — Replace six-box mode editor with markdown editor + TOC.** Now unblocked (worker #213 shipped today). This is the load-bearing piece left for the June 9 demo path — once it lands, `#spoken @arabic` end-to-end works from the new editor. Pairs with #82 (portal-side mode data migration) which is also unblocked.
- **#82 — Mode data migration (portal side).** Companion to worker #213. Worker now synthesizes markdown on GET (`format: "markdown"` + `originalSlots` for diagnostics) and tolerates both shapes on PUT — portal just needs the editor wire-up.
- **#77 visual half** — still paused on Ian's editor-library decision. Continue waiting.
- **Backlog tech debt** when major Epic #72 demo path is in place: **#99** (password-reset session invalidation), **#91** (Node 24 actions bump).

## Known Issues

- **#99 — Admin password-reset doesn't invalidate target user's existing sessions.** `PUT /api/admin/users/{email}` accepts a `password` field that updates the hash but leaves the user's existing session records valid until expiry. Pre-existing on the X-Admin-Secret CLI path; pulled the password-reset field from the `AdminUserEditDialog` (PR #100) until this is fixed.

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
- **The portal's API target is `bt-servant-worker`, not `bt-servant-engine`** (evening session). The env var `ENGINE_BASE_URL` is misleading — it points to `https://api.btservant.ai` which resolves to bt-servant-worker (Cloudflare Worker on Hono). bt-servant-engine (Python/FastAPI) is dormant since 2026-01-16 (last commit) — the CloudFlare Rebuild EPIC (engine #178, closed 2026-01-15) migrated all chat orchestration to the worker. Backend work for the portal lands in `bt-servant-worker`. The trusted-portal auth model previously attributed to "engine" is actually the worker's auth model — same conclusion (single shared admin token, no per-user identity on admin paths), correct repo.
- **Brand context accents (issue #78).** Mode-editing and language-editing surfaces share a `PageHeader` and would otherwise look identical. A 3px top accent strip — Inspire blue (`oklch(0.71 0.108 226)`) for Modes, Cultivate teal (`oklch(0.78 0.054 195)`) for Languages — gives at-a-glance context. Tokens live as `--brand-modes` / `--brand-languages` in `globals.css`. Variant-prop opt-in keeps neutral consumers (Baruch, Admin Users) untouched.

Notable decisions made 2026-05-11:

- **`#mode @language` override is inline in the message text, not a wire field.** Final form of worker #199 (shipped via #211 / PR #212) is a deterministic 3-tier cascade (exact → unique prefix → unique Levenshtein ≤ 2) parsed from the leading tokens of the user message. The worker strips both matched and unmatched tokens before history, and routes unmatched tokens to the orchestrator's system prompt for a contextual "did you mean…" reply. Portal-side, the per-turn override is implemented by pre-pending `#<mode> @<lang>` to the outgoing message — `applyTriggerPrefix` in `src/lib/chat-api.ts`. No new field on the chat endpoint contract.
- **`runConfirmedAction` is the canonical destructive-confirmation policy.** Lives at `src/lib/run-confirmed-action.ts`. Owns the "clear error → await → close on success, set error and stay open on failure" lifecycle for any async destructive confirmation. Used by all five destructive-confirm dialogs in the app as of PR #108. Future destructive UI should reuse this helper rather than re-implementing the try/catch/state-machine inline.
- **Tests in `tests/` can import from `src/`.** `tsconfig.worker.json` now declares `"@/*": ["./src/*"]` so test files exercise pure functions and fetch-wrappers from the browser-side codebase using the project's standard alias. Transitively-pulled `src/` modules must stay free of DOM/JSX types for this to typecheck under the worker tsconfig (currently true for `src/types/chat`, `src/types/language*`, `src/lib/chat-api`, `src/lib/languages-api`, `src/lib/language-scaffold-api`).
- **Local user date for session tracking, not container `date`.** `uw-sandbox`'s system clock is UTC; during local-evening sessions it may have already rolled to tomorrow. Skill templates (`.claude/commands/sod.md`, `eod.md`, `progress.md`) and upstream `unfoldingWord/uw-dev-skills` codify: use the user's local date from system prompt `currentDate`; for multiple sessions on one local day, append `(morning)` / `(afternoon)` / `(evening)` / `(late-evening)` sub-headings rather than duplicate top-level date headings.
