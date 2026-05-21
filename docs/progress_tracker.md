# BT Servant Admin Portal — Progress Tracker

> Single source of truth for project status. Updated via `/progress` and `/eod`.

## Current Status

**Phase**: Active development on Epic #72 (Admin Portal Redesign for Response Tuning); super-admin feature shipped end-to-end to staging.
**Last Updated**: 2026-05-21
**Demo target**: June 9 — `#spoken @arabic` working end-to-end with the new editor
**Last prod deploy**: 2026-05-13 (HEAD `25ea9c1` — staging is 4 commits ahead with the new-org CLI + super-admin feature, awaiting promotion)

## Milestones

| Milestone                                 | Progress | Status                                                   |
| ----------------------------------------- | -------- | -------------------------------------------------------- |
| Per-PR ephemeral CF Workers (#83)         | 100%     | Shipped 2026-05-07                                       |
| Auto-staging deploy on PR merge (#89)     | 100%     | Shipped 2026-05-08                                       |
| Language-shepherd permissions (#80)       | 100%     | Shipped 2026-05-08                                       |
| Users admin UI (#96)                      | 100%     | Shipped 2026-05-08                                       |
| Mode/language context accents (#78)       | 100%     | Shipped 2026-05-08                                       |
| Language scaffold preload (#74)           | 100%     | Shipped 2026-05-11                                       |
| Test chat trigger wiring (#81)            | 100%     | Shipped 2026-05-11                                       |
| AlertDialogAction sweep (#102)            | 100%     | Shipped 2026-05-11                                       |
| Mode markdown editor + TOC (#76, #82)     | 100%     | Shipped 2026-05-11                                       |
| Retrospective audit batch (#112–#120)     | 89%      | 8 of 9 shipped 2026-05-11 (#117 deferred)                |
| Admin password reset → invalidation (#99) | 100%     | Shipped 2026-05-11                                       |
| Prompt Overrides retirement (#125)        | 50%      | Phase 1 shipped 2026-05-11; Phase 2 gated on worker #215 |
| Node 24 actions bump (#91)                | 100%     | Shipped 2026-05-13                                       |
| Dark mode polish (#133 + 6 subs)          | 100%     | Shipped 2026-05-13                                       |
| Chat panes cleanup (#31, #48, #50)        | 100%     | Shipped 2026-05-13                                       |
| New-org CLI stopgap (#139)                | 100%     | Shipped 2026-05-20                                       |
| Super-admin role + UI (#138)              | 100%     | Shipped 2026-05-20 (PR A backend + PR B frontend)        |
| Epic #72 — Admin Portal Redesign          | ~95%     | In Progress (only #77 left)                              |

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
- [x] **#76 + #82** — Mode markdown editor + TOC + portal-side migration (shipped 2026-05-11, PR #110 at `24e98c3`; new `/modes` page mirroring languages, six-box deprecated, `PromptMode.overrides` removed from portal type; #82 closed retroactively at EOD)
- [ ] #77 — Comment-block syntax in editor (visual highlighting half: paused awaiting Ian's editor-library decision, tentative pick CodeMirror 6; backend stripping half — worker #201 closed 2026-05-11)

Backend dependencies (all in `unfoldingWord/bt-servant-worker`, the actual API server — see 2026-05-08 evening session for the engine→worker refile audit):

- [x] bt-servant-worker#197 — Language CRUD endpoints — shipped 2026-05-09 (worker PR #202).
- [x] bt-servant-worker#198 — Per-org language scaffold endpoint — shipped 2026-05-09 (worker PR #205).
- [x] bt-servant-worker#199 — `#<mode> @<language>` trigger syntax — superseded by worker #211; deterministic 3-tier cascade (exact → prefix → Levenshtein ≤ 2) with LLM-driven disambiguation downstream of parsing shipped 2026-05-11 (worker PR #212).
- [x] bt-servant-worker#200 — Mode data migration Phase 1 (synthesize markdown on GET, tolerate both shapes on PUT) — shipped 2026-05-11 (worker PR #213).
- [x] bt-servant-worker#201 — Strip Ulysses-style comments at prompt assembly — closed 2026-05-11 by Ian (commit `ea5a911`); unblocks portal #77 backend half.

### Tech debt / housekeeping

- [ ] #91 — Bump JavaScript actions to Node 24-compatible majors (`actions/checkout@v4` etc.) before GitHub's Jun 2 2026 forced opt-out / Sep 16 2026 hard removal. Filed 2026-05-08 after the deprecation annotation surfaced on the first staging-on-merge run.
- [x] **#99 — Admin password reset → session invalidation** — shipped 2026-05-11, PR #128 at `fbadf98`. New `invalidateUserSessions(env, targetEmail, exceptSessionId?)` helper in `worker/auth.ts` (also fixes a latent fire-and-forget delete bug in `handleChangePassword`); cookie-path admins resetting their own password keep their current tab via `AdminScope.selfSessionId`; X-Admin-Secret path wipes wholesale. Password-reset field re-introduced in `AdminUserEditDialog` (was pulled in PR #100 pending this fix). 6 new worker tests in `tests/admin-auth.test.ts`.
- [x] **#102 — AlertDialogAction sweep** — shipped 2026-05-11, PR #108 at `65d69b5`. All five remaining destructive-confirm dialogs now use plain `<Button>` + manual close on success; policy extracted as `runConfirmedAction` helper in `src/lib/run-confirmed-action.ts` with 6 unit tests pinning the contract.
- [ ] **#117 — `/api/chat/stream` accepts arbitrary `user_id`** (deferred from 2026-05-11 retrospective batch). Worker validates UUIDv4 shape but not session ownership. Needs design call between (1) namespacing test-chat UUIDs as `test:<session.userId>:<uuid>` (smallest blast radius but wire-format change), (2) requiring `isAdmin` for cross-user, or (3) KV-tracked session→testChatUserId.
- [~] **#125 — Remove Prompt Overrides** (per Elsy + Christou, 2026-05-11 PM). Phase 1 (hide sidebar entry) shipped 2026-05-11, PR #127 at `a39954f` — single-file delete of the `<ActivityBarItem>` block + `faSliders` imports; `/prompt-configuration` route + worker proxy + upstream endpoint left intact as emergency escape. Phase 2 (full deletion of page + BFF route + types + tests) **gated on bt-servant-worker#215** — investigation surfaced that worker still consumes `_org_prompt_overrides` on every chat request via `readAllOrgKV` → DO body → `resolvePromptOverrides` → system prompt; KV inventory clear in both staging and prod (zero `{org}` keys), so worker patch will be invisible. Cross-link comment posted on portal #125 with revised sequence. (GitHub auto-closed #125 on PR #127 merge despite "Closes only partially" wording — reopened with explanation.)

## Session Log

### 2026-05-21 — No-code day: Elsy super-admin scope diagnosis + understand-anything trial

**Context entering the session:** SOD opened clean. PR #145 (2026-05-20 EOD tracker entry) still sitting open and green; no movement on prod promotion of the super-admin feature. Two thin work items surfaced: a Discord question from Elsy about staging behavior, and a tooling install.

**Completed:**

- **Elsy super-admin "doesn't mirror" question — diagnosed as architecture, not bug.** Elsy reported that user/org changes made via the new super-admin UI on `staging.btservant.ai/admin/users` don't appear on `staging-app.btservant.ai/chat`. Investigation walked the seven-repo BT Servant family on GitHub and verified at `unfoldingWord/bt-servant-web-client`:
  - The chat app is a separate Next.js 16 + NextAuth 5 surface (`src/auth.config.ts` on `main`): Google OAuth + a credentials provider whose `authorize()` accepts any email and returns a user object with no password check, no lookup against the portal's `AUTH_KV`, no role gating.
  - Zero references to `isSuperAdmin` or `AUTH_KV` across the web-client codebase.
  - First-pass reply framed this as "two separate systems for everything" — Elsy correctly pushed back with a counterexample: mode edits in the portal **do** propagate to the chat app. Refined model: **configs vs. identity.** Modes/languages/prompt configs route through `bt-servant-worker` (shared backend, `staging-api.btservant.ai`); both surfaces read from `ORG_CONFIG` KV. User/role records live in the portal's own `AUTH_KV`, separate from the worker, separate from the web-client's NextAuth.
  - "Hard-wired for uW" theory falsified: web-client defaults to `DEFAULT_ORG = unfoldingWord` via env, but staging has `NEXT_PUBLIC_ENABLE_ORG_SWITCHER = true` — modes made in other orgs would also show if the chat app switches context.
  - Reply drafted for Elsy with Ian teed up on the roadmap-level question: should the portal's user/role store also be the chat app's identity backend? Pending Seth send.
  - **Not filed as an issue** — this is a roadmap discussion that needs Tim + Ian, not a portal-side bugfix. Per the admin-portal-only scope rule, won't file cross-repo without alignment.

- **`/understand` knowledge graph trial (understand-anything plugin).** Installed `Lum1104/Understand-Anything` marketplace plugin, ran end-to-end on this codebase via pnpm 10 (pnpm 11 blocks native build scripts by default; tree-sitter binaries need them, so downgraded via corepack). Eight-batch parallel file-analyzer wave produced 353 nodes / 692 edges / 10 layers / 12-step guided tour over 140 files. One genuine miss caught by the assemble-reviewer (`getSessionId` in `worker/auth.ts`, 5 lines, below the significance filter but actually called from `worker/admin.ts`). Tested-by linker tagged 10 production nodes correctly (matches the 10 `.test.ts` files exactly). Dashboard up at `http://uw-sandbox.orb.local:5173/` (via `--host 0.0.0.0` after first launch only bound to container loopback).
  - **Decision:** keep `.understand-anything/` out of git (~500KB generated artifact that would churn on every refresh). Added to `.gitignore` as part of this EOD commit.
  - **Not enabling `--auto-update`** without an explicit ask — would install a commit hook; that's a higher-friction change that deserves its own conversation.

**In Progress:**

- **Elsy reply draft** — written, awaiting Seth review/send. Half-acknowledges that the unified-identity question is interesting and tees Ian up to answer whether it's on the roadmap. Length and tone calibrations offered (currently medium-length, owns the first-pass correction directly).

**Blockers / Carryover from 2026-05-20:**

- **bt-servant-worker#215** — still gates portal #125 Phase 2. No movement.
- **bt-servant-worker#191** — still gates Epic #72's fifth Goal (dynamic language-file loading). No movement.
- **#77** — still paused on Ian's editor-library decision (CodeMirror 6 tentative).
- **#117** — chat-stream user_id ownership; awaiting design call.
- **Super-admin feature** — still soaking on staging (4 commits ahead of prod since 2026-05-20). Promotion gated on Elsy's comfort.
- **#143 (worker-side `isSuperAdmin` redaction)** and **README docs PR** (CF dashboard KV-edit bootstrap path) — still on the queue from yesterday, not picked up today.

**Patterns / decisions captured today:**

- **Two-axis propagation model for the BT Servant stack.** Cross-app behavior splits cleanly along **(a) shared backend → propagates** vs **(b) per-app auth backend → does not.** Configs, modes, languages, prompts all hit `bt-servant-worker` and are therefore consistent between admin portal + chat web-client. Users, sessions, roles each live in their app's local store (portal → `AUTH_KV`; web-client → NextAuth JWT). The implication for product: anything we ship that _governs end-user behavior in the chat app_ needs to land in the worker's data model, not the portal's user model. The super-admin feature shipped where #138 asked it to (portal access), and Elsy's expectation (chat-app gating) is a different feature class.
- **First-pass framing is allowed to be wrong, but should be owned directly when falsified.** Elsy's counterexample about mode propagation falsified the "two separate systems for everything" framing in <10 minutes. The refined reply opens with "you're right, and I was too broad" rather than soft-pedaling. Cheap honesty buys more trust than careful hedging, and the corrected model (configs vs. identity) is more useful than the original.
- **pnpm 11 blocks postinstall builds by default.** Tree-sitter native binaries (`*.node` addons) need build scripts. Workaround for plugins/tools that ship tree-sitter: use pnpm 10 via `corepack prepare pnpm@10.15.0 --activate`. Long-term fix is `onlyBuiltDependencies` in `package.json` or a project-level `.npmrc` with explicit allowlist. Captured in case other tooling installs hit the same wall.
- **OrbStack containers expose ports via `<container>.orb.local` automatically — but only if the server binds to `0.0.0.0`, not container loopback.** Vite defaults to `127.0.0.1` when given `--host 127.0.0.1`; the dashboard skill passed exactly that, so the first dashboard launch was invisible from the macOS host. Rebind to `--host 0.0.0.0` and OrbStack's auto-DNS makes it reachable at `http://uw-sandbox.orb.local:<port>/`. Worth knowing for any future bg-job server we want to inspect from outside the sandbox.
- **Knowledge-graph trade-off: useful for cross-cutting questions, neutral for everyday coding.** The graph answers things grep can't (layer membership, tested-by coverage, cycle/orphan detection) and gives a fresh agent a mental model in seconds. It's not a function-level source of truth (one short helper was missed) and it goes stale the moment you merge. For this project specifically, the marginal value over the existing CLAUDE.md is modest — would shine more on a larger/less-documented codebase. Not committed; agents can regenerate locally on demand.

**Next Steps:**

- **Send Elsy reply** (Seth's call) — once sent, Ian's response on the unified-identity question determines whether to file a roadmap-level cross-repo issue or document the portal-vs-chat scope distinction somewhere durable.
- **#143 worker-side `isSuperAdmin` redaction** — still the smallest, highest-signal next code task (~30-min PR, defense-in-depth on yesterday's #142 P2 fix).
- **README docs PR** — CF dashboard KV-edit alternative to `op run -- curl`. Tiny.
- **Prod promotion of super-admin feature** — once Elsy confirms comfort.
- **#144 org slug case-normalization** — still needs design call on migration plan before scoping.

### 2026-05-20 — Super-admin feature end-to-end (3 PRs, helping Elsy onboard Haneen)

**Context entering the session:** SOD opened clean (5 days since last session, no new prod work). Then Ian/Elsy raised the question on Discord: how does one create a new org for the admin portal? Elsy needs to onboard Haneen for the demo and was blocked on engineering.

**Completed:**

- **#139 + PR #140 — `npm run create-org-admin` CLI stopgap.** Audit of the current code showed there's no UI for cross-org user creation: org-scoped admins are restricted to their own org (`worker/admin.ts:170`); `AdminUserCreateDialog` hardcodes `org: callerOrg`. The only cross-org path is the X-Admin-Secret CLI curl. Filed #138 (proper super-admin UI) + #139 (stopgap script) and shipped #139 first to unblock tonight's onboarding. Script in `scripts/create-org-admin.mjs` (plain Node 22 `.mjs`, no transpile, no new dep), wrapped via `npm run create-org-admin`. Reads `ADMIN_SECRET` from env (works with `op run --`), defaults to staging, refuses prod without `--confirm-prod`, `--dry-run` prints the constructed POST without sending. Auto-generates 16-char base64url passwords. README gains "Bootstrapping a new org" section. Merged at `4f7d5cb`. **Frank P1 round:** `--confirm-prod` only checked `--env prod`, but `--url` could target the known prod URL while `--env` defaulted to staging. Fix: classify the _resolved_ URL (`classifyResolvedUrl()` helper) and require `--confirm-prod` for known-prod URLs AND for any unknown `--url` override (treat-as-prod by default). Frank re-review clean.

- **#138 + PR #141 — `isSuperAdmin` role + super-by-session backend.** Two-PR split (A: backend, B: frontend) per design alignment with Seth. PR A:
  - `StoredUser.isSuperAdmin?: boolean` + `SessionData.isSuperAdmin?: boolean` (optional + undefined-as-falsy → zero KV migration).
  - `validateSession` re-hydrates the field on every request via the existing live-rehydration path; `handleLogin` + `handleMe` include it in responses.
  - New `AdminScope` variant `{ kind: "super-by-session"; selfEmail; selfSessionId }` alongside existing `super` and `org`. `requireAdminAuth` returns it when `session.isSuperAdmin === true`.
  - **"Super trumps isAdmin" rule:** a session with `isSuperAdmin: true` passes admin auth even if `isAdmin: false`. Without this, a super-admin who self-demoted isAdmin (allowed; they retain cross-org via super) would silently lock out on next request.
  - Cross-org filters in `createUser`/`listUsers`/`updateUser`/`deleteUser` short-circuit via `isCrossOrgScope(scope)`.
  - **Loud 403 over silent drop:** org admins attempting to grant or revoke isSuperAdmin get a `403 Cannot modify isSuperAdmin from your scope` rather than the field being silently dropped. Symmetric on grant and revoke. Defense in depth.
  - Self-mutation guards: super-by-session can self-demote isAdmin (super remains) but cannot self-demote isSuperAdmin (would lock out) and cannot self-delete. X-Admin-Secret CLI remains the recovery escape.
  - `safeUser` exposes `isSuperAdmin` so PR B's UI can render badges without a second round-trip.
  - 16 new tests (176 → 192 total): cross-org powers, super-trumps admit, self-mutation guards, org-admin escalation defense, X-Admin-Secret regression.
  - Merged at `d958b18`. **Frank P1+P2 round:** (P1) `.gitleaks.toml` path-allowlist was too broad — disabled every rule under `tests/*.test.ts`, not just generic-api-key false positives; (P2) `worker/config.ts:74` mutation auth checked only `session.isAdmin`, so a super-admin who self-demoted isAdmin (now allowed!) would get 403 on prompt-overrides / modes / languages writes despite the worker letting them into `/api/admin/users`. Fixes: extracted `hasAdminPowers(session) = isAdmin || isSuperAdmin` helper in `worker/config.ts`; narrowed gitleaks to `condition = "AND"` + `paths` + regex-shape on the matched secret (real credentials with AKIA / ghp* / sk* / slashes still flagged). 5 new config-authz tests pin the parity. Frank re-review clean.

- **#138 + PR #142 — Super-admin UI on `/admin/users` (frontend).** Closes #138.
  - `lib/permissions.ts` gains `hasAdminPowers(user)` — mirror of the worker helper; "super trumps" rule encoded in one place per side.
  - `RequireAdmin` + `ActivityBar` (Modes + Users entries) switch from `s.user?.isAdmin` to `hasAdminPowers(s.user)` so super-admins without isAdmin still see the sidebar entries and pass the route gate.
  - `AdminUserCreateDialog` + `AdminUserEditDialog` accept `callerIsSuperAdmin` prop. When set: editable Org field (create: free-text, pre-filled with `callerOrg`; edit: move-org with current value); Super-admin checkbox. Edit-dialog Super-admin checkbox disabled when `isSelf && already-super` (mirrors worker's 400 on self-demote-super). Submit handlers omit isSuperAdmin from the body for non-super callers (worker would 403 on `false`).
  - `AdminUsersPage` for super-admins: subtitle changes; Org column added; org filter dropdown (shadcn Select with sentinel "all" value); empty-state when filter yields zero rows; Super badge in role cell (initially mis-gated — see Frank fix below).
  - 7 new tests on `hasAdminPowers` truth table (188 total at PR open).
  - README updated: "Bootstrapping a new org" mentions the UI path now exists; new "Bootstrapping a super admin" section with the one-time PUT curl.
  - Merged at `ee7931d`. **Frank P2+P3 round:** (P2) Super badge was gated on `user.isSuperAdmin` alone, not also on `callerIsSuperAdmin`. Worker's `safeUser` returns isSuperAdmin to every admin caller including org admins viewing their own org-filtered list, so an org admin viewing a same-org colleague who also held super would see the cross-org role. (P3) The `__all__` org-filter sentinel could collide with a real org slug (orgs are free-text). Fixes: one-line gate on the badge plus a corrected comment; renamed sentinel to `ORG_FILTER_ALL_SENTINEL = "@@bt-servant:all-orgs@@"` centralized in `src/lib/admin-users-api.ts`; new `isReservedOrgSlug` helper + dialog guards reject creating/moving to the sentinel value. 4 new tests on the helper. Frank re-review clean.

- **Bootstrap end-to-end on staging.** `op` CLI isn't installed in `uw-sandbox`, so the README's `op run -- curl` recipe wasn't directly usable. Worked around two ways: (1) ad-hoc `ADMIN_SECRET='...' curl ...` (inline); (2) **KV-edit via the CF dashboard** — find `user:<email>` in `AUTH_KV` (staging KV ID `76b77b269f7c48b481f3448955950b57`), add `"isSuperAdmin": true` to the JSON value, save. Live re-hydration in `validateSession` (per PR A) means it takes effect on the next request — no logout/login needed. Then created Haneen's org from the UI: clicked "New user", typed a brand-new slug in the Org field, submitted. Verified the org appears in the filter dropdown. Whole feature confirmed working in the same session it shipped.

- **#143 filed — Worker-side `isSuperAdmin` redaction (follow-up).** Frank P2 closed the visible leak (badge gated by viewer) but the field is still on the wire for org-admin callers. Proper fix: parameterize `safeUser()` by viewer scope, omit `isSuperAdmin` from responses when caller is org-scoped. ~30-min PR, three call-site updates, three tests. Cross-linked to #138/#141/#142.

- **#144 filed — Org slug case-normalization (foot-gun).** Surfaced post-shipping when Seth asked whether org names are case-sensitive. They are — strict `===` everywhere, while emails are normalized to lowercase at `admin.ts:160`. So `Haneen` vs `haneen` are distinct orgs with separate users / modes / languages. Issue body proposes mirroring the email pattern (`org?.trim().toLowerCase()`) **but flags the migration concern**: without rewriting existing KV records AND coordinating with bt-servant-worker's per-org engine namespaces, lazy normalization would create org-cohesion drift (new users in `acme`, existing users still in `Acme`). Recommendation in the issue: don't ship until migration plan is scoped; lower-effort partial would be UI-side lowercasing-as-you-type.

**Day rollup:**

| Merged | Commit    | Closes |
| ------ | --------- | ------ |
| #140   | `4f7d5cb` | #139   |
| #141   | `d958b18` | —      |
| #142   | `ee7931d` | #138   |

**3 PRs merged, 2 issues auto-closed (#138, #139), 4 issues filed today (#138, #139, #143, #144), super-admin feature shipped end-to-end to staging and confirmed working via real bootstrap + new-org creation.**

**In Progress:**

- None code-wise. Staging is 4 commits ahead of last prod deploy (`25ea9c1` → `ee7931d`). Super-admin feature soaking on staging.

**Blockers:**

- **bt-servant-worker#215** — still gates portal #125 Phase 2. Ian's queue; no movement since 2026-05-11.
- **bt-servant-worker#191** — still gates Epic #72's fifth Goal (dynamic language-file loading). Ian's queue; no movement since 2026-05-06.
- **#77** — still paused on Ian's editor-library decision (CodeMirror 6 tentative).
- **#117** — chat-stream user_id ownership; awaiting design call.

**Patterns / decisions captured today:**

- **"Super trumps isAdmin" applied uniformly.** Initially shipped only in `worker/admin.ts requireAdminAuth`; Frank's PR #141 P2 caught the missing parity in `worker/config.ts` (prompt-overrides / modes / languages mutation auth). Now encoded as `hasAdminPowers(session)` in both worker/config.ts and src/lib/permissions.ts. Lesson: when introducing a new role with "trumps" semantics, audit every existing auth gate, not just the obvious one.
- **Loud 403 over silent drop.** When a body field is restricted by scope (`isSuperAdmin` only honorable by super scopes), reject with explicit 403 rather than silently ignoring. Silent drop masks UI bugs and lets attackers probe for missing checks.
- **Org-as-emergent-entity.** "Creating an org" = creating the first user with a new org slug. No separate orgs registry, no create-org API, no two-step UX. The free-text Org field in the dialog implicitly covers both "add user to existing org" and "create new org" paths. Elegant — but the trade-off (no validation) surfaced #144's case-sensitivity foot-gun.
- **KV-edit as alternative bootstrap.** `op`-less environments can edit `user:<email>` in `AUTH_KV` directly via the CF dashboard. Live re-hydration in `validateSession` means no logout. Worth documenting alongside the curl-based bootstrap (small README PR not done today).
- **Gitleaks PR-history vs. tip-only scope.** The scanner sees every commit added by a PR. Renaming a flagged string in a follow-up commit doesn't clear earlier-commit findings — gitleaks reads the file from the commit being scanned, not from HEAD. Durable fix is a `.gitleaks.toml` allowlist (centralized); ad-hoc renames only help if the original commit can be force-pushed away (CLAUDE.md gates that).
- **Gitleaks per-rule scope quirks.** Tried `targetRules` to scope an allowlist to a specific rule in 8.24.3 — config loaded but the per-rule scoping didn't filter. Pivoted to `condition = "AND"` with `paths` + regex-shape constraint on the matched secret. Outcome is narrower than path-only allowlist (per Frank's P1) without depending on `targetRules` working.
- **Sentinel-pattern for Radix Select "no filter".** Radix Select disallows empty-string values, so the "All orgs" entry needs a literal stand-in. Used `"@@bt-servant:all-orgs@@"` (distinctive bracketing + namespace), centralized in `src/lib/admin-users-api.ts` with an `isReservedOrgSlug` helper for create/edit dialog guards. Pattern reusable for any future "no filter" Select.
- **Frank-collaboration pattern this session:** three PRs, three review cycles, all clean on re-review after one round of fixes. P-level severities consistently P1/P2 (real bugs); response cycle averaged ~15 min from finding to push. Treating Frank's "I don't have evidence X works" caveats as separate-from-findings is the right framing — they're acknowledgement of test-coverage gaps, not blockers.

**Next Steps:**

- **#143 — Worker-side `isSuperAdmin` redaction.** ~30-min PR. Defense-in-depth follow-up to today's PR #142 P2 fix. Field-omit in `safeUser` for non-super scopes. Three call-site updates + three tests.
- **README docs PR.** Mention CF dashboard KV-edit as alternative to `op run -- curl` for super-admin bootstrap. Tiny.
- **Prod promotion.** Super-admin feature soaking on staging since today; promote when Elsy is comfortable. Would also need a fresh KV-edit (or curl) on prod to bootstrap a super admin there — staging's bootstrap doesn't carry over.
- **#144** — needs design call on the migration before scoping. Don't ship lowercase-at-boundary without a plan for existing mixed-case data.
- Yesterday's deferred items still available if a smaller next-task is wanted: User Memory enhancements (#56/#57/#53), deep links (#28), shell perf nit (#52).

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

### 2026-05-11 (morning) — Worker weekend cleared 4 blockers; portal shipped #74, #81, #102

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

### 2026-05-11 (evening) — Mode markdown editor shipped; retrospective audit + cleanup batch

**Context entering the session:** Worker #213 had just shipped Phase 1 mode migration earlier in the day; this evening session implemented the consumer side end-to-end, then ran a retrospective audit of the past 5 days of work and shipped 4 follow-up PRs from the findings.

**Completed:**

- **PR #110 / #76 + #82 — Mode markdown editor + TOC.** New `/modes` page mirrors the `languages.tsx` pattern (selector toolbar + `MarkdownToc` + `MarkdownEditor` + `lastSyncedDoc` autosave + pending-switch guards). `PromptMode.overrides` removed from the portal type per #82's "no legacy slot-map awareness" AC. `useSetModePublished` dropped — the new worker contract requires `document` on every PUT, so publish/unpublish goes through `useSaveMode` with the full body (mirrors `useSaveLanguage`). Existing `/prompt-configuration` route stripped to org-overrides-only and renamed "Prompt Overrides" in the sidebar with a new `faSliders` icon (Modes takes the `faPenToSquare` slot). Canonical 7-section H2 scaffold at `src/lib/mode-scaffold.ts` mirrors the worker's `toMarkdownView` synthesis for an empty mode so GET → PUT → GET is identity-clean. Drive-by: `putMode` now unwraps `{ org, mode, message }` envelope — third instance of the `putLanguage` / `putMode` pattern (the latent `putOrgOverrides` instance was caught in the audit immediately after).
- **Retrospective audit of the 2026-05-07 → 2026-05-11 PR stretch.** Two parallel subagents — one for test-coverage gaps, one for latent-bug / missed-piece hunting. Findings synthesized into 9 issues: #112 (server-side authz hole on config mutations), #113 (`putOrgOverrides` envelope), #114 (silent save errors), #115 (createAdminUser password floor), #116 (UI selection leak across logins), #117 (chat-stream user_id ownership — deferred), #118 / #119 / #120 (test backfills). Codex/Frank confirmed the audit + reframed #111 (originally filed as UI-only) as the surface-side of #112's load-bearing server-side authz gap.
- **PR #121 / #112 + #111 + #115 — Worker authz + password policy.** `worker/config.ts` now 403s non-admins on PUT/DELETE for both `/api/config/modes/{name}` and `/api/config/prompt-overrides`. `/modes` + `/prompt-configuration` wrapped in `<RequireAdmin>`. Sidebar entries gated on `isAdmin`. `mode-selector.tsx` "New Mode" + Delete buttons gated. `validatePasswordPolicy` (8 ≤ len ≤ 128) applied to `createUser` + `updateUser`. **Frank P2 fix `22ba60b`:** `updateUser` switched to `body.password !== undefined` so an empty-string admin reset doesn't silently no-op. 10 new tests in new `tests/config-authz.test.ts` + 7 new in `tests/admin-auth.test.ts`. Merged at `69d033b`.
- **PR #122 / #113 + #114 + #116 — UX cleanup cluster.** `putOrgOverrides` envelope unwrap (third instance of the pattern, with a shared `unwrapOverridesResponse` helper). "Save failed: …" banner on modes + manual-config + languages pages (with `genericMutationError` filter on languages to separate from the existing forbidden-error banner). `useAuth.login` calls `resetUi()` symmetrically with logout. Modes page got a defensive useEffect parallel to languages.tsx:207-211 that drops a stale `selectedMode`. **Frank P2 fix `09a6b0c`:** autosave previously retried indefinitely on a failed save (`isPending` flip re-fired the effect). New `lastFailedDoc` state pauses autosave for the same draft until the user edits further or clicks Save manually; clears on success or selection change. Applied symmetrically to languages.tsx and modes.tsx. 8 new tests for `getOrgOverrides` / `putOrgOverrides`. Merged at `89d3c90`.
- **PR #123 / #118 + #119 — High-value test backfill.** `tests/permissions.test.ts` (18 tests) pins the trinary back-compat (`undefined` / `"*"` / `string[]`) on `hasLanguageRights`, `hasAnyLanguageRights`, `filterAuthorizedLanguages` — the sole portal-side language gate in the trusted-portal model. `tests/markdown-headings.test.ts` (18 tests) pins the four-state suppression machine (fence + paragraph comment + inline span + slug uniqueness) plus a combined-state regression. Merged at `92cfdf4`.
- **PR #124 / #120 — API client test backfill.** `tests/admin-users-api.test.ts` (15 tests, new file) — entire `admin-users-api.ts` was untested; pins the 403-vs-other-4xx error-class branching that the UI dialogs depend on, URL-encoding on email path params, non-JSON error body resilience. Added `listModes` / `deleteMode` / `getUserMemory` / `deleteUserMemory` / `setUserMode` / `clearUserMode` coverage (15 new) — including a **load-bearing body-shape assertion** that `setUserMode` sends `{ mode }` not `{ name }` (easy mis-refactor since the function param is named `mode`). Added `listLanguages` / `getLanguage` / `deleteLanguage` coverage (11 new) — pins the `operation` discriminant (`read` / `delete`) on `LanguageForbiddenError`. Rebased on main during merge to resolve a `tests/config-api.test.ts` conflict with PR #122; merged at `f19f798`.
- **Issue #125 filed:** Remove Prompt Overrides — per Elsy (Epic owner) + Christou ("we're essentially merging those squares into one big square"). The split-into-two-pages choice from PR #110 was transitional; the Epic's intent was full replacement. Phase 1 (hide sidebar entry) is small and matches Elsy's explicit ask; Phase 2 (delete page + worker BFF route + upstream worker endpoint) needs Ian's confirmation on whether the worker still consumes `/api/v1/admin/orgs/{org}/prompt-overrides` at chat time.

**In Progress:**

- None code-wise. #125 will be picked up in a fresh session.

**Blockers:**

- **#125 Phase 2** awaits Ian's confirmation on worker consumption of `/api/v1/admin/orgs/{org}/prompt-overrides` at chat time.
- **#77 visual half** — still on Ian's editor-library decision (CodeMirror 6 tentative).

**Frank review patterns surfaced this session:**

- **Subagents catch bug clusters humans miss.** Two parallel subagents (one test-coverage, one latent-bug) produced 9 actionable issues from the 5-day stretch in ~5 minutes wall-clock. The latent-bug agent specifically caught the `putOrgOverrides` envelope-unwrap bug (third instance of a pattern I'd already fixed twice in `putLanguage` / `putMode`) — the kind of "I should have spotted this when writing it" miss that retrospective audits exist to catch.
- **The "hammered-API retry" autosave failure mode.** Frank's PR-122 P2 — TanStack's `error` clears on each retry's `pending` phase, so a failing autosave both hammers the upstream API and flickers the error banner. The fix pattern (track `lastFailedDoc` separately; gate autosave on `debouncedDraft !== lastFailedDoc`; clear on edit or manual retry) is reusable for any optimistic-mutation UI.
- **GitHub `Closes #N` only auto-closes the FIRST issue in a comma-list.** PR-body syntax `Closes #112, #111, #115` closed only #112 on merge — the others stayed open and needed manual closure at EOD. Captured in `feedback_gh_closes_keyword.md`. Workaround: repeat the keyword (`Closes #112, closes #111, closes #115`) or one-per-line.

**Patterns / decisions captured today (evening):**

- **Server-side authz is load-bearing; UI gates are defense-in-depth.** Per the trusted-portal model (worker holds the upstream admin token; engine has zero user identity), the portal worker is the only enforcement point. PR #110 added UI button gates on mode-selector, but PR #121 surfaced that the worker itself was happily proxying any authenticated session's PUT/DELETE. Both layers now exist; route `<RequireAdmin>` is the third backstop. Frank's framing was right: "UI gating without server gating is theater with a lint-friendly costume."
- **Canonical mode scaffold matches the worker's synthesizer.** New modes open with all 7 H2 sections (`## Identity`, `## Teaching Methodology`, …) populated empty — matches what the worker emits via `toMarkdownView` for a slotted mode with empty bodies, so round-trip GET → PUT → GET is identity-clean at the section level. Constant lives at `src/lib/mode-scaffold.ts`.
- **`lastFailedDoc` autosave gate.** Track failed-save drafts separately from `lastSyncedDoc`; pause autosave when `debouncedDraft === lastFailedDoc`; clear on success, selection change, or further edit. Without this, a 4xx-failing save retries on every `isPending → false` and hammers the API. Pattern in `src/app/pages/{languages,modes}.tsx`.
- **GitHub `Closes` keyword is non-list-aware.** Captured as memory. Future PRs that close multiple issues should repeat the keyword.

**Next Steps:**

- **#125 — Remove (or hide) Prompt Overrides** is the highest-leverage next pick. Phase 1 (hide sidebar entry, ~3-line PR) matches Elsy's explicit ask and unblocks the Epic's "merging squares into one big square" intent. Phase 2 needs Ian for worker consumption check first.
- **#77 backend half is now unblocked** (worker #201 closed today) but the visual half still awaits Ian's editor-library decision.
- **Tech debt backlog**: **#99** (password-reset session invalidation), **#91** (Node 24 actions bump), **#117** (chat-stream `user_id` ownership — needs design call).
- The Epic #72 demo path (`#spoken @arabic` end-to-end through the new editor) is now functionally complete; June 9 demo is in good shape with #77 visual-highlighting as the only optional polish remaining.

### 2026-05-11 (late-evening) — #125 Phase 1 + worker companion filed + #99 shipped

**Context entering the session:** Started as a continuation of the evening session (per local-date convention). Frank had cleared PR #126 but flagged a P2 on stale "engine" terminology in the #125 references. The natural next pick from the evening's Next Steps was Phase 1 of #125 (sidebar hide), then #99 (password reset session invalidation).

**Completed:**

- **PR #126 follow-up — Frank P2 fix on tracker terminology.** Six occurrences of stale "engine" wording in the #125 roadmap text replaced with "worker / upstream worker endpoint / worker consumption" to match the project's actual architecture (engine dormant since 2026-01-16; ENGINE_BASE_URL var points at bt-servant-worker). Path corrected from `/api/config/prompt-overrides` (portal BFF) to `/api/v1/admin/orgs/{org}/prompt-overrides` (worker upstream) in the AC line that specifically refers to chat-time consumption. Audited closed Epic #72 sub-issues (#79, #80, #81, #82, #96) — all still contain "engine" references but they're accurate historical artifacts from before the 2026-05-08 refile audit; left untouched per Seth. Issue #125's body also patched for the same drift (7 lines). Merged at `8dd4f96` after Frank re-approved.
- **PR #127 / #125 Phase 1 — Hide Prompt Overrides sidebar entry.** Matches Elsy's exact ask ("hide Prompt Overrides from the Menu"). Single-file change: removed the `<ActivityBarItem>` block + `faSliders` light/solid imports in `src/components/activity-bar.tsx`. `/prompt-configuration` route + `worker/config.ts` proxy + `"prompt-configuration"` UI section entry + `use-sync-section` mapping all preserved deliberately as an emergency URL escape during the transition. Frank approved no findings (1 file, 14 deletions). Merged at `a39954f`.
- **Worker companion issue filed: bt-servant-worker#215.** Pre-emptively investigated whether Phase 2 was safe before proceeding. Two parallel Explore agents traced the chat pipeline in `/workspace/bt-servant-worker` and surfaced that the worker still consumes org-level overrides on **every** chat request: `readAllOrgKV` (`src/index.ts:832–838`) → DO body injection at line 943 → `resolvePromptOverrides(orgOverrides, modeOverrides, userOverrides)` (`user-do.ts:1088–1090`) → all 7 slots concatenated into `buildSystemPrompt` (`system-prompt.ts:204–228`). Filed bt-servant-worker#215 with a 5-step migration plan: ~10-line worker patch (drop the KV read; pass `{}` to resolver), the existing hardcoded `DEFAULT_PROMPT_VALUES` (`bt-servant-worker/src/types/prompt-overrides.ts:104–160`) as the safe fall-through, KV inventory commands, and a clean architectural alignment note (Ian's commit `0a7edc8` already removed the parallel `defaultMode` concept). Pre-flight KV inventory came back empty (zero non-`:modes` keys in both staging `1416f321fbda450095214111d38d211a` and prod `c1828624ab434f079776bddd171882d9`) — worker patch will be invisible to all orgs. Cross-link comment on portal #125 with revised 5-phase sequence (worker patch → soak → portal Phase 2 → KV cleanup no-op → worker admin-route cleanup). Phase 2 in this repo paused pending #215. Seth confirmed his scope is admin-portal only and Ian handles worker work; I'm not authoring the worker PR.
- **PR #128 / #99 — Admin password reset invalidates target sessions.** Closes the "reset password but the old cookie keeps working" gap on `PUT /api/admin/users/{email}`. Extracted `invalidateUserSessions(env, targetEmail, exceptSessionId?)` helper in `worker/auth.ts` — pagination over `session:*`, filter by stored email, optional skip, **awaits all deletes** before returning (fixed a latent fire-and-forget bug in the existing `handleChangePassword` pattern in the process). Plumbing: `getSessionId` now exported from `auth.ts`; `AdminScope.org` gains `selfSessionId: string | null` populated by `requireAdminAuth` so the cookie-path admin can preserve their current tab when resetting their own password; X-Admin-Secret CLI has no caller session by design. `updateUser` only invalidates when `body.password !== undefined` (PUTs that just touch name/role/language_rights leave sessions intact). Frontend: re-introduced the password field in `AdminUserEditDialog` per AC #4 (was pulled in PR #100 pending this fix) with hint text adapting to self vs other ("this tab keeps working" vs "share the new password out-of-band"). 6 new worker tests covering the matrix; 160/160 across full suite. Frank approved no findings. Merged at `fbadf98`.

**In Progress:**

- None code-wise.

**Blockers:**

- **bt-servant-worker#215** — gates portal #125 Phase 2. Ian's queue; no portal-side action available.
- **#77 visual highlighting half** — still paused on Ian's editor-library decision (CodeMirror 6 tentative).

**Frank review patterns surfaced this session:**

- **One clean pass per PR.** Three PRs this session (#126, #127, #128); all approved on first review with no findings. The PR descriptions were thorough and tightly scoped, which seems to be doing a lot of the work — Frank flags less when the PR is already "reading like it's been reviewed."
- **Sub-agent pre-flight prevents Frank P2s.** Before opening the worker companion PR (which I ultimately didn't author per scope), I ran two parallel Explore agents to verify Phase 2 was safe. The investigation surfaced the chat-pipeline consumption that the #125 issue's own AC gate clause anticipated but the user's "Ian said proceed" had verbally cleared. Catching that _before_ opening a PR (instead of after Frank flags it) saved a review round.

**Patterns / decisions captured today (late-evening):**

- **`Closes #N` fires regardless of prose qualifier.** PR #127's body said `Closes #125 only partially — Phase 2 stays open` and GitHub auto-closed #125 anyway. The "only partially" wording is invisible to GitHub's keyword parser. Reopened with explanation. Compounds with the earlier "Closes is non-list-aware" gotcha — combined rule: if you don't want a PR to auto-close an issue, **omit the keyword entirely** (use "Tracks #N" or "Related to #N"). Captured in updated memory.
- **Cross-repo deletion sequencing.** When the portal needs to retire a feature whose data is consumed by the worker, the right sequence is: (1) verify pre-flight inventory of the storage namespace; (2) file a PR-ready issue in the worker repo with a migration patch sketch; (3) wait for the worker to stop consuming; (4) only then delete the portal-side editing surface. Trying to delete the portal-side surface first strands the storage as un-editable hidden state still influencing chat. Encoded as project decision under #125's sequence.
- **`invalidateUserSessions` helper and the fire-and-forget bug.** Cloudflare Workers don't guarantee unawaited promises complete after a response is returned. The existing `handleChangePassword` built up `deletePromises` and never awaited them — deletes were best-effort. The new helper always awaits before returning. Latency cost is proportional to total session count for that email and is acceptable for low-frequency endpoints (admin password reset, self change-password).
- **Scope = admin-portal only across the bt-servant family.** Seth's coding duties are scoped to bt-servant-admin-portal; Ian handles work in sibling repos (worker, engine, etc.). Even when a cross-repo change is technically clear-cut, file a PR-ready issue in the sibling repo with crosslinks rather than switching directories. Encoded as memory `feedback_scope_admin_portal_only`.

**Next Steps:**

- **bt-servant-worker#215** — wait for Ian. Once that lands and soaks, portal #125 Phase 2 PR opens here (full deletion of `manual-config.tsx`, `prompt-panel.tsx`, the `/prompt-configuration` route, the `/api/config/prompt-overrides` branch in `worker/config.ts`, the three org-overrides functions in `config-api.ts`, `useOrgOverrides`/`useUpdateOrgOverrides` hooks, the `"prompt-configuration"` section entry, and ~12 tests). The Phase 2 PR also can't blindly delete `src/types/prompt-override.ts` — `mode-scaffold.ts` still imports `PROMPT_SLOTS` and `SLOT_LABELS` for the modes scaffold; only the org-overrides exports become dead.
- **#91 — Node 24 actions bump** — surfaced as a deprecation annotation on every CI run today; time-bound to Sep 16 2026 hard removal but not urgent. Mechanical fix.
- **README cleanup** — Frank flagged a stale `/manual-config` table entry on PR #127 (pre-existing drift from PR #110). Small docs PR.
- **#117 — chat-stream `user_id` ownership** — still waiting on a design call.

### 2026-05-13 — Issue triage + cleanup batch (Node 24, dark mode, chat panes); 19-day prod promotion

**Context entering the session:** SOD opened with PR #129 (the 2026-05-11 late-evening progress tracker) sitting unmerged with green CI. Three Next-Step items from the late-evening session were unblocked: README cleanup (Frank P2), #91 Node 24 actions bump, and (newly surfaced) a triage of open portal issues against the Epic #72 pivot to see what was actually still live vs superseded.

**Completed:**

- **PR #130 — README drift cleanup.** Three small drifts in one focused docs PR: Pages table dropped the `/manual-config` row (no longer in the sidebar; Phase 2 deletes the page) and added the three actually-reachable surfaces (`/modes`, `/languages`, `/admin/users`) with their access gates; `worker/config.ts` architecture-diagram comment now mentions languages (added in PR #92); Worker BFF Routes table fixed dual-auth on `/api/admin/*` ("Admin secret or session" per the 2026-05-08 retrospective audit) and replaced the stale "Prompt overrides, modes, default mode" with "Modes, languages, prompt overrides" (default mode removed in worker #211 / PR #212). Frank cleared no findings. Merged at `ff8046e`.
- **PR #129 — late-evening progress tracker merged** at `eebd3e6`. (User-instructed merge after CI cleared; no Frank review needed for a docs-only PR.)
- **PR #131 / #91 — Node 24 actions bump.** Cleared the runner-side "Node.js 20 actions are deprecated" annotation that had fired on every CI run since the staging-on-merge rewire (PR #90, 2026-05-08). Bumped `actions/checkout@v4 → @v6`, `actions/setup-node@v4 → @v6`, `actions/github-script@v7 → @v8` (one major below v9 to avoid the `require('@actions/github')` ESM break which our scripts don't trigger but tightens surface for future edits), `actions/upload-artifact@v4 → @v6` (skipped v7's opt-in direct-upload feature we don't use). `gitleaks/gitleaks-action@v2` stays — no v3 exists and `action.yml` is explicitly `using: "node20"` — workaround per the issue's escape-hatch note: `FORCE_JAVASCRIPT_ACTIONS_TO_NODE24: "true"` env on the `secret-scan` job with an inline comment flagging the workaround as transitional. Validated end-to-end: 3 of 4 CI jobs have zero deprecation annotations after the bump; the 4th (secret-scan) has only the expected transitional "being forced to run on Node.js 24: gitleaks/gitleaks-action@v2" warning. Merged at `5a9d1c8`.
- **Issue triage batch — 7 issues closed as superseded-by-pivot.** Audited the 26 open portal issues against the #125 Phase 2 + Epic #72 pivot. Closed 7 with clear pivot reasoning:
  - **#67** (prompt config card buttons overflow), **#55** (resizable expanded editor), **#54** (default size of expanded editor), **#51** (mobile tap-to-expand spec) — all on the dying `/prompt-configuration` surface (#125 Phase 1 hid the sidebar; Phase 2 deletes the page entirely).
  - **#9 + #10** (slot color tokens in `prompt-panel.tsx`) — that file is only imported by `manual-config.tsx`; deleted with the page in #125 Phase 2.
  - **#18** (`.config-grid-bg` off-system value) — only consumed by `manual-config.tsx`; same gate. Caught during the dark-mode PR triage and folded into the same pivot bucket.
- **Catalog comment on #59 (Benjamin's ideas)** — left open as backlog reference. Cataloged: "fewer categories" + "one box" ✅ done via #110's single-document editor; "glossary table" still live as a portal-side backlog feature (post-Epic #72); "skill use" / "progressive disclosure" / "prompt caching" are worker-scope (defer for Ian's worker backlog).
- **Dark mode polish umbrella — #133 filed.** Grouped the 7 surviving dark-mode issues into a single design-pass epic so the token audit could be done cohesively. Scope: #11, #12, #13, #14, #16, #18, #19. Updated #133 down to **6 issues** when #18 turned out to be on the dying surface.
- **Epic #72 body updated.** Added a Status section listing all 9 shipped sub-issues + 3 remaining (#125 Phase 2, #77, **language-file loading via bt-servant-worker#191**). Surfaced bt-servant-worker#191 as the **fifth Goal's DoD blocker** — previously invisible in the epic body. Cross-repo dependency table at the bottom: worker #215 ↔ #125 Phase 2; worker #191 ↔ language loading; (not filed) ↔ #77 visual-highlight.
- **PR #134 / #133 — Dark mode polish in one design pass.** Six issues addressed coherently:
  - **#14** foreground chroma — bumped 6 `.dark` foreground tokens (`--foreground`, `--card-foreground`, `--popover-foreground`, `--secondary-foreground`, `--muted-foreground`, `--sidebar-foreground`) from zero-chroma neutral grey to hue 248, chroma 0.008 (below visible-tint threshold; "warmth without coloring"). `--accent-foreground` and `--sidebar-accent-foreground` left at pure white intentionally.
  - **#12** activity bar hover — added `dark:hover:bg-white/[0.08]` so the hover delta exceeds the perceptibility threshold. Light mode still uses `hover:bg-accent`.
  - **#13** active nav background — added `bg-primary/8 dark:bg-primary/12` to the active branch so the signal doesn't ride entirely on the 2px primary strip + a small text-color delta.
  - **#16** activity bar shadow — added `dark:shadow-[2px_0_12px_rgba(0,0,0,0.35)]` so the side shadow punches through the darker ambient surface.
  - **#11** mode + language selector icon backgrounds — bumped `bg-primary/10` to `dark:bg-primary/20` in both `mode-selector.tsx` and `language-selector.tsx`. The issue body noted both surfaces.
  - **#19** destructive button — dropped `dark:bg-destructive/60` alpha modifier. The dark-mode `--destructive` token is already a hand-picked darker red (`oklch(0.637 0.237 25)` vs light-mode `oklch(0.577 0.245 27.325)`); adding `/60` on top was a double-mute. Kept the `dark:focus-visible:ring-destructive/40` ring tweak (unrelated to body fill).
  - Frank flagged three process/metadata items on the first review: commit author (declined — `CLAUDE.md` says Claude is author; `AGENTS.md` is symmetric for Codex's own commits), past-tense "deleted" wording on out-of-scope items (fixed — changed to "scheduled for deletion in Phase 2"), and `closingIssuesReferences: []` because the "## Closes" header + bare `#N` bullets aren't recognized as keywords (fixed — `Closes #N` per line; verified post-edit via `gh pr view --json closingIssuesReferences` that all 7 references parse). All 4 CI checks green. Merged at `99da477`.
- **PR #135 / chat panes cleanup — three issues bundled.** Net **−185 lines** across 6 modified files + 1 new hook (+51 lines):
  - **#31** typing-animation removal — deleted `src/hooks/use-animated-text.ts` entirely (was animating at 2 chars / 16ms ≈ 125 chars/sec, slower than the real SSE token rate). `AnimatedText` component collapsed into a direct Markdown render in `AssistantMessage`; streaming cursor pulse kept for the live-stream affordance. Cascade cleanup in both `useTestChat` and `useBaruchChat`: `isCompleting` state, `pendingCompleteRef`, `finalizeComplete` callback, and the two-branch `hadStreaming` finalization all dead without animation — removed. Pane components no longer destructure or pass any of `isCompleting` / `onAnimationCaughtUp` / `finalizeComplete`.
  - **#50** input dedup — extracted `useChatInput({ onSubmit, isBusy })` to `src/hooks/use-chat-input.ts`. Owns `input` state, `inputRef`, `handleSubmit`, `handleKeyDown` (Enter without Shift), and busy→idle focus restoration. Both panes lost ~25 lines each of duplicated state + handlers. Auto-scroll effect (5 lines, identical deps in both panes) left inlined — extracting it would require an `eslint-disable react-hooks/exhaustive-deps` for a passed deps array; cost > benefit.
  - **#48** stable React keys — wrapped `normalizeChildren`'s array `.map()` output in `<Fragment key={index}>`. Position-based keys are stable because react-markdown produces a deterministic child order from the parsed markdown tree.
  - Frank cleared no medium+ issues. Residual risk noted: no React-hook test infrastructure in this repo (vitest-pool-workers is workerd-only, no DOM); manual smoke is the meaningful validation for cursor pulse, focus restore, Enter vs Shift+Enter, and Baruch initiation. Merged at `25ea9c1`.
- **Prod promotion — 19-day batch.** Elsy approved staging at 14:45 local. Triggered `Deploy Production` workflow dispatch on `main` at HEAD `25ea9c1`. **33 commits accumulated since the last prod deploy (2026-04-24)** — basically the entire Epic #72 ship (markdown editor + TOC for modes and languages, Languages tab + CRUD, Users admin, brand context accents, language scaffold preload, test chat trigger wiring, AlertDialogAction sweep, admin authz tightening, password reset session invalidation, Prompt Overrides Phase 1) plus the CI tech-debt (Node 22, Node 24 actions, per-PR workers, staging-on-merge) plus today's dark-mode + chat-panes work. Workflow has a built-in CI re-gate (typecheck + lint + build + npm audit) before the wrangler deploy.
- **Frank-collaboration patterns surfaced this session:**
  - **Cross-agent author convention.** `CLAUDE.md` says Claude is author for Claude's commits; `AGENTS.md` says Codex is author for Codex's commits. Each rule applies to its own agent. Frank misread this on PR #134 round 1; pushed back with explicit reasoning and added a "Reviewer notes" section to PR #135's body so the convention is visible on future PRs. Memory `team_frank_reviewer` updated to capture this.
  - **GitHub auto-close keyword discipline.** The "## Closes" header + bare `#N` bullets pattern doesn't trip GitHub's parser. Must be `Closes #N` per line (or comma-list with repeated keyword, but that's verbose). Verified empirically via `gh pr view --json closingIssuesReferences` after each PR-body edit. Encoded as part of the existing memory `feedback_gh_closes_keyword`.

**Day rollup:**

| Merged                  | Commit    | Closes                             |
| ----------------------- | --------- | ---------------------------------- |
| #129 progress tracker   | `eebd3e6` | —                                  |
| #130 README cleanup     | `ff8046e` | — (Frank P2 follow-up)             |
| #131 Node 24 actions    | `5a9d1c8` | #91                                |
| #134 dark mode polish   | `99da477` | #11, #12, #13, #14, #16, #19, #133 |
| #135 chat panes cleanup | `25ea9c1` | #31, #48, #50                      |

**5 PRs merged, 11 issues auto-closed, 7 issues closed in triage (#9, #10, #18, #51, #54, #55, #67), 1 umbrella issue filed (#133), 1 issue body refresh (Epic #72), 1 backlog catalog comment (#59).**

Open portal issue count: **26 → 10**. Remaining: #28 (deep links), #49 (field-sizing tracker), #56 + #57 (User Memory viewer), #52 + #53 (perf nits), #59 (Benjamin catch-all), #72 (Epic), #77 + #117 + #125 (gated).

**In Progress:**

- None code-wise. Prod promotion landed successfully (run `25822043201`, CI Gate 42s + Deploy 41s = ~83s wall-clock).

**Blockers:**

- **bt-servant-worker#215** — gates portal #125 Phase 2. Ian's queue; no movement since the 2026-05-11 pre-flight KV inventory comment.
- **bt-servant-worker#191** — gates Epic #72's fifth Goal (dynamic language-file loading). Now surfaced in the Epic #72 body. Ian's queue.
- **#77 visual highlighting** — still paused on Ian's editor-library decision (CodeMirror 6 tentative).
- **#117** — chat-stream `user_id` ownership; awaiting design call.

**Patterns / decisions captured today:**

- **Pre-filing triage prevents wasted umbrella scope.** Filed dark-mode umbrella #133 with 7 sub-issues; during the implementation PR triage discovered #18 was on the dying `.config-grid-bg` surface (same pivot as #9/#10). Closed #18, narrowed umbrella to 6, updated body. Lesson: when scoping an umbrella/epic, run a quick file-usage check against any known dying surfaces before listing sub-issues — saves a "wait, that's not actually in scope" revision later.
- **GitHub `closingIssuesReferences` is the truth.** Don't trust prose. After every PR body edit that includes issue-closing references, run `gh pr view <N> --json closingIssuesReferences` to confirm the parser picked them up. The `## Closes` header pattern doesn't trip auto-close even though it reads as obvious intent.
- **Cross-agent author convention is real.** `CLAUDE.md` and `AGENTS.md` have parallel rules: each agent's instruction file specifies its own author. Frank/Codex reads AGENTS.md and may flag Claude's author on review — declining is the correct response with an explicit reference to the cross-agent convention.
- **No-test-infra ≠ no-tests-needed.** Per `feedback_real_tests`, pure functions with discrete edge cases need a `.test.ts`. But React hooks aren't pure functions; the chat-panes cleanup PR didn't add new pure functions (only extracted a React hook, `useChatInput`); no testing-library setup exists in this repo (vitest-pool-workers is workerd-only). Manual smoke is the meaningful validation path. Frank's residual-risk note correctly identifies the gap but it's structural, not actionable in a follow-up PR.

**Next Steps:**

- **PR 4 — User Memory enhancements** (next in proposed sequence): #56 (auto-load admin's own memory), #57 (UUID-to-email dropdown), #53 (TextEncoder allocation perf). All touch `user-memory-dialog.tsx`. #57 likely needs a worker companion for the UUID→email mapping API; investigate before scoping.
- **PR 5 — Deep link mode slugs** (#28): React Router resolver for `/<mode-slug>` → activate mode + redirect to `/modes`. Cross-repo overlap with worker #137 — close one as duplicate (portal-owning is more natural since URL routing is portal-side).
- **PR 6 — Shell perf nit** (#52): one-line `useEffect` cleanup. Micro-PR.
- **Watch for worker movement**: Ian on bt-servant-worker#215 + #191. Once #215 lands and soaks, portal #125 Phase 2 PR opens here (full deletion of `manual-config.tsx`, `prompt-panel.tsx`, the `/prompt-configuration` route, the `/api/config/prompt-overrides` branch in `worker/config.ts`, the three org-overrides functions in `config-api.ts`, `useOrgOverrides`/`useUpdateOrgOverrides` hooks, the `"prompt-configuration"` section entry, the `.config-grid-bg` CSS class, and ~12 tests).

## Known Issues

- **#117 — `/api/chat/stream` accepts arbitrary `user_id` from session-cookied users.** Worker validates UUIDv4 shape but not ownership; a logged-in user could submit another user's test-chat UUID. Discovery requires knowing/guessing a v4 — hard but not impossible (logs / screen-share / copy-paste). Deferred from 2026-05-11 retrospective batch pending a design call between (1) namespacing test-chat UUIDs as `test:<session.userId>:<uuid>`, (2) requiring `isAdmin` for cross-user UUIDs, or (3) KV-tracked session→testChatUserId.
- **#125 — Prompt Overrides removal (in flight).** Phase 1 shipped 2026-05-11 (sidebar entry hidden). Phase 2 (full removal of page + BFF route + types) gated on bt-servant-worker#215 stopping the chat-time consumption of org-level prompt-overrides. Pre-flight KV inventory clear in both staging and prod.

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

Notable decisions made 2026-05-11 (evening — retrospective batch):

- **Server-side authz is the load-bearing gate; UI gating is defense-in-depth.** Trusted-portal model means the worker holds the upstream admin token and the engine has zero user identity. `worker/config.ts` now 403s non-admins on PUT/DELETE for both `/api/config/modes/{name}` and `/api/config/prompt-overrides`. UI button gates + `<RequireAdmin>` route wrappers + sidebar-entry gates are belt-and-suspenders. GETs stay open because non-admin sessions still need to read modes for the test-chat trigger lookup.
- **Canonical mode scaffold matches worker synthesizer.** New mode documents open with all seven H2 sections (`## Identity` through `## Closing`) so that GET → PUT → GET is identity-clean at the section level vs. a not-yet-migrated slotted mode the worker synthesizes via `toMarkdownView`. Constant lives at `src/lib/mode-scaffold.ts`.
- **`lastFailedDoc` autosave gate.** Track failed-save drafts separately from `lastSyncedDoc`; pause autosave when `debouncedDraft === lastFailedDoc`; clear on success, selection change, or further edit. Without this, a 4xx-failing save retries on every `isPending → false` (TanStack clears `error` while pending, so the banner also flickers). Pattern in `src/app/pages/{languages,modes}.tsx`.
- **Password policy is centralized in `worker/admin.ts`.** `validatePasswordPolicy` (8 ≤ length ≤ 128) is used by both `createUser` and `updateUser` and mirrors `handleChangePassword` in `worker/auth.ts`. `updateUser`'s password branch uses `body.password !== undefined` (not truthy-check) so an empty-string admin reset rejects with the policy error rather than silently no-op'ing.
- **GitHub `Closes` keyword is per-token, not list-aware.** `Closes #A, #B, #C` only closes `#A`. Captured in memory; future multi-issue PR bodies must repeat the keyword (`Closes #A, closes #B, closes #C`) or use one-per-line.

Notable decisions made 2026-05-11:

- **`#mode @language` override is inline in the message text, not a wire field.** Final form of worker #199 (shipped via #211 / PR #212) is a deterministic 3-tier cascade (exact → unique prefix → unique Levenshtein ≤ 2) parsed from the leading tokens of the user message. The worker strips both matched and unmatched tokens before history, and routes unmatched tokens to the orchestrator's system prompt for a contextual "did you mean…" reply. Portal-side, the per-turn override is implemented by pre-pending `#<mode> @<lang>` to the outgoing message — `applyTriggerPrefix` in `src/lib/chat-api.ts`. No new field on the chat endpoint contract.
- **`runConfirmedAction` is the canonical destructive-confirmation policy.** Lives at `src/lib/run-confirmed-action.ts`. Owns the "clear error → await → close on success, set error and stay open on failure" lifecycle for any async destructive confirmation. Used by all five destructive-confirm dialogs in the app as of PR #108. Future destructive UI should reuse this helper rather than re-implementing the try/catch/state-machine inline.
- **Tests in `tests/` can import from `src/`.** `tsconfig.worker.json` now declares `"@/*": ["./src/*"]` so test files exercise pure functions and fetch-wrappers from the browser-side codebase using the project's standard alias. Transitively-pulled `src/` modules must stay free of DOM/JSX types for this to typecheck under the worker tsconfig (currently true for `src/types/chat`, `src/types/language*`, `src/lib/chat-api`, `src/lib/languages-api`, `src/lib/language-scaffold-api`).
- **Local user date for session tracking, not container `date`.** `uw-sandbox`'s system clock is UTC; during local-evening sessions it may have already rolled to tomorrow. Skill templates (`.claude/commands/sod.md`, `eod.md`, `progress.md`) and upstream `unfoldingWord/uw-dev-skills` codify: use the user's local date from system prompt `currentDate`; for multiple sessions on one local day, append `(morning)` / `(afternoon)` / `(evening)` / `(late-evening)` sub-headings rather than duplicate top-level date headings.

Notable decisions made 2026-05-11 (late-evening):

- **Cross-repo deletion sequencing.** When the portal retires a feature whose backing data is consumed by the worker, the safe sequence is: (1) verify pre-flight KV inventory of the storage namespace, (2) file a PR-ready issue in the worker repo with a migration patch sketch + crosslink, (3) wait for the worker to stop consuming + soak, (4) only then delete the portal-side editing surface. Deleting the portal surface first strands the storage as un-editable hidden state still influencing chat. Codified via the portal #125 ↔ bt-servant-worker#215 pair.
- **`invalidateUserSessions` helper is the canonical session-invalidation policy.** Lives in `worker/auth.ts`. Paginates `session:*`, filters by stored email, optionally skips a session id, and **awaits all deletes before returning**. Used by both `handleChangePassword` (self-change) and `updateUser` (admin reset). Replaces the prior fire-and-forget pattern in `handleChangePassword` where `deletePromises` were never awaited — Cloudflare Workers don't guarantee unawaited promises complete after the response.
- **`AdminScope.org` carries `selfSessionId`.** So password-change branches can preserve the caller's own cookie when the admin happens to be resetting their own password via the browser path. Captured at auth time in `requireAdminAuth` via the now-exported `getSessionId`. X-Admin-Secret CLI has no caller session by design.
- **`Closes #N` fires regardless of prose qualifier.** GitHub auto-closes on any `Closes #N` keyword in a PR body, even if the surrounding prose says "only partially" or similar. Combined with the earlier "Closes is non-list-aware" finding: if a PR shouldn't auto-close an issue, **omit the keyword entirely** — use "Tracks #N" or "Related to #N" instead.
- **Scope = admin-portal only across the bt-servant family.** Coding duties for the bt-servant family are scoped to bt-servant-admin-portal. When cross-repo changes are needed (worker, engine, etc.), file a PR-ready issue with crosslinks in the sibling repo — don't switch directories and author the PR there. Ian handles cross-repo execution. Encoded as memory `feedback_scope_admin_portal_only`.
