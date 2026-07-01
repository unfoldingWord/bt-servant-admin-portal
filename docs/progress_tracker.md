# BT Servant Admin Portal — Progress Tracker

> Single source of truth for project status. Updated via `/progress` and `/eod`.

## Current Status

**Phase**: Post-June-9 demo; Phase 1 (Stabilize) of the tuning-project plan active. **#241 umbrella shipped end-to-end today** (PRs #242 + #244 + #245) — Ian's deferred #232 §2/§3/§4 capabilities (clone, alias display + retire/forward, export aliases) all live on staging. Test suite 366 → 408 across the three PRs. **#232 stays open** for the shepherd rights-migration follow-up (#240); Elsy filed a new slug-visibility UX report 2026-06-29 that Ian and I diagnosed as label-vs-slug confusion (options 1–4 for the follow-up sketched; awaiting Elsy's pick + chat-side repro on her item 2). Track E phase 1 step 2 (#181) shipped 2026-06-25. Elsy locked her three #230 product decisions; Ian's three worker-#257 contract questions still open. Track E phase 1 step 1 (#154 ↔ worker#94 reconciliation) still un-picked.
**Last Updated**: 2026-07-01
**Demo target**: June 9 (passed) — outcome to be summarized
**Last prod deploy**: 2026-06-24 (HEAD `3bebe24` / v1.9.0) — portal promoted by Ian at 15:55 UTC; web-client also promoted same day (first ever post-#41 chat-app prod). Staging is **8 commits ahead** at `e9c4e02` (#181 verb-perms PR 2 + #232 mode rename + Ian's WhatsApp doc + #241 PRs A/B/C)

## Milestones

| Milestone                                               | Progress | Status                                                                                                                                                                                                                                |
| ------------------------------------------------------- | -------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Per-PR ephemeral CF Workers (#83)                       | 100%     | Shipped 2026-05-07                                                                                                                                                                                                                    |
| Auto-staging deploy on PR merge (#89)                   | 100%     | Shipped 2026-05-08                                                                                                                                                                                                                    |
| Language-shepherd permissions (#80)                     | 100%     | Shipped 2026-05-08                                                                                                                                                                                                                    |
| Users admin UI (#96)                                    | 100%     | Shipped 2026-05-08                                                                                                                                                                                                                    |
| Mode/language context accents (#78)                     | 100%     | Shipped 2026-05-08                                                                                                                                                                                                                    |
| Language scaffold preload (#74)                         | 100%     | Shipped 2026-05-11                                                                                                                                                                                                                    |
| Test chat trigger wiring (#81)                          | 100%     | Shipped 2026-05-11                                                                                                                                                                                                                    |
| AlertDialogAction sweep (#102)                          | 100%     | Shipped 2026-05-11                                                                                                                                                                                                                    |
| Mode markdown editor + TOC (#76, #82)                   | 100%     | Shipped 2026-05-11                                                                                                                                                                                                                    |
| Retrospective audit batch (#112–#120)                   | 89%      | 8 of 9 shipped 2026-05-11 (#117 deferred)                                                                                                                                                                                             |
| Admin password reset → invalidation (#99)               | 100%     | Shipped 2026-05-11                                                                                                                                                                                                                    |
| Prompt Overrides retirement (#125)                      | 50%      | Phase 1 shipped 2026-05-11; Phase 2 gated on worker #215                                                                                                                                                                              |
| Node 24 actions bump (#91)                              | 100%     | Shipped 2026-05-13                                                                                                                                                                                                                    |
| Dark mode polish (#133 + 6 subs)                        | 100%     | Shipped 2026-05-13                                                                                                                                                                                                                    |
| Chat panes cleanup (#31, #48, #50)                      | 100%     | Shipped 2026-05-13                                                                                                                                                                                                                    |
| New-org CLI stopgap (#139)                              | 100%     | Shipped 2026-05-20                                                                                                                                                                                                                    |
| Super-admin role + UI (#138)                            | 100%     | Shipped 2026-05-20 (PR A backend + PR B frontend)                                                                                                                                                                                     |
| Cross-org config edits (#166)                           | 100%     | Shipped 2026-05-27 (PR A worker + PR B UI)                                                                                                                                                                                            |
| CM6 editor migration (#167, #77 visual)                 | 100%     | Shipped 2026-05-28 (PR #193 — D-001 mitigation not triggered)                                                                                                                                                                         |
| Worker #191 dynamic language injection                  | 100%     | Shipped 2026-05-28 (worker PR #241 — language persistence)                                                                                                                                                                            |
| Export Config (#187)                                    | 100%     | Shipped 2026-05-28 (PR #197)                                                                                                                                                                                                          |
| Epic #72 — Admin Portal Redesign                        | 100%     | Fully closed 2026-05-28; #77 reframed via portal #196 + worker #240 follow-ups for paragraph-parity                                                                                                                                   |
| Version-bump catch-up (1.5.1 → 1.9.0)                   | 100%     | Shipped 2026-05-28 afternoon (PR #200) — closes deploy-disambiguation gap flagged by Elsy                                                                                                                                             |
| Track E Phase 1 orientation                             | 100%     | Shipped 2026-06-13 (PR #202 + Frank P2 fix) — Track E table refreshed, 6-step Phase 1 entry sequence locked off #154 foundational                                                                                                     |
| Identity-bridge EPIC reframed                           | 100%     | Closed 2026-06-03 (EPIC #171 + #177/#178/#179 + web-client #36/#37/#39); narrow CHAT_ORG_KV fix shipped 2026-06-13 (web-client PR #41) + deploy fix (web-client PR #43); first successful web-client staging deploy since 2026-04-30  |
| Portal prod promotion (v1.9.0)                          | 100%     | Shipped 2026-06-24 — Ian promoted v1.9.0 to prod (HEAD `3bebe24`); closes 42-day promotion gap from 2026-05-13                                                                                                                        |
| Web-client prod promotion                               | 100%     | Shipped 2026-06-24 — Ian promoted CHAT_ORG_KV stack to prod; **first chat-app prod deploy since 2026-04-30** (55-day gap)                                                                                                             |
| Orphan `McpServerConfig` cleanup                        | 100%     | Shipped 2026-06-24 (PR #233) — deletes unused interface from project-kickoff scaffolding                                                                                                                                              |
| #181 verb-perms — end-to-end                            | 100%     | Shipped 2026-06-25 (PR #234 + PR #236, EPIC closed). BFF verb-perms gate (diff-based per-verb authz with partner-aware deny), 4-selector dialog, editor readOnly + Save/autosave gates, RequireModeAccess route guard, 354/354 tests  |
| #230 resource visibility panel                          | 5%       | Assigned 2026-06-24 by Elsy; design memo posted with 6 open questions for Elsy + Ian. Blocked on worker #257 (MCP resource-list endpoint, Ian's lane) before substantive portal work                                                  |
| #232 mode rename/reslug                                 | 75%      | Rename shipped 2026-06-26 (PR #238 = `52e8894`, **v1.10.0**) via engine `_rename` op (worker#285/v2.28.0). Issue scope (3 of 4 boxes; 4th N/A) covered, but admin-only pending shepherd rights-migration follow-up — issue stays open |
| #241 umbrella — clone / alias display / retire / export | 100%     | Fully shipped 2026-07-01. PR A (#242 = `776c36c`, aliases type + badges + export round-trip) + PR B (#244 = `a82f52c`, clone) + PR C (#245 = `e9c4e02`, retire-and-forward). All admin/cross-org gated pending #240. 408/408 tests.   |

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
- [~] **#77** — Comment-block syntax in editor — visual highlighting half **shipped 2026-05-28** via CM6 migration (PR #193 at `2aece57`; per-instance `Compartment` for readOnly + fence-aware `findCommentRanges()` after self-review). Same PR closed **#167** (markdown syntax highlighting). Issue stays open for the multi-line `%%` paragraph follow-up (current decoration dims only the first line of multi-line `%%` paragraphs — acceptable per inline comment, deferred as v2). Backend stripping half — worker #201 closed 2026-05-11.

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

### 2026-07-01 — #241 umbrella shipped end-to-end (PRs A + B + C); PR B rebounded once + belt-and-suspenders fix

**Context entering the session:** Yesterday's `/sod` (2026-06-29) picked up after a 3-day gap since the 2026-06-26 EOD. That morning I filed the two #232 follow-up issues (#240 rights-migration + #241 umbrella for Ian's deferred §2/§3/§4 capabilities) and shipped **#241 PR A** (aliases type + badges + export round-trip) as PR #242 = `776c36c`. Elsy then filed a staging UX report on #232 (dropdown "still shows old mode name" post-rename); Ian and I diagnosed it as label-vs-slug confusion, sketched four options for a follow-up issue, and pinged Elsy for her pick + chat-side repro. That thread is still open awaiting her reply.

**Completed today (2026-07-01):**

- **#241 PR B — Clone (`_clone` op)** shipped end-to-end. Merged as **PR #244 = `a82f52c`**, 383 → 392 tests. Three commits over the day:
  1. **Initial implementation** (`a73d0f5`). Worker `POST /api/config/modes/{name}/_clone` arm above the catch-all with admin/cross-org direct-gate (mirroring rename's #238 pattern rather than routing through `gateConfigMutation`, whose POST branch was reverted). API client `cloneMode(name, { newName, newLabel? })`. `useCloneMode()` hook pre-writing per-mode cache. Clone button + two-field dialog (slug + optional label). 11 new tests (5 authz + 6 client-shape).
  2. **`/code-review xhigh` round** (`bd83731`, 8 of 9 findings addressed). The workflow-backed review surfaced 9 verified findings ranked by severity; 8 CONFIRMED/PLAUSIBLE fixes landed. **F1** (clone-while-dirty drops unsaved edits) → added `cloneDisabledReason` prop mirroring `renameDisabledReason`. **F2** (stale-selection race, useCloneMode missing list surgery) → added `applyCloneToModeList` helper called synchronously in `onSuccess` before invalidation. **F3** (clone errors misfile under "Save failed:" banner) → dropped `cloneMode.error` from `saveError` composition. **F4** (button `disabled` gates on `!cloneName.trim()` but confirm gates on `slugify`) → aligned button gate to `!slugify(cloneName)`. **F5** (default clone slug `${source}-copy` guaranteed 409 on second clone) → extracted `pickCloneDefaultSlug(source, existing)` in new `src/lib/mode-clone-defaults.ts` that walks `-copy`, `-copy-2`, `-copy-3`. **F6** (client-side newName used for `setSelectedMode` instead of engine's canonical response) → uses `data.name`. **F7** (label prefill hid empty-vs-inherit ambiguity) → removed label prefill; blank always means "unset." **F8** (greedy regex `(.+)` on both `_clone` this PR AND `_rename` preexisting) → anchored both arms to `[^/]+` and added a duplicated-suffix 405 test. Skipped **F9** (duplicated slug-op scaffolding across rename/clone) — deferred to PR C evaluation. Suite 383 → 392.
  3. **Frank rd-1** (`c025c4a`, belt-and-suspenders). Frank's review had been submitted at 13:23 UTC — **26 minutes before `bd83731` landed** at 13:49 UTC — so his P1 findings mapped exactly to the F1/F2 patterns already fixed. Re-reading his F1 more carefully, though, I noticed the button-disable alone doesn't fully close the race: once the dialog is open cleanly, focus can leak from the Radix modal (click outside, tab out) and the user can dirty the editor before confirming. Fix: `handleCloneMode` now routes selection through `handleSelectMode(data.name)` instead of raw `setSelectedMode`. Clean → switches (same as before). Dirty → queues `pendingSwitch` confirmation dialog. This is the "explicit save/confirm path" from Frank's OR-clause. Reply on PR clarified timing + the additional fix; Frank re-reviewed at `c025c4a` and approved with no medium+ findings.

- **#241 PR C — Retire-and-forward (`_retire` op)** shipped end-to-end. Merged as **PR #245 = `e9c4e02`**, 392 → 408 tests. Single-shot implementation this time — reviewed clean by Seth's proxy pass in `uw-sandbox` (no `/code-review` cycle needed):
  - Worker `POST /api/config/modes/{name}/_retire` arm with admin/cross-org direct-gate and segment-anchored regex (learning from PR B F8 — didn't need to re-fix in review). API client `retireMode(name, forwardTo)` with engine 400/404 pass-through (retire-to-self, missing target). `useRetireMode()` hook + new `applyRetireToModeList` helper doing three-part cache surgery: source filtered out, target replaced with response payload (widened aliases), source's per-mode cache removed. Retire button (amber-styled between Clone + Delete) + confirm dialog with target `<Select>` excluding self + empty-state message when no other modes exist. `handleRetireMode` routes through `handleSelectMode` (belt-and-suspenders from PR B lesson) with selection landing on the TARGET. `retireDisabledReason` mirrors `cloneDisabledReason`. **F9 evaluated + declined** — retire's Select-based confirm shape differs substantively from rename/clone's slug-input pattern; extracting a shared hook would need to accommodate both shapes and would obscure per-op validation more than it saves. Rule of three doesn't trigger cleanly.
  - **16 new tests** across authz (6, including duplicated-suffix 405), config-api (6), and use-prompt-config helper (4).

- **#241 closed** with a closeout comment summarizing all three PRs. **#232 stays open** for #240 (shepherd rights-migration) per Ian's plan.

- **#232 nudge posted (morning)**: acked Ian's option 4 (option 3 + auto-rename-display-name popup — closes the label-vs-slug root cause) and pinged @elsylambert for her pick between options 1–4 + chat-side repro for the "which mode am I in?" inconsistency (item 2 in her staging report). No reply yet.

**Day rollup:**

| Merged | Commit    | Notes                                                                     |
| ------ | --------- | ------------------------------------------------------------------------- |
| #244   | `a82f52c` | #241 PR B — Clone; 3 commits (init + 8-fix code-review + belt+suspenders) |
| #245   | `e9c4e02` | #241 PR C — Retire-and-forward; single-shot                               |
| —      | —         | #241 umbrella closed as `completed`                                       |

**Issues closed today:** #241 (umbrella; all three sub-PRs shipped).
**Issues filed today:** none.
**Comments posted:** #232 (Elsy nudge + Ian option 4 ack + issue trail), #241 (closeout summary), plus PR #244 code-review reply + fix summary + belt-and-suspenders reply.

**In Progress:**

- None code-wise. #241 umbrella closed; #232 stays open for #240.

**Blockers / Carryover:**

- **#232 UX follow-up (label-vs-slug visibility)** — options 1–4 sketched (Ian added option 4: auto-rename-display-name popup on rename). Waiting on Elsy for pick + chat-side repro. Would file as a new issue once she picks.
- **#240 shepherd rights-migration** — still needs a design memo before implementation. The atomicity model is the load-bearing choice (portal-side migrate-first-rollback-on-engine-fail vs. engine-first with compensating un-rename); leaning toward the former per the issue body.
- **#230** — Elsy locked; Ian's worker #257 contract questions still pending. Substantive portal work still gated.
- **Track E phase 1 step 1 (#154 ↔ worker#94 reconciliation)** — still un-picked; foundational for #155/#156/#160/#183.
- **web-client #45** — filed 2026-06-26, unowned; ~10-min workflow PR.
- **Demo (June 9) retrospective** — 22 days stale.
- **Track G #215 Path B Zulip draft** — unsent from 2026-05-28.
- **Cascade design (Track B)** — #170/#172 — gated on Ian's `ORG_CONFIG` vs `SYSTEM_CONFIG` KV decision.

**Patterns / decisions captured this session:**

- **Belt-and-suspenders selection routing after selection-changing mutations.** PR B Frank F1 revealed that a button-level `disabled` gate closes the _dialog-open_ moment but NOT the _dialog-confirm_ moment — Radix `AlertDialog` opens focus-trapped but focus can leak (click outside, tab out) and the editor can be dirtied while the modal is open. The confirm button gates on mutation-specific validity, not on `isDirty`. Fix pattern: after any mutation whose success re-points `selectedMode`, route through `handleSelectMode(data.name)` (which inspects live `isDirty`) rather than raw `setSelectedMode`. Applied to both `handleCloneMode` (PR B) and `handleRetireMode` (PR C proactively). Rename doesn't need it because rename already gates through `runConfirmedAction` which doesn't leave the dialog open across a state race.
- **Cache surgery helpers per mutation.** Three siblings now — `applyRenameToModeList`, `applyCloneToModeList`, `applyRetireToModeList` — each pure, unit-tested, and called synchronously from the hook's `onSuccess` before invalidation. This is the correct level of abstraction: the list-cache transformation is genuinely different per op (swap vs. append vs. drop-and-replace), so no shared helper wins; naming the transform per op keeps the intent obvious at the site of use. Frank explicitly locked this pattern in via the PR B F2 review.
- **Segment-anchored regex `[^/]+` for op-name routes.** Sub-arms like `/_rename`, `/_clone`, `/_retire` should use `[^/]+` for the mode-name capture rather than `.+`. Ian's original PR B code (following #238's rename pattern) used `.+` which would swallow `foo/_clone/_clone` and forward it to the engine for a wasted 404. Fixed for both `_clone` (PR B) AND `_rename` (preexisting), and used the same pattern proactively in PR C's `_retire` arm. Confirmed correct behavior: 405 at the BFF from the generic catch-all (which allows GET/PUT/DELETE only, not POST) with no engine round-trip.
- **Frank's review tooling doesn't always reset when I push a fix.** Frank's PR B review submitted at 13:23 UTC was against `a73d0f5`; my fix at 13:49 UTC (`bd83731`) landed 26 minutes later, but his review tool didn't automatically re-target. Reading the review carefully mapped his findings exactly to what I'd already fixed. **Heuristic**: before responding to a Frank review with "why is he still flagging this?", run `gh pr view N --json commits,reviews -q '{commits: [.commits[] | {sha: .oid[0:10], at: .committedDate}], reviews: [.reviews[] | {state, at: .submittedAt}]}'` to compare review submission time against latest commit time. If review predates the latest fix commit, don't re-implement — clarify the timing and re-request review.
- **Rule-of-three cleanup evaluation for F9.** PR B code-review F9 flagged duplicated slug-op scaffolding as "next slug-op will trigger extraction." PR C's retire IS the third instance, so I evaluated extraction — and declined: retire's Select-based confirm shape differs substantively from rename/clone's slug-input pattern, so a shared hook would need to accommodate both shapes and would obscure per-op validation more than it saves. Rule of three needs the three cases to be _actually_ similar, not just superficially. Called this out explicitly in PR C's body so the F9 decision is documented and can be revisited if a fourth slug-op arrives.
- **Amber-not-red destructive styling for retire.** Retire deletes the source mode but users are NOT stranded (alias route keeps them resolving on the target). Chose amber styling to signal "destructive but soft" — differentiates from Delete's red (which truly strands users). Design choice worth flagging so future destructive-adjacent actions can follow the same pattern.

**Next session:**

1. **Elsy's #232 pick** — file the slug-visibility follow-up when she confirms option 1/2/3/4.
2. **#240 design memo** — write up the atomicity model options (portal-first-rollback vs. engine-first) so implementation isn't blocked on the load-bearing decision.
3. **web-client #45** — small unowned workflow PR from 2026-06-26 (~10 min).
4. **Track E phase 1 step 1 (#154 ↔ worker#94)** — still needs Seth+Ian deliberation on KV namespace placement before implementation. Worth raising at next sync.
5. **#230** — only if Ian has responded on worker #257 contract questions.
6. **Demo retrospective** — 22 days stale.

---

### 2026-06-26 — Reconciling overnight #232 mode rename (PR #238, v1.10.0); not in yesterday's EOD

**Context entering the session:** Yesterday's EOD (2026-06-25) closed at #181 EPIC shipped + staging live at `e46d32b`, with "In Progress: None code-wise." Two commits then landed on `main` overnight that the EOD missed entirely: PR #237 (the 2026-06-25 EOD docs themselves) at `ddf6ca7`, and **PR #238 — #232 in-place mode rename via the engine's `_rename` op** at `52e8894`, bumping the version to **v1.10.0**. This entry reconciles that work into the tracker so the chronology stays honest.

**Timeline of #232 (already complete before this morning's session):**

- **2026-06-24 15:11 UTC — Elsy filed #232** (Priority/High, assigned to Ian): "Modes can't be renamed or re-slugged in place. The only way to change a mode's name today is to clone it — and when the old name is deleted, anyone still assigned to it is stranded in no mode." Scope: in-place rename preserving assignments, or a bulk-migration fallback.
- **2026-06-24 17:13 UTC — Ian posted a 187-line implementation plan** ([comment](https://github.com/unfoldingWord/bt-servant-admin-portal/issues/232#issuecomment-4791833638)) scoping the work across 4 capabilities (§1 Rename, §2 Clone, §3 Alias display + Retire-and-forward, §4 Export aliases) plus §0 cross-cutting (add `aliases?: string[]` to `PromptMode`; admin-gate POST in `worker/config.ts:isAdminMutation` — currently only guards PUT/DELETE so POST routes would skip the gate entirely; explicit `_rename`/`_clone`/`_retire` arms above the catch-all `^/api/config/modes/(.+)$` to avoid path-capture). Marked **must not merge before bt-servant-worker#284** (the engine half).
- **2026-06-25 20:39 UTC — Ian cleared the blocker.** Engine half shipped as **bt-servant-worker#285** and tagged **v2.28.0**; `_rename` / `_clone` / `_retire` live on staging API, validated with a 63-assertion curl battery. Ian's "post-#284 merge" comment ([link](https://github.com/unfoldingWord/bt-servant-admin-portal/issues/232#issuecomment-4803957569)) added six engine-side refinements (specific status codes — 404/409/400 — that the BFF must forward unchanged; `aliases` omitted-when-empty; retire moves source's own aliases too; uniqueness now enforced on PUT-create too with asymmetric 400 vs rename's 409; **emergent "promote own alias" valid behavior** — renaming to one of the mode's OWN aliases is valid and must not be client-side-rejected; export/reimport now validated server-side).
- **2026-06-25 21:22 UTC — PR #238 opened** (Claude), 43 min after Ian's clear-to-go. **Narrowed scope** vs Ian's full plan: rename only (§1 + §0 POST-gate). Clone (§2), alias display + retire-and-forward (§3), and export aliases (§4) deferred to follow-ups.
- **2026-06-25 21:32 UTC — Commit 2** (`ca05687`, optimistic-cache fix). Ian's review caught: `useRenameMode.onSuccess` only invalidated the list (async refetch); the render after `setSelectedMode(newName)` could still see the OLD slug in `modesQuery.data`, the page's stale-selection guard would then find `newName` missing and reset selection to `null` — dropping the user into "no mode" right after a successful rename. Fix: new `applyRenameToModeList` helper synchronously swaps the old-slug entry for the renamed mode in the list cache BEFORE invalidations, so the new slug is present the moment the page selects it. +4 unit tests for the helper.
- **2026-06-25 22:01 UTC — Commit 3** (`30e0eba`, admin-only restriction). Ian's re-review caught a deeper authz issue: per-user mode rights are **slug-scoped** (`mode_edit_rights` / `mode_publish_rights`), and nothing migrates them on rename. So a non-admin shepherd renaming a mode would keep rights on the OLD slug and lock themselves out of the renamed one (selection cleared by the permission guard, hidden by `filterByAnyRights`, worker 403s their `/modes/{newName}` calls). Until a rights-migration story exists, gate rename on admin powers OR super-admin cross-org instead of per-row edit+publish. Worker `_rename` route now 403s any non-admin same-org rename directly (no longer routed through `gateConfigMutation`, whose now-unused POST branch was reverted); UI sets `canRenameSelected = isAdmin || isCrossOrg`. Worker rename tests updated so full per-row rights no longer pass.
- **2026-06-26 13:55 UTC — PR #238 merged** as squash `52e8894` (530+/12-), bumping `package.json` to **1.10.0** in the same commit. Tag `v1.10.0` pushed alongside. CI green (1m35s). Deploy Staging fired automatically (1m1s success); staging now serves v1.10.0 with rename live.
- **2026-06-26 14:00 UTC — Ian posted the closeout summary** ([link](https://github.com/unfoldingWord/bt-servant-admin-portal/issues/232#issuecomment-4810258344)) marking 3 of 4 original scope boxes done (4th is N/A because in-place rename is possible) and explaining why **#232 stays open**: shepherd rights migration is the remaining gap.

**This session (2026-06-26 morning) completed:**

- Tracker reconciliation: this entry; milestone row added for #232 at 75% with the admin-only caveat; Current Status updated to reflect v1.10.0 in staging and the open follow-up; Last prod deploy line corrected (staging now 3 commits ahead, not 1).
- No code shipped this morning — the entire #232 work landed before this session opened.

**Final shape of PR #238:**

| File                               | +/-     | Note                                                                                                                                                                   |
| ---------------------------------- | ------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `worker/config.ts`                 | +29/-0  | Explicit `POST /api/config/modes/{name}/_rename` arm above the catch-all; admin-only gate directly (not via `gateConfigMutation`); forwards engine status + error body |
| `src/lib/config-api.ts`            | +49/-0  | `renameMode(oldName, newName, signal?, org?)`                                                                                                                          |
| `src/hooks/use-prompt-config.ts`   | +51/-1  | `useRenameMode()` with optimistic-cache `applyRenameToModeList` helper before invalidations                                                                            |
| `src/components/mode-selector.tsx` | +133/-7 | Rename button + slug dialog with inline error handling; disabled while there are unsaved edits                                                                         |
| `src/app/pages/modes.tsx`          | +27/-1  | Rename handler; selection follows new slug; `canRenameSelected = isAdmin \|\| isCrossOrg`                                                                              |
| `tests/config-authz.test.ts`       | +106/-0 | 8 worker gate cases (admin allowed, non-admin 403 even with full per-row rights, cross-org super-admin)                                                                |
| `tests/config-api.test.ts`         | +67/-0  | 5 client cases (request shape, error pass-through, response handling)                                                                                                  |
| `tests/use-prompt-config.test.ts`  | +65/-0  | NEW file — 4 unit tests for `applyRenameToModeList`                                                                                                                    |
| `package.json` / lock              | +3/-3   | 1.9.0 → 1.10.0                                                                                                                                                         |

Test count 354 → 366 (+12 new; helper-coverage focused).

**Day rollup:**

| Repo   | Merged | Commit    | Closes / Note                                                                  |
| ------ | ------ | --------- | ------------------------------------------------------------------------------ |
| portal | #237   | `ddf6ca7` | 2026-06-25 EOD docs (merged overnight)                                         |
| portal | #238   | `52e8894` | #232 partial (rename shipped; issue stays open for rights-migration follow-up) |
| portal | n/a    | n/a       | Tag **v1.10.0** pushed alongside #238 merge                                    |

**Issues closed today:** web-client #42 (closed as wrong-framing; replaced by web-client #45).
**Issues filed today:** web-client #45 (PR-time `opennextjs-cloudflare build` gate, correctly-framed replacement for #42).

**In Progress:**

- None code-wise. The rights-migration follow-up for #232 is not yet filed as its own tracking issue — it lives in #232's body and Ian's 14:00 UTC comment.

**Blockers / Carryover (mostly unchanged):**

- **#232 shepherd rights-migration follow-up** — NEW. Needs a design pass: migrate `mode_edit_rights` / `mode_publish_rights` entries (old slug → new slug) atomically with the rename across all admin users. Cross-cutting (touches the admin-users store; atomicity concerns; no engine support today). Probably warrants its own issue + design memo before code.
- **#232 follow-up capabilities from Ian's plan** — clone (§2), alias display + retire-and-forward (§3), export aliases (§4) all deferred. Worth filing as a stub issue tracker so they don't drop on the floor; Ian's plan comment is the design source of truth.
- **#230** — Elsy locked; Ian's worker #257 contract questions still pending.
- **Track E phase 1 step 1 (#154 ↔ worker#94 reconciliation)** — still un-picked; foundational for #155/#156/#160/#183.
- **web-client #45 — PR-time build gate** — filed 2026-06-26 as the correctly-framed replacement for closed #42. Adds an `opennextjs-cloudflare build` job to CI on Node 20, mirroring the deploy path; closes the PR-time gap where a build break currently only surfaces on post-merge deploy-staging. Small scope; unowned.
- **Demo (June 9) retrospective** — 17 days stale.
- **Track G #215 Path B Zulip draft** — unsent from 2026-05-28.
- **Cascade design (Track B) implementation** — #170/#172 — gated on Ian's `ORG_CONFIG` vs new `SYSTEM_CONFIG` KV decision.

**Patterns / decisions captured this session:**

- **Slug-scoped per-row rights are coupled to slug stability.** The #232 PR-3 fix surfaced a general rule: any per-row capability whose key is a mutable identity (here, mode slug) has a hidden invariant — "rename N implies migrate every per-row reference to N." Until the migration story exists, the safe move is to restrict the rename to actors whose rights are not slug-scoped (admin / super-admin). This same shape will apply if/when language renames become a feature: per-row language rights would need the same treatment.
- **An EOD written before evening work has shipped is structurally incomplete.** Yesterday's EOD ran at the close of the #181 PR 2 work, before #232 was even touched. The lesson isn't "always wait until midnight" — it's "if the day continues, the EOD entry needs to be amended or a continuation entry added." A reconciliation entry the next morning (this one) is a workable shape but the chronology stays cleaner if continuation work updates the same-day entry directly.
- **Narrowing scope mid-implementation is a legitimate move when the unshipped pieces are genuinely follow-ups.** Ian's plan covered 4 capabilities; PR #238 shipped 1 (rename) plus §0. Clone, alias display, retire/forward, and export aliases each map cleanly to standalone follow-ups, none of which block users from the primary ask ("rename without stranding users"). The discipline that makes this work: each deferred capability needs an owner and a tracking issue, not just an "I'll get to it." None of Ian's three deferred capabilities are tracked yet — that's a gap.
- **Ian's engine-first sequencing is fast.** Engine #284 plan posted same-day as Elsy filed (2026-06-24); engine implementation shipped + tagged 2026-06-25; portal half merged 2026-06-26. ~48 hours filed-to-shipped for a cross-repo high-priority ask. The structural enabler is that the engine side specifies the contract precisely enough that the portal side can implement against it the moment it merges, with the BFF doing pure pass-through (no business logic) — which is exactly what PR #238 looks like.

**This session (2026-06-26 morning) also completed — disposition of web-client #42:**

- **web-client #42 closed** with a comment explaining the framing was wrong: the `_global-error` prerender failure that justified removing the Build job in PR #41 only reproduces on Node 22; CI/deploys both run Node 20 and `opennextjs-cloudflare build` has shipped cleanly on Node 20 multiple times, most recently Ian's 2026-06-24 prod promotion. The "restore once upstream fixes `_global-error`" trigger in #42's body was waiting on a fix that doesn't need to happen for our build path to be green. Also: mechanically restoring the old job shape (`next build` + `.next` bundle upload) wouldn't gate the path that actually ships.
- **web-client #45 filed** as the correctly-framed replacement: add an `opennextjs-cloudflare build` job to CI on Node 20 mirroring `deploy-staging.yml`'s build prelude minus the actual deploy, hard-fail on build error, no `continue-on-error`. Closes the PR-time gap where build breaks currently only surface post-merge on deploy-staging. Captured open questions on the wrangler-secrets-for-build-only question + bundle-size-reporting-as-followup.

**Next session:**

1. **File the #232 follow-up issues** — at minimum one for shepherd rights-migration (the active gap that keeps #232 open) and one umbrella for Ian's deferred §2/§3/§4 capabilities (clone, alias display + retire/forward, export aliases). Without tracking issues these will drop.
2. **#230 — only if Ian has responded on worker #257.** Still gated.
3. **Track E phase 1 step 1 (#154 ↔ worker#94 reconciliation)** — gated on Ian for KV namespace placement.
4. **web-client #45 implementation** — small workflow PR if no one else picks it up first.
5. **Demo retrospective + Phase 1 plan refresh** — increasingly stale.

---

### 2026-06-25 — #181 PR 2 shipped end-to-end (5 commits, 4 Frank review rounds); EPIC #181 closed; staging deployed

**Context entering the session:** Yesterday's #181 PR 1 (schema + lazy migration) shipped at `3bebe24`. Today's plan from the 2026-06-24 EOD: pick up PR 2 (enforcement + UI). #230 was waiting on Elsy/Ian. Two other follow-ups (web-client #42 disposition, Track E phase 1 step 1) parked.

**Completed:**

- **#230 morning check-in.** Read Elsy's overnight reply locking the three product decisions: granularity = per-subject/category with expandable rows (defensible under probabilistic RAG, BSK trust signal preserved via expansion view), language × mode product = per-mode only with language as display-time resolution, default for uncurated = everything in server-default order. Her last paragraph surfaced a NEW design choice the memo hadn't: **exclusion capability is server-dependent** — translation-helps and Aquifer can't enforce exclusion (probabilistic), FIA / Johan's server can (filter at MCP level). Posted ack-and-nudge comment on #230 confirming the three locks in my own words, raising the exclusion-capability axis as a new (i)/(ii)/(iii) choice with lean toward (i) hide-affordance-per-server, and re-pinged @IanLindsley on the three open contract questions for worker #257.

- **PR #236 — #181 PR 2 (enforcement + UI) shipped end-to-end.** Merged at `e46d32b` 2026-06-25 18:08 UTC. **Five commits over the day across the initial implementation + four Frank review rounds**:
  1. **Initial implementation** (`6ec71ea`, 1314+/89-). BFF verb-perms gate (`worker/config.ts:gateConfigMutation`) diffs PUT body against current engine state to determine which verbs the diff implies — necessary because the portal always sends both `document` and `published` on every PUT, so naive presence-based intent doesn't work. DELETE requires both verbs. Asymmetric admin trump: cross-org super-admin bypasses everything; admin trumps per-row FOR MODES ONLY (preserves pre-#181 "admin can edit all modes" while keeping the per-language same-org gate intact per PR #185). Mode-baseline gate blocks non-admin shepherds without any explicit grant. 4-selector dialog (`rights-selector.tsx` renamed from `language-rights-selector.tsx`, parameterized over `kind` ∈ {language, mode} and `verb` ∈ {edit, publish}). Both Admin User dialogs wired with the 4 selectors. Mode footgun guard: undefined for a mode verb past the baseline returns `[]` (not legacy full). Union helpers (`hasAnyLanguageAccess`, `hasAnyModeAccess`, `filterByAnyRights`). 16 verb-perms tests + 10 verb-diff pure-function tests + 5 union-helper tests = +43, 293 → 336.

  2. **`/code-review xhigh` round** (`139c3e7`, 12 of 15 findings addressed). Reading the workflow output surfaced several real issues including: F1 — `rightsFor` language fallback returned undefined (legacy full) when both explicit and legacy were missing → privilege escalation on partial verb-perms (tightened to partner-aware deny mirroring modes); F3 — clicking "Specific" radio on a legacy-undefined value clobbered full access to `[]` in one click → pre-populate all items for languages; F8 — dialogs used caller's-org item lists, so super-admin creating users in another org granted wrong names → moved fetches into each dialog with target-org param; F10 — `diffRights` JSON.stringify was order-sensitive → sort normalize; F11 — engine GET 5xx → 502 broke autosaves → fall through as null (creation, conservative); F15 — engine row without `published` field caused false 403s → `current.published ?? false`; F4/F12/F13 — page gates still read legacy `language_rights` → migrated to union helpers, `hasAnyModeAccess({}) → false` to match worker baseline; F6 — mode legacy hint claimed a privilege legacy non-admins never had → suppressed; F7 — Users-table column showed only legacy field → replaced with effective verb-perms 2×2 access grid. F5 (no-op PUT bypass) refuted as early-deny already covers it; F9 (useEffect clobber) pre-existing in PR 1; F14 (speculative). +6 tests (336 → 342).

  3. **Frank rd-1** (`adba072`). Three P1/P2 findings: (P1) **auth.ts defeated the partner-aware deny** — `validateSession` + `handleLogin` materialized missing `language_*_rights` from `language_rights` BEFORE the session reached `rightsFor`, so the partner-aware check in the gate never fired for stored partial-state users. Factored `lazyMigrateLanguageRights(user)` shared by both auth paths: when either verb is explicit, the unset partner falls back to `[]` (not legacy). Only both-unset users get legacy back-compat. Existing test that asserted `publish:["en"]` for a partial-storage user encoded the bug — flipped to assert `[]`, plus 2 new tests for Frank's exact scenario. (P1) **Selectors hid publish/delete behind isAdmin** despite worker now allowing non-admin shepherds with publish-rights → replaced `isAdmin` prop with `canCreate` / `canPublishSelected` / `canDeleteSelected` flags in both LanguageSelector + ModeSelector. (P2) **Modes page exposed all modes** to non-admin shepherds and enabled edit attempts on unauthorized rows → ModesPage now mirrors LanguagesPage with `filterByAnyRights`, selection-cleanup useEffect, per-row gates. +2 auth tests.

  4. **Frank rd-2** (`e1b7aee`). Two more findings: (P1) **Edit dialog + AccessSummary used the old `verb ?? language_rights` fallback** which after the auth.ts fix no longer matches worker semantics → admin sees publish="\*", touches another field, F2's both-verbs persist logic widens publish explicitly. Factored four `effective{Language,Mode}{Edit,Publish}Rights` helpers mirroring `lazyMigrateLanguageRights` on the client; wired at every site that needs worker-equivalent reads (dialog populate + diff baseline, AccessSummary, page-level editRights/publishRights). (P2) **Publish-only users got writable editor** that 403s on autosave → both pages compute `canEditSelected`, pass to `MarkdownEditor readOnly`, Save button `disabled`, and autosave useEffect short-circuit. +10 tests for the helpers (344 → 354).

  5. **Frank rd-3** (`91fdec1`). One P1: **`/modes` route still wrapped in RequireAdmin** even though activity-bar opens it for `hasAnyModeAccess` → created `RequireModeAccess` route guard (admin OR hasAnyModeAccess) and swapped into App.tsx for `/modes` only. `/admin/users` and `/prompt-configuration` remain admin-only.

- **#181 EPIC closed.** GitHub auto-closed via `Closes #181` keyword in the PR body. Posted a comment with the closeout summary listing all acceptance criteria met across PR 1 + PR 2 and the staging deploy link.

- **Staging deploy succeeded** end-to-end on `e46d32b` — deploy-staging.yml workflow run 25530389396 success, ~1m total wall-clock. Staging now serving the verb-perms enforcement + 4-selector dialog + readOnly publish-only editor.

**Day rollup:**

| Merged | Commit                                                | Closes                                            |
| ------ | ----------------------------------------------------- | ------------------------------------------------- |
| #236   | `e46d32b` (squash of 5 commits on the feature branch) | EPIC #181 (auto-closed via `Closes #181` keyword) |

**Issues closed today:** #181.
**Issues filed today:** none.
**Comments posted:** Elsy on #230 (ack-and-nudge with the exclusion-capability axis), #181 closeout summary.

**In Progress:**

- None code-wise.

**Blockers / Carryover:**

- **#230 — Elsy locked, Ian still pending.** Three product decisions locked overnight; three contract questions still out to Ian on worker #257. Substantive portal code blocked until Q6 (where the curated priority list lives at write time) lands.
- **Track E phase 1 step 1 (#154 ↔ worker#94 reconciliation)** — still un-picked. Foundational unlock for #155/#156/#160/#183. Phase 1 step 2 (#181) is now done, so this is the natural next slice — but it needs Seth+Ian deliberation on KV namespace placement before implementation.
- **web-client#42 disposition** — still open from 2026-06-13. Frame is correct (Node-22 sandbox issue, not project regression) but the CI Build job is still removed. ~10 min PR to restore or close-as-wrong-framing.
- **Demo (June 9) retrospective** — 16 days stale.
- **Track G #215 Path B Zulip draft** — unsent from 2026-05-28.
- **Cascade design (Track B) implementation** — #170/#172 — design locked, gated on Ian's `ORG_CONFIG` vs new `SYSTEM_CONFIG` KV decision.

**Patterns / decisions captured this session:**

- **Lazy-migration sites must encode any new business rule, not just enforcement sites.** Frank caught that the partner-aware deny in `worker/config.ts:rightsFor` was defeated by `worker/auth.ts`'s `??` fallback — auth.ts pre-filled the unset verb from `language_rights` before the session reached the gate, so the gate's partner-aware branch never fired. Lesson: when introducing a new rule that interacts with an existing migration, the migration site has to apply the rule too. Adding the check downstream isn't enough. Captured as memory [[project_lazy_migration_pattern]] needs an update with this nuance.

- **Client-side "worker effective" needs explicit mirror helpers.** Frank's rd-2 P1 was the dialog + AccessSummary showing `publish="*"` for a user the worker treats as `publish=[]` — the naive `verb ?? language_rights` matched the OLD migration but not the new partner-aware rule. Lesson: any client-side computation that answers "what does the worker see?" needs a named helper that mirrors the worker logic exactly, not an ad-hoc `??` chain. Factored four `effective{Language,Mode}{Edit,Publish}Rights` helpers as the source of truth for this projection.

- **Per-row capability needs end-to-end gating, not partial.** Frank's rd-2 P2 was the publish-only user with a writable editor that 403s on autosave. Just hiding the publish button isn't enough — the editor itself needs `readOnly`, Save needs `disabled`, autosave needs to skip. Three places must agree on the capability boolean. Lesson: when introducing a per-row capability for a multi-state UI, enumerate every site that produces a wire request (or accepts user input that leads to one) and gate them all.

- **Route guards must follow sidebar gates.** Frank's rd-3 P1 was a sidebar-shows-but-route-bounces inconsistency. Lesson: when loosening a sidebar gate (e.g., showing Modes for non-admin shepherds), check the route guard — they're parallel surfaces and need to agree.

- **`Closes #N` in the PR body auto-closes through squash merges.** Worth re-noting: the EPIC #181 close fired the moment #236 merged. The `Closes #181` keyword in the PR body is the trigger; the squash merge carries the body forward. No need for a separate `gh issue close` step.

- **The workflow-driven `/code-review xhigh` is high-value at this scale.** 15 reportable findings on a 1300-line PR, of which 12 were real fixes (3 were stylistic / pre-existing / speculative). Severity-ranked output let me triage quickly. The 28 refuted findings document what the agents considered and rejected — useful evidence vs. blind trust.

**Next session:**

1. **web-client #42 disposition** — ~10 min cleanup. Restore CI Build on Node 20 OR close as wrong-framing. Either way, the carryover from 2026-06-13 closes.
2. **Track E phase 1 step 1 (#154 ↔ worker#94 reconciliation)** — only viable self-driven next slice now that #181 is done. Foundational, but needs Ian deliberation on KV namespace. Worth raising at next sync.
3. **#230 — only if Ian has responded on worker #257.** Substantive portal work still gated; nothing actionable on the portal side until Q6 (storage location) lands.
4. **Demo retrospective + Phase 1 plan refresh** — increasingly stale.

---

### 2026-06-24 — Both prod promotions cleared; #181 PR 1 + orphan cleanup shipped; #230 assigned + scoped

**Context entering the session:** 11 days since last EOD (2026-06-13). Both prod-promotion carryovers (portal 42 days stale, web-client never-promoted) still pending Ian/Elsy comfort. Track E phase 1 was oriented but no implementation slice picked. Identity-bridge reframe complete from prior session. Session opened with a small web-client follow-up: PR #44 (org-name-spaces, Frank's regex fix) needed merge — green from a prior background CI run.

**Completed:**

- **bt-servant-web-client PR #44 merged** (org-name-spaces regex tightening per Frank's P2). Squash-merged `1446d9c`, remote branch cleaned up via API delete after the in-worktree branch checkout blocked `gh pr merge --delete-branch` (same pattern as the previous in-worktree merges). Post-merge CI green.
- **#230 picked up + dup landscape mapped.** Elsy assigned the new resource visibility & prioritization panel (per-mode RAG curation) overnight; surfaced as portal #230. Recon found three pairs of duplicate-ish issues from two BTServant syncs: portal #211 (Elsy's earlier draft) + worker #254 (sync note) both pre-date the cleaner #230 / #231 split. Sent Elsy a tightening message: confirm-the-dups, panel-side question (left vs right rail), include/exclude-vs-prioritize-only collapse, worker #257 unassigned. **Elsy responded within ~20 min**: dups closed (#211 + worker #254); panel goes on the **left** rail as a new icon next to Languages/Modes/Users; **prioritize-only** (no include/exclude); worker #257 moved as sub-issue of #230 and assigned to Ian.
- **Aquifer recon for #230.** Read all of the worker MCP layer (`bt-servant-worker/src/services/mcp/types.ts`, `catalog.ts`) and translation-helps-mcp's tools registry. **Key find**: worker has _no_ resource concept today — only tools. Worker's `MCPServerConfig.priority` is server-level only, sorted at `bt-servant-worker/src/durable-objects/user-do.ts:1523` — distinct from the per-resource priority #230 wants. **Second key find**: translation-helps-mcp **already** exposes a `list_resources_for_language` tool returning `{[subject]: ResourceItem[]}` where `ResourceItem = {name, subject, organization, version?, url?}` with 7 default subjects (Bible, Aligned Bible, Translation Words, Translation Academy, TSV Translation Notes, TSV Translation Questions, TSV Translation Words Links) — maps almost exactly to Elsy's taxonomy. Aquifer is reportedly the same shape but not checked out locally; can't verify directly.
- **#230 design memo posted** ([comment](https://github.com/unfoldingWord/bt-servant-admin-portal/issues/230#issuecomment-4791660977)) capturing the verified state of worker + portal + translation-helps-mcp with three open questions for Elsy (granularity axis: per-individual-resource vs per-subject-category; language × mode product; default behavior on un-curated modes) and three for Ian on worker #257 (standardize on `{[subject]: ResourceItem[]}`, single worker-aggregated endpoint vs per-server proxy, where the curated priority list persists). Memo cited file paths so reviewers can verify each claim.
- **Orphan `McpServerConfig` cleanup — PR #233 shipped.** Verified via `grep -rn "McpServerConfig"` that the portal-side interface in `src/types/mcp-server.ts` is unused (single defining-file hit). `git log` confirms it landed in commit `0a8ce41` "Add UI shell ... placeholder pages" — original project-kickoff scaffolding, never wired. Worker has its own separate `MCPServerConfig` in `bt-servant-worker/src/types/mcp.ts:26` used at runtime. Pre-commit gates clean; merged at `6c4611f`.
- **Portal v1.9.0 prod deployed by Ian** at 15:55 UTC (workflow run 28111591084, 1m47s success). One promotion landed: EPIC #72 closure, CM6 editor migration, Export Config, cross-org config edits, version-bump catch-up, Track E plan refresh — the entire 18-commit post-2026-05-13 stack in one go. **Closes 42-day promotion gap.** 1.9.0 finally visible in prod, deploy-disambiguation gap Elsy flagged in May fully closed.
- **Web-client first-ever post-#41 prod deploy by Ian** at 16:25 UTC (workflow run 28113432886, 1m11s success). CHAT_ORG_KV server-side binding, Credentials stub removed, client switcher gone, #43 deploy hotfix, #44 space-handling fix — all live. **First chat-app prod deploy since 2026-04-30** (55-day gap). Ian's note: "My bots agree with your bots. Deploying to prod."
- **#181 verb-perms design lock memo posted** ([comment](https://github.com/unfoldingWord/bt-servant-admin-portal/issues/181#issuecomment-4791780928)) with three decisions locked after Seth accepted the recommendations: (1) server-side change-detection on the existing PUT (no new publish endpoint), (2) keep `LanguageRights = string[] | "*"` shape for all four new rights fields (NOT `{[name]: boolean}` as the original body proposed) — identity-copy lazy migration, (3) ship both language + mode verb-perms together (one design, PR 1 = schema + lazy-migrate, PR 2 = enforcement + UI). Body amended with a locked-decisions banner so future readers don't re-debate the superseded specifics.
- **#181 PR 1 shipped — verb-perms schema + lazy migration.** Merged via PR #234 as `3bebe24`. Four new optional fields on `StoredUser` + `SessionData` (`language_edit_rights`, `language_publish_rights`, `mode_edit_rights`, `mode_publish_rights`) all using `LanguageRights = string[] | "*"`. Lazy fallback in three places in `worker/auth.ts`: `validateSession` (per-request rehydration), `handleLogin` (initial session construction), and the `/login` + `/me` response shapes — `language_*_rights ?? language_rights`. `worker/admin.ts` renames `parseLanguageRights` → `parseRights(value, fieldName)` so a bad `mode_edit_rights` payload doesn't surface as a misleading "language_rights" error; `safeUser` round-trips all four; `createUser` + `updateUser` accept + validate them. `src/types/auth.ts` mirrors the four new fields on `AuthUser`. **No enforcement change** at `worker/config.ts:171` — pure type expansion. **Reviewer initially flagged a coverage gap** (no direct tests for the new lazy-migration response fields or malformed new field names); per [[feedback_real_tests]] added 16 tests across `tests/admin-auth.test.ts` (CRUD round-trip, `parseRights` field-named errors via `it.each`, `listUsers` shape) and a new `tests/auth.test.ts` (lazy-mapping cases for legacy `["en"]` / `"*"` / `undefined`, explicit-wins-over-fallback, mode-rights pass-through). Reviewer cleared the test additions on re-review. Test count 277 → 293. Pre-commit gates + CI green both rounds.

**Day rollup:**

| Repo       | Merged | Commit    | Closes                                                    |
| ---------- | ------ | --------- | --------------------------------------------------------- |
| web-client | #44    | `1446d9c` | — (org-name regex tightening, Frank P2)                   |
| portal     | #233   | `6c4611f` | — (orphan type cleanup, no tracking issue)                |
| portal     | #234   | `3bebe24` | — (#181 stays open for PR 2)                              |
| portal     | n/a    | n/a       | Portal v1.9.0 prod deploy (Ian) at workflow `28111591084` |
| web-client | n/a    | n/a       | Web-client prod deploy (Ian) at workflow `28113432886`    |

**Issues closed today:** portal #211 + #217 + worker #254 (closed by Elsy as dups of #230 / #231).
**Issues filed today:** none — #230 and worker #257 were already filed by Elsy from Monday's sync; today's work was scoping not filing.
**Cross-repo coordination:** Elsy moved worker #257 as a sub-issue under #230 and assigned to Ian.

**In Progress:**

- **#181 PR 2 (enforcement + UI)** — unblocked, ready to start. Five sub-items: split `worker/config.ts:171` `hasLanguageRights` into edit/publish via change-detection on PUT body, add parallel `mode_*_rights` gate to `/api/config/modes/{name}` PUT/DELETE, factor `LanguageRightsSelector` into generic `RightsSelector` parameterized over `kind`, wire 4 selectors into AdminUserEditDialog + AdminUserCreateDialog, tests for edit-without-publish / publish-without-edit / legacy-grandfather / admin-trump rules.
- **#230 design memo** — out for reaction. Six questions queued; three for Elsy (granularity axis, language × mode product, un-curated default), three for Ian on worker #257 (contract shape, endpoint topology, write-time storage). No substantive portal work doable until these lock.

**Blockers / Carryover:**

- **web-client#42 disposition** — still open from 2026-06-13 EOD. Framing is now correct (Node-22-specific sandbox issue, not project regression) but the CI Build job remains removed. Either restore it (~10 min PR on Node 20) or close-as-wrong-framing. Not touched today.
- **Track E next slice (#154 + worker#94 reconciliation)** — phase 1 entry step 1, still un-picked. Foundational unlock that gates #155/#156/#160/#183. Needs Seth+Ian deliberation on KV namespace placement before implementation. Self-driven #181 work picked instead today.
- **Demo (June 9) retrospective** — not yet summarized in tracker. Demo target has been passed for 15 days.
- **Welcome flow (#180 + web-client#38)** — separable product slice, still parked.
- **Ian's version-bump skill into `uw-dev-skills`** — pending from 2026-05-28; no movement.
- **Track G #215 Path B Zulip draft** — still unsent from 2026-05-28.
- **Cascade design (Track B) implementation** — #170 / #172 — design locked, gated on Ian's `ORG_CONFIG` vs new `SYSTEM_CONFIG` KV namespace decision. No movement.

**Patterns / decisions captured this session:**

- **"worker" disambiguation.** The #181 body referenced `worker/config.ts` — initially I assumed that meant `bt-servant-worker/src/config/`, but grep against bt-servant-worker returned zero `language_rights` hits. The admin-portal has its own `worker/` directory (the Cloudflare-Worker BFF), and that's where StoredUser / SessionData / language_rights actually live. Heuristic: when an issue body says "worker/X", first check which repo the issue belongs to and which `worker/` it could mean. Admin-portal's BFF and bt-servant-worker (the engine) are both legitimately referred to as "worker" and the wrong assumption costs a recon detour.
- **Lazy-migration via session rehydration.** The existing `validateSession` pattern (re-read StoredUser from KV on every request, construct SessionData fresh) is the right place to add lazy fallbacks for any new field on StoredUser. PR 1 added the verb-perms fallback there _and_ at the parallel construction site in `handleLogin`, plus at the `/login` + `/me` response shapes. The same pattern applies to any future StoredUser additions — no separate backfill script needed, no DB migration ceremony.
- **Verb-perms shape decision (#181).** Kept the discriminated `LanguageRights = string[] | "*"` shape for all four new rights fields rather than the proposal's `{[name]: boolean}` map. The shape choice collapses lazy migration to an identity copy, keeps JSON compact, and lets the existing `LanguageRightsSelector` parameterize over modes vs languages in PR 2. The map shape would have required a real conversion in the migration layer and forced a different UI component family.
- **Aquifer "ready" claim has a verifiable shape.** translation-helps-mcp's `list_resources_for_language` returns `{[subject]: ResourceItem[]}` — that's likely the shape Aquifer also exposes, and the natural worker #257 contract. Confirms the granularity question for Elsy (fine per-resource is _available_ from translation-helps; the question is whether portal UX should expose it or collapse to per-subject).
- **Reviewer "not a blocker" coverage gap ≠ "skip the tests."** The PR 1 reviewer cleared the schema-only PR with no medium+ issues but noted the new lazy-migration response fields lacked direct tests. Per [[feedback_real_tests]] standing position, added the tests anyway before merge — pure functions with discrete edge cases (5 inputs × 4 output fields, clean cases for legacy / wildcard / undefined / explicit-override / mode pass-through). The reviewer cleared the test additions on re-review.
- **Memo-before-code is the right shape for design-loaded work.** The #181 memo posted before any code surfaced three real tensions (no publish endpoint exists; shape mismatch in proposal; no mode UI exists). Resolving them on the issue rather than mid-PR meant PR 1 was a clean diff with no spec drift. Same pattern applied to #230 memo — surfaced six questions, the actual implementation is now blocked on product decisions, not blocked-in-flight.

**Next session:**

1. **#181 PR 2** — enforcement + UI. Self-driven, unblocked, design fully locked in this morning's memo. Probably 2 sessions of focused work.
2. **web-client #42** — quick close-or-restore. ~10 min cleanup of 2026-06-13 carryover.
3. **#230** — only if Elsy/Ian have responded to the design memo. Otherwise it waits.
4. **Track E phase 1 step 1 (#154 + worker#94)** — gated on Ian availability; worth raising when next sync with him happens.
5. **Demo retrospective + Phase 1 plan refresh** — increasingly stale.

---

### 2026-06-13 — Identity-bridge reframe shipped to staging; Track E phase 1 oriented; web-client back in deployable shape

**Context entering the session:** 16 days since last EOD (2026-05-28 afternoon). Demo target (June 9) has passed; outcome not yet summarized in tracker. EPIC #72 was marked "fully closed" in the previous entry but `gh` still showed it OPEN — the close never actually happened. EPIC #171 (Identity Bridge — Admin Portal ↔ Chat App) was the next-priority work; Elsy had pinged "Can you work on this next?" on 2026-06-03, and Ian had posted a substantial reframe on 2026-06-06 collapsing the multi-month bridge into a ~1–2 day narrow fix. Session opened with an unmerged Track E plan refresh PR queued from last work and the cascade architectural decision newly locked per memory update.

**Completed:**

- **EPIC #72 actually closed** via `gh issue close 72 --reason completed`. Three DoD items met across prior sessions; the "Status as of 2026-05-13" forward-looking section of the body referenced worker #215 + portal #77 visual half which both landed since. Closure comment captured each item with shipped-via references. Tracker had been wrong about closure for 16 days.
- **#125 reopened** with explanation of the accidental May 13 docs-PR `Closes #125` keyword re-close. Phase 2 (full deletion of Prompt Overrides page + BFF route + types) still gated on worker#215; #125 remains the portal-side tracker. Matches [[feedback_gh_closes_keyword]] memory gotcha verbatim.
- **PR #202 — Track E table refresh (Phase 1 orientation).** Doc-only change to `docs/tuning-project-plan.md` rev 6 + Frank P2 fix as rev 7. Replaced stale `#157/#181` + `#158/#182` "Potential duplicates — reconcile" rows with their actual resolved state (closed 2026-05-28 as dups). Corrected dependency column per actual sub-issue bodies: #155/#156/#160 depend on #154 (the foundational versioned-config API), not "Independent"/"Blocked by #156"; #156 depends on #154 + #181; #163 depends on #156; #183 depends on #181 (formerly #157, now closed). #154 callout promoted to "Foundational" per its own body. Added explicit 6-step Phase 1 entry sequence: (1) #154 ↔ worker#94 reconciliation + API contract draft; (2) #181 verb-perms schema + UI; (3) implement #154 worker-side; (4) #155 optimistic concurrency + #160 portal diff view; (5) #156 revision states + dependents #159 / #163; (6) #182 audit log. Steps 1–2 unblocked today. Frank P2 caught that step 5 originally listed #160 under #156-dependents — contradicted the corrected dep table — fixed in 829ad3a. Merged `eca7104..3169477` after Frank approve.
- **EPIC #171 reframed and closed (cross-repo).** Per Ian's 2026-06-06 analysis: "the admin portal and chat web client are sibling clients of bt-servant-worker — the engine owns org config, language overrides, modes, all of it. Both clients just forward to the engine with org context, so the chat app doesn't need to 'share identity' with the portal for those settings to flow through." Verified Ian's three concrete claims against `bt-servant-web-client` code via Explore agent: (1) the Credentials provider at `src/auth.config.ts:12-29` is a stub with no password field and `authorize()` returns whatever email is typed — login UI at `(auth)/login/page.tsx:106-134` has no password input; (2) `src/app/api/chat/stream/route.ts:60` accepts `org` from request body with regex-only validation (`src/lib/validate-org.ts:9-14`, pattern `/^[a-zA-Z0-9_-]{1,100}$/`); (3) zero hits across the chat-web-client repo for `isAdmin`/`isSuperAdmin`/`language_rights`/`AUTH_KV`/role — chat app is identity-thin by design. Reframe accepted; closed EPIC #171 + #177 + #178 + #179 (admin-portal) and #36 + #37 + #39 (web-client) as `not planned` with canonical comment cc'ing Elsy + Ian. Welcome flow (#180 + web-client #38) explicitly kept open as separable product slice.
- **bt-servant-web-client#40 filed as the narrow replacement.** Single PR scope: add `CHAT_ORG_KV` (email → org) for server-side binding; auto-provision new Google-signed-in users with `DEFAULT_ORG` on first sign-in; `/chat/stream` reads `org` from `CHAT_ORG_KV.get(email)` server-side ignoring client-supplied; partner-specific users get values set out-of-band via wrangler/CF dashboard; delete the Credentials stub; remove the now-obsolete client-side org switcher.
- **bt-servant-web-client PR #41 shipped #40 end-to-end.** ~5 hours of focused work across 11 files. New `src/lib/org-resolver.ts` with `resolveOrgForEmail` (KV read + slug validation) + `provisionOrgForEmail` (idempotent first-time write). NextAuth `signIn` callback wraps provisioning in try/catch — provisioning failures log but don't block sign-in. Credentials provider deleted; login UI simplified to Google-only. Routes `chat/stream` + `chat/history` + `preferences` all updated to resolve `org` from `session.user.email` server-side. Client-side org switcher removed (`use-org`, `feature-flags`, `BuildingIcon`, `ORG_OPTIONS`, `defaultOrg` prop on `AssistantProvider`, `org` param on `useChatRuntime`) — coherent diff vs leaving a misleading control. Added vitest (no prior test framework in repo) + 4 unit tests, expanded to 10 after Frank's F3 review pointed at the missing KV-slug validation: `it.each` cases for empty string, path traversal, slash, whitespace, overlong, and query-string injection. New `docs/maintenance.md` covering wrangler `kv key put` + CF dashboard override procedure. Iterated through 4 CI rounds for unrelated pre-existing issues: round 1 cleared by adding `cf-typegen` to CI before typecheck (cloudflare-env.d.ts is gitignored); round 2 by ignoring the regenerated `.d.ts` from eslint globalIgnores; round 3 by dropping `next` to `^16.2.9` + adding `overrides` for esbuild/ws/postcss/qs/fast-xml-parser to clear pre-existing CVE chains accumulated since main's 2026-04-30 last CI run; round 4 by Frank's hardening pass — explicit `session.user.email` propagation, drop masked Build CI job entirely (vs `continue-on-error: true`), gate `npm test` in CI. Merged `3a53ce2`.
- **bt-servant-web-client PR #43 unblocked the deploy path.** First staging deploy after PR #41 merge failed because `cloudflare-env.d.ts` is gitignored and the deploy workflows don't regenerate it (CI did; deploy didn't). Hotfix added `npm run cf-typegen` before `opennextjs-cloudflare build` in both `deploy-staging.yml` and `deploy-cloudflare.yml`. Also dropped the dangling `NEXT_PUBLIC_ENABLE_ORG_SWITCHER` env from staging (switcher gone, env left orphaned). Merged `638f136`.
- **bt-servant-web-client staging deploy succeeded** end-to-end on `638f136` — all 9 deploy steps green including the `Build for Cloudflare` step I'd repeatedly hit `_global-error` failures on locally. **First successful web-client deploy since 2026-04-30** (43-day deploy gap closed).
- **Reframed web-client#42** from "upstream Next 16 broken everywhere" to "Node-22-specific sandbox issue." Local sandbox is on Node 22.22.2; CI/deploy workflows are on Node 20.x. The `_global-error` prerender bug only reproduces on Node 22. PR #41 removed the CI Build job under the original incorrect framing; that's restorable as long as CI stays on Node 20.

**Day rollup:**

| Repo       | Merged | Commit    | Closes                   |
| ---------- | ------ | --------- | ------------------------ |
| portal     | #202   | `3169477` | — (Track E plan refresh) |
| web-client | #41    | `3a53ce2` | web-client#40            |
| web-client | #43    | `638f136` | — (deploy hotfix)        |

**Issues closed today:** portal #72, #171, #177, #178, #179; web-client #36, #37, #39, #40.
**Issues filed today:** web-client #40 (narrow CHAT_ORG_KV fix, immediately implemented + closed), web-client #42 (CI Build restoration tracking; framing later corrected to Node-22-specific).
**Issues reopened today:** portal #125 (Phase 2 tracking restored after accidental May 13 docs-PR re-close).

**In Progress:**

- None code-wise. Track E phase 1 is oriented (PR #202) but no implementation slice has been picked up — next sub-issue starts cold.

**Blockers / Carryover:**

- **Track E next slice not picked.** Phase 1 entry sequence step 1 (#154 ↔ worker#94 reconciliation + API contract design memo) is the foundational unlock — needs Seth+Ian deliberation on KV namespace placement before implementation. Step 2 (#181 verb-perms portal schema + UI) is parallelizable and self-contained — likely better candidate for a self-driven session.
- **Production deploys (both repos).** Admin-portal: staging is 18 commits ahead of `25ea9c1` (last prod 2026-05-13). Web-client: staging at `638f136` is the only deployable state, never promoted to prod. Both gated on Elsy comfort + manual workflow_dispatch.
- **web-client#42 disposition.** Frame is now correct (Node-22-specific) but issue is still open. Either restore the CI Build job (small workflow PR; will pass on Node 20) or close as wrong-framing. Pending.
- **Demo (June 9) retrospective.** Tracker references the demo target but Seth hasn't summarized outcome. Without that context, post-demo priorities may shift Phase 1 ordering.
- **Welcome flow (#180 + web-client#38)** — separable product slice; intentionally not in scope for #41 but worth picking up post-stabilization.
- **Ian's version-bump skill into `uw-dev-skills`** — pending from 2026-05-28; no movement.
- **Track G #215 Path B Zulip draft** — still unsent from 2026-05-28.
- **Cascade design (Track B) implementation** — design fully locked in #170/#172 bodies; only Ian's KV namespace decision (`ORG_CONFIG` sentinel vs new `SYSTEM_CONFIG` binding) remains before #172 can ship. Ian unavailability still gating.

**Patterns / decisions captured this session:**

- **"Trust code over EPIC framing" reinforced ([[feedback_trust_code]]).** When an EPIC's body claims a problem the code doesn't have, verify before building. Ian's reframe saved months of work that would've solved a non-problem. Heuristic: when starting work on an unfamiliar EPIC, dispatch a small targeted Explore agent to verify the EPIC's premise against the actual code state — at minimum, the three or four claims the EPIC's "Problem" section makes.
- **Generated-file gitignore + workflow regen pattern.** `cloudflare-env.d.ts` is gitignored in bt-servant-web-client. Any workflow that exercises types (`tsc --noEmit`, `next build`, opennext build) needs to regenerate the file via `npm run cf-typegen` first. PR #41 caught this for CI's typecheck step (round 1) but missed the deploy workflows entirely — PR #43 was the second iteration. The pattern: when a generated file is gitignored, the regen step is required in **every** workflow that touches the type system, not just the obvious one. Add to the checklist when introducing a new gitignored binding-typed file.
- **Sandbox Node version ≠ project Node version.** The uw-sandbox container runs Node 22.22.2; the project's CI and deploy workflows run Node 20.x. The `_global-error` prerender failure I treated as project-wide for 4 CI rounds was actually Node-22-specific. Heuristic: when a local build/test fails in a way that "must be broken everywhere," verify the project's Node version first. Don't trust local sandbox build failures as evidence of project-wide regression.
- **Honest CI > masked-green CI.** Per Frank's P1 on PR #41: `continue-on-error: true` plus a workflow that reports `success` while a job fails is worse than removing the job. Masked failures rot — no one notices when the underlying issue is fixed. Better to remove the job and file a tracking issue than to leave a permanently-advisory step. Applied; #42 tracks restoration.
- **NextAuth v5 implicit contracts are fragile.** PR #41's `session({ session, token })` callback initially relied on NextAuth's default `token.email → session.user.email` propagation. Three routes gated on `session.user.email` — if that default ever changed, every authenticated request would 401. Frank/Claude review caught this; PR #41 ended up making the propagation explicit. Heuristic: when a downstream callsite depends on a framework default, set it explicitly at the boundary you control.
- **Cleanup belongs with the change.** Removing the org switcher (use-org hook, feature-flags, switcher UI, NEXT_PUBLIC_ENABLE_ORG_SWITCHER env var) wasn't in the original web-client#40 scope. Folded in because once the server stops accepting client-supplied `org`, the switcher becomes a misleading control. Cleaner one-PR diff: "move org to server-side; remove the now-meaningless client control." Better than leaving dead code behind for a "later" PR.

**Next session:**

1. **Get clarity on demo outcome** so post-demo priorities can be confirmed.
2. **Pick a Track E entry point** — either #154 ↔ worker#94 reconciliation memo (cross-repo design coordination; pre-work before Ian implementation) or start #181 verb-perms portal schema (self-driven). Synthesis between the two depends on Ian availability for #154.
3. **web-client#42 disposition** — restore CI Build job as a small PR (Node 20 will pass) or close as wrong-framing.
4. **Browser smoke on web-client staging** — verify CHAT_ORG_KV binding works end-to-end with a real Google sign-in. Seth's lane.
5. **Production promotion** (portal and/or web-client) if Elsy comfort-signals.
6. **Optional Track C quick wins** — #150 org metadata, #184 read-only cross-org browse if Track E is still mid-design.

### 2026-05-28 (afternoon) — Versioning gap closed (1.5.1 → 1.9.0); 4-environment model framed; housekeeping carryover

**Context entering the session:** Morning shipped all demo-critical code (EPIC #72 closed, worker #191 closed, Export Config + language persistence live on staging). Afternoon opened with Ian's question (via Elsy's Zulip thread) about whether versions had been getting bumped, plus Elsy's parallel ask for a stable demo environment.

**Completed:**

- **Versioning diagnosis + catch-up bump shipped.** Honest answer to Ian's question: **no bumps since 2026-04-23**. The version field had been stuck at v1.5.1 since Ian's last solo-dev commit (`d9d154e`, "Bump MAX_SLOT_LENGTH"), through ~23 marquee Seth-era feature shipments across 5 weeks. All three environments displaying v1.5.1 explained why Elsy couldn't tell them apart — the field was useless as a deployment indicator. Diagnosis posted to the Zulip thread with evidence (commit/date references + feature count). PR #200 (`8b4a507`) catch-up bump 1.5.1 → 1.9.0 shipped via `npm version 1.9.0 --no-git-tag-version` — single chore commit touching `package.json` + lock only. Calibrated to Ian's prior cadence (he bumped 1.0 → 1.5 in ~6 weeks of comparable scope; 5 weeks of Seth-era shipments maps to roughly the same 5-minor jump). Number `1.9.0` chosen as synthesis of menu options (recommendation 1.10.0, conservative 1.6.0, clean-break 2.0.0). Deploy Staging fired on merge; staging now reads **v1.9.0** vs Prod's **v1.5.1** — gap is visually obvious.

- **GH Action auto-bump proposal killed in favor of Ian's existing skill.** Initially proposed wiring a conventional-commit → `npm version` GH Action so the catch-up never had to happen again (~1h PR). Seth redirected: _"Ian uses a skill for the version bumps. I'm trying to keep things uniform."_ Searched the shared `uw-dev-skills` repo (`origin/main` at `e593bd1`) — confirmed no version-bump skill there yet (current inventory: `eod`, `progress`, `sod` commands + `cf-logs` skill). Killed the parallel-automation proposal; pending getting Ian's skill shared into `uw-dev-skills` so future bumps are uniform across the team.

- **Morning EOD PR #199 + version-bump PR #200 merged in chronological order** (`b8e9937` → `8b4a507`). Both clean; remote branches deleted; per-PR worker for #200 cleaned up. Order matters: #199 first preserved the chronological accuracy of the morning EOD reflecting pre-bump state; #200 second carries the Deploy Staging trigger so staging lands at the new version.

- **Worker #141 closed in favor of portal #187** — carryover housekeeping from the morning EOD's next-step list. Issue body explicitly recommended close-in-favor-of #187 once portal-side shipped; that happened via PR #197 today. Closing comment links the portal companion + the import-path follow-up #198.

- **Memory `feedback_synthesis_between_options.md` saved.** Pattern surfaced when Seth picked 1.9.0 from a menu of 1.6.0 / 1.10.0 / 2.0.0: he often synthesizes between presented options rather than picking off the menu. Calibrated as "tendency, not a hard rule" after his joke-but-mostly-true confirmation. Useful for future option-presenting decisions: present anchors that bracket the range, not just a fixed slate. `MEMORY.md` index updated.

- **4-environment model framed (Zulip, with Ian + Elsy).** Concept locked: **Ephemeral** (per-PR Cloudflare deploys, transient, for in-flight testing) > **Dev/QA** (Elsy's QA testing target) > **Staging** (Tim/Elsy demo target with somewhat-stable features) > **Prod** (outside world). Naming is contested ("dev" vs "qa" vs "demo"); parked for ToT discussion. The version-bump catch-up is the structural enabler — until the version field disambiguated, the env-naming question was moot. Stable-demo-env strategy (cherry-pick branch, tag-based promotion, etc.) similarly parked for ToT.

**Day rollup (full day, both sessions combined):**

| Repo   | Merged | Commit        | Closes                    |
| ------ | ------ | ------------- | ------------------------- |
| portal | #191   | `d42cd10`     | — (rebase fix on docs PR) |
| portal | #197   | `a296611`     | #187                      |
| portal | #199   | `b8e9937`     | — (morning EOD docs)      |
| portal | #200   | `8b4a507`     | — (version bump)          |
| worker | #241   | (worker main) | worker #191               |

**Issues closed today:** portal #157 (dup), portal #158 (dup), portal #77, portal #187, worker #191, worker #141.
**Issues filed today:** portal #195, portal #196, portal #198, worker #240.
**Memories saved/updated:** `feedback_synthesis_between_options` (new); `project_ulysses_comment_syntax` (revised — line-vs-paragraph semantics correctly captured).

**In Progress:**

- None. Code-critical-path for demo is fully shipped on staging at v1.9.0. Hygiene/coordination items continue in parallel.

**Blockers / Carryover:**

- **Ian's version-bump skill not in shared repo.** For uniformity going forward, need to either (a) ask Ian to share his skill into `uw-dev-skills` so the team has one canonical bump workflow, or (b) accept manual `npm version` runs without a skill. Pending Seth's call on routing — Zulip ask or ToT discussion.
- **Arabic content fleshing (R-001)** — Tim + Elsy contacted morning of 2026-05-28; no movement yet. Single dominant remaining demo risk. 12 days runway.
- **Browser smoke on staging** — three targets newly available (CM6 + Export + `@<lang>` persistence + v1.9.0 version-field verification). Seth's lane.
- **Prod promotion** — staging now 17 commits ahead of `25ea9c1` (last prod deploy 2026-05-13). Gated on Elsy's comfort signal.
- **Track G #215 Path B Zulip draft** — still unsent.
- **ToT items pending:** environment naming (Dev/QA/Demo/stable-demo-env strategy), Ian's bump-skill sharing.

**Patterns / decisions captured this session:**

- **Versioning hygiene is a demo-readiness gate, not vanity.** Elsy's _"That's why we need versioning tight. So that I know."_ crystallized it. Without distinct version fields, "Dev vs Staging vs Prod" is a name-only distinction; Elsy can't confirm what's in front of her. The catch-up bump unlocks every downstream environment-naming + demo-env conversation because it makes the build-state visible. Heuristic for future tooling decisions: when a tracking field has decayed (versions stuck, dashboards stale), prioritize its restoration ahead of feature work — the field is what other people use to coordinate without DMing.
- **Calibrated catch-up: don't undersell, don't overshoot.** Conservative reads ("just bump one minor since you skipped some") undersell volume and mislead reviewers about how much changed; "clean break" 2.0.0 invites questions about what's breaking. Honest math = match the prior cadence × elapsed time. Pre-Seth Ian shipped 5 minors in 6 weeks; 5 Seth-era weeks → 5 minors → 1.10ish. Landing at 1.9.0 (synthesis between 1.6 / 1.10 / 2.0) was both honest and team-readable.
- **Uniformity-with-existing-practice over inventing-new.** Killed the GH Action auto-bump proposal the moment Seth pointed at Ian's existing skill, even though the Action would have shipped today. Reasoning: process divergence is a long-tail tax that compounds. Better to wait for the existing skill to be shared than to ship a parallel mechanism that does the same job slightly differently. Heuristic: if a teammate has an existing workflow for the gap, adopt theirs before authoring your own — even if yours would land sooner.
- **Seth synthesizes between menu options.** Captured as memory `feedback_synthesis_between_options`. When presenting decision menus on continuous spectra (numbers, scope-cut sizes, timeline buffers), present the menu as bracketing anchors and explicitly invite synthesis — Seth's pick often interpolates. For genuinely discrete decisions (yes/no, merge/don't), the pattern doesn't apply; say so.
- **Order-of-merge matters when multiple docs/chore PRs land same-day.** Morning EOD before version bump preserves chronological accuracy in commit history (the EOD reflects pre-bump state). Trivial example, but the principle generalizes: when multiple PRs are ready and only one triggers an environment-changing side effect (Deploy Staging), land the others first so they're reflected at the new environment state.
- **Sub-thread housekeeping carryover discipline.** The morning EOD's "Next Steps" listed "Close worker #141 in favor of portal #187 (housekeeping, ~5 min)" — actually done in the afternoon EOD. Useful pattern: small carryover items get listed in the previous EOD's next-steps and are first-tackled in the next session as warmup before deeper work. Keeps the open-issue surface from drifting.

**Next session (evening or next day):**

1. **Get Ian's version-bump skill into shared `uw-dev-skills`** — Zulip ask or PR mention. Unblocks uniform bumps for the team.
2. **Browser smoke on staging** — verify v1.9.0 shows in the UI, plus CM6 editor flows, Export button, `@<language>` persistence end-to-end. Seth's lane.
3. **Arabic content nudge** if no movement from Tim/Elsy.
4. **Decide on Track G #215 Path B Zulip send.**
5. **Optional Track C quick win** — #150 org metadata or #184 read-only cross-org browse (both unblocked, both demo-adjacent polish).
6. **Optional Prod promotion** if Elsy comfort-signals (manual workflow dispatch only).
7. **ToT prep**: environment naming (Dev/QA/Demo, stable-demo-env strategy), bump-skill sharing, anything else.

### 2026-05-28 (morning) — Demo code path closes: EPIC #72 + worker #191 + Export Config all ship in parallel

**Context entering the session:** Day 1 EOD (logged late 2026-05-27 local) had Track A.1 substantially descoped via D-007 and Track A.2 (CM6) shipped. Outstanding entering the morning: worker #191 e2e + persistence (queued for Day 2), portal #77 multi-line `%%` deferred as v2, PR #191 (late-evening tracker) awaiting Frank, arabic content escalation drafted but unsent.

**Completed:**

- **PR #191 (late-evening tracker) — P1 rebase fix + merge.** Frank flagged that taking the PR's stale `Current Status` hunk would roll back D-007 / CM6 / Day-1 completion. Resolution: rebase onto current main, drop stale hunk, insert late-evening session block chronologically between 2026-05-28 entry and existing 2026-05-27 #166 entry. Pure addition, 52 insertions / 0 deletions. Force-push-with-lease (`8cc1b1f` → `9731edd`). All CI green. Merged at `d42cd10`.

- **Track E duplicates housekeeping shipped (~5 min).** Per plan's quick-win callout: closed #157 as dup of #181 (verb-based permissions) and #158 as dup of #182 (audit log). Newer issues were strict supersets — schema design, migration story, full event lists. #153 EPIC body already referenced canonical numbers (no stale-ref cleanup needed). Freed Frank review later when Track E unblocks.

- **#77 closed + Ulysses parity audit + 3 follow-up issues filed.** Originally queued as "implement #77 v2 multi-line `%%` paragraph dimming." Investigation surfaced that the framing was wrong: portal's TOC parser is paragraph-terminated; editor decoration AND worker stripper are line-terminated; worker's docstring even cites "matching the admin portal's v1 parser" as line-termination rationale, but the portal's HEADING parser is paragraph-terminated. Three-component inconsistency with self-contradictory citation. Implementing portal-only paragraph-dim would have shipped NEW editor-vs-backend divergence (author sees full paragraph dimmed; model receives lines 2–n). Correct fix is end-to-end paragraph parity (Tim's stated Ulysses preference). #77 closed as all-original-ACs-met; #196 (portal) and worker #240 (companion) filed for post-demo parity work; memory `project_ulysses_comment_syntax` + `MEMORY.md` index updated to reflect actual shipped semantics.

- **worker #191 design lock posted as agent-ready comment.** Frank reviewed the persistence-mirroring-mode plan and added two refinements I missed: (1) stale/unpublished masking parallel to mode pattern at `user-do.ts:1341-1351`; (2) single-place resolution — `loadChatContext` reads `selectedLanguageName` only; `applyTriggerOverrides` is the sole site for trigger-override-OR-persisted → resolve → published-filter → inject-or-mask. Design lock posted on worker #191 ([#issuecomment-4565403569](https://github.com/unfoldingWord/bt-servant-worker/issues/191#issuecomment-4565403569)) sized for an agent to pick up cold, with implementation map + e2e test approach + reserved-token side-effect call-out.

- **Portal #195 + #198 filed.** UI affordance for surfacing persisted mode/language (#195) + Import path for exported mode configs (#198). #198 specifically satisfies #187 AC #4's "tracked in a separate issue" requirement (Frank P3 catch on PR #197).

- **PR #197 — #187 Export Config button shipped.** YAML frontmatter + markdown body export format with full escape coverage for user-controlled metadata. Sanitized + sortable ISO-timestamped filenames (`{org}-mode-{name}-{ts}.md`). 14 new pure tests (263 → 277). Self-review caught a `new Date()` called twice that could've drifted frontmatter vs filename across a second; folded into the same commit pre-push. Frank P3 post-PR: AC #4's "tracked in separate issue" requirement that I'd waved off as "out of scope when wanted" — filed #198 and corrected PR body framing without code changes. Merged at `a296611`; staging deploy fired; per-PR worker cleaned up.

- **worker #241 shipped (independent agent, Seth-driven).** Implemented per the design lock — language persistence mirroring `#<mode>` exactly. Merged at 15:55:55Z; closes worker #191. Effectively simultaneous with portal #197 merge (~15:56:31Z) — both demo-critical shipments landed within the same minute.

**Day rollup (morning session):**

| Merged      | Commit        | Closes      |
| ----------- | ------------- | ----------- |
| portal #191 | `d42cd10`     | —           |
| portal #197 | `a296611`     | #187        |
| worker #241 | (worker main) | worker #191 |

**Issues closed:** portal #157 (dup), portal #158 (dup), portal #77, portal #187, worker #191.
**Issues filed:** portal #195, portal #196, portal #198, worker #240.

**In Progress:**

- None code-wise. All demo-critical code is shipped end-to-end on staging.

**Blockers / Carryover:**

- **Arabic content fleshing (R-001)** — Tim + Elsy contacted today; awaiting their work. Single dominant remaining demo risk. 12 days to demo.
- **Browser smoke on staging** — three targets newly available: CM6 editor flows (PR #193 test plan + the in-fence negative case), Export button (PR #197 test plan), `@<language>` persistence (type `@arabic`, send a turn, send a second turn without trigger, confirm response style stays arabic). Seth's lane.
- **Prod promotion** — staging now 13 commits ahead of `25ea9c1` (last prod deploy 2026-05-13). Gated on Elsy's comfort signal. Includes super-admin, #166 cross-org, D-007 plan patch, CM6, late-evening tracker, #187 Export Config.
- **Track G #215 Path B Zulip draft** — still unsent.
- **worker #141** — original tracking for Export Config; can be closed in favor of portal #187 now that portal-side shipped.

**Patterns / decisions captured this session:**

- **Verification-before-implementation pattern repeated (cf. D-007), twice today.** Same shape: (a) Worker tests inspection found existing e2e harness + observable `vi.spyOn(globalThis, 'fetch')` seam, shaving days off the worker #191 e2e estimate; (b) `%%` semantics audit found the planned #77 v2 work would have shipped NEW divergence. Each cost ~30 min of grep + read, saved days. Heuristic: any time you're about to implement a "v2 follow-up" or "missing wire-up," spend 30 min verifying the gap is actually what you think it is.
- **Misframed "deferred follow-up" can be its own gap.** PR #193's "v1 limitation — multi-line `%%` paragraph dimming" framing was post-hoc rationalization that obscured a deeper end-to-end semantics question. Lesson: when noting a "limitation" in a PR description, check whether it's actually a limitation OR whether the spec it diverges from is itself unsettled. The latter deserves a tracking issue spanning the right surfaces, not a v2 backlog entry.
- **Don't relax acceptance criteria with post-hoc rationalization.** PR #197 body claimed Import was "out of scope when wanted" — but #187 AC #4 explicitly said "tracked in a separate issue," which is a hard requirement. Frank caught it as P3. Heuristic: when an AC says "tracked in N," file N before claiming AC closure; an AC that's been quietly demoted to "optional" is a future debt.
- **Cross-repo design coordination via on-issue comments scales well.** Posting Frank's design lock on worker #191 as a comment (with implementation map, file:line refs, e2e approach, scope/estimate, per-PR ritual lifted) gave the independent worker agent everything to pick up cold. Total orchestration time: <5 min to verify the result; the agent shipped a clean PR by 15:55Z. The agent-ready-comment pattern is reusable for any cross-repo work where a different driver picks up the implementation.
- **EPIC #72 closed on Day 1.** Original plan budgeted 7+ days for #77/#167 polish + worker #191 implementation. Actual: D-007 collapsed worker #191's implementation cost to ~6h (test + persistence); CM6 migration tractable in 1 day; #77's "v2" gap revealed to be a different shape entirely. Combined effect: 5+ days of plan slack now redirected to content readiness + soak + post-demo track-E/track-C quick wins.

**Next session (this afternoon, 2026-05-28):**

1. **Browser smoke on staging** — CM6 + Export + `@<lang>` persistence end-to-end. Seth's lane; only he can do it.
2. **Decide on Track G #215 Path B Zulip send.** Seth.
3. **Consider a Track C quick win** — #150 org metadata or #184 read-only cross-org browse. Both demo-adjacent polish, both unblocked.
4. **Close worker #141** in favor of portal #187 (housekeeping; ~5 min).
5. **Arabic content nudge** if no movement from Tim/Elsy by mid-afternoon.

### 2026-05-28 — Day 1 of June 9 critical path: worker#191 verification + CM6 editor migration shipped

**Context entering the session:** Late-evening 2026-05-27 closed with the tuning project plan locked (PR #190 merged), 51 in-scope issues cross-linked, 3 sibling-repo EPICs filed, and the late-evening tracker in PR #191 (still open). Day 1 opened with two parallel streams scheduled: A.1 (worker#191 implementation + arabic content readiness) and A.2 (CM6 editor scope check).

**Completed:**

- **Day-1 sanity check on uW spoken + arabic content readiness.** Smoke-checked the PROMPT_OVERRIDES staging KV. **Spoken-mode ready** (~48KB published markdown, slot-organized under the canonical H2s, real content). **Arabic language THIN** (~250 chars, 3 stub headings with one-sentence sketches; no DCV overrides, no example translations, no real cultural framing). Hindi at the right depth as the comparator (~5KB with DCV table + 3 example translations + framing). Escalation message drafted for Elsy/Tim, **not yet sent**.

- **Worker chat-time system-prompt assembly traced — D-007 logged.** Read the worker code path before opening any implementation PR. **Trigger-path language-document injection is already wired end-to-end** against bt-servant-worker `main` at `47626b7`:
  - `src/services/classifier/index.ts:299` — classifier sets `languageName` from `@<lang>` head tokens
  - `src/durable-objects/user-do.ts:1159-1163` — resolves `classified.languageName` to the language document
  - `src/services/claude/orchestrator.ts:917-918` — strips Ulysses comments before injection
  - `src/services/claude/system-prompt.ts:201-204` — injects `## Language Guidance\n\n${document}`
  - `tests/unit/system-prompt.test.ts:381-405` — section include/exclude both pinned
  - `src/durable-objects/user-do.ts:1047` — telemetry emits `language_document_injected`

  **Implication:** worker#191's "implementation" is shipped. Demo PROMISE works against staging today provided the user types `#spoken @arabic` at the head of every message. Remaining scope collapses to (a) e2e confidence test (~0.5d, estimate hedged pending worker `tests/` directory inspection) + (b) session-state language persistence design (gated on Chris/Ian return). Issue comment posted on worker#191 with the file:line trace.

- **PR #192 — Plan patch (D-007).** Reclassifies Track A.1 from "5-day implementation" to "0.5d e2e test + persistence design (gated)." 19 surgical updates: D-007 logged, D-005 header annotated, top-of-doc EPIC table, status table, spoken/arabic content rows reflecting Day-1 findings, day-by-day Stream 1 cells, Track A intro, Stream A.1 table, Track B strikethrough row update, Q-008 answered, bottleneck #1 reclassified. Self-review rev-5 consistency pass softened "Cleared" → "Substantially descoped" and inlined D-007 into D-005 body for cold-read consistency. Merged at `32cd1c2`.

- **PR #193 — CM6 markdown editor migration.** Closes #167 (markdown syntax highlighting via `defaultHighlightStyle` — bold/headers/lists/code/quote turn-key) + visual half of #77 (Ulysses `%%` line comments + `++…++` inline spans dimmed in italics). **D-001 mitigation NOT triggered** — CM6 was tractable in day 1.
  - Replaced `<Textarea>` with CM6 `EditorView`; controlled bridge dispatches replace-transaction only when external value differs from the editor's doc (cursor preserved on in-flight user typing).
  - `useImperativeHandle` exposes `focus()` + `jumpToLine(n)`. **Frank P2 catch from day-1 scope review:** TOC click → cursor + scroll was depending on raw `textareaRef` in both consumers; without the imperative handle, TOC would have silently regressed with zero test coverage.
  - `onActiveLineChange` callback replaces standalone `useActiveHeadingLine` hook (deleted; editor owns cursor tracking).
  - 5 minimal direct-import deps: `@codemirror/state`, `/view`, `/lang-markdown`, `/language`, `/commands`. No speculative packages.
  - **Self-review surfaced 2 P1s** (fixed before merge): (1) `readOnly` was in extensions `useMemo` deps → any flip remounted the editor and destroyed undo history. Fixed via per-instance `Compartment` + reconfigure effect. (2) Comment decoration regex matched `%%`/`++…++` inside fenced code blocks. Extracted `findCommentRanges()` into `src/lib/markdown-comment-ranges.ts` with the same fence-tracking as `parseHeadings()`. 12 new pure tests cover line/span/multi-line/in-fence/out-of-fence/unclosed-fence/ordering.
  - All quality checks green: lint clean, typecheck clean, 263/263 tests, build clean, prettier clean. Merged at `2aece57`. Staging deploy succeeded; CM6 editor live on staging.

- **GitHub issue auto-close behavior memorialized.** PR #193 had two `Closes` keywords: `Closes #167` (closed cleanly) and `Closes the visual half of #77` (did NOT close #77 — exactly the intended outcome). Memory `feedback_gh_closes_keyword.md` updated with a fourth note: **words BETWEEN `Closes` and `#N` break the parser**, useful as a workaround when you want human-readable framing AND must not auto-close. Distinct from Gotcha 2 (where prose AFTER `#N` doesn't disable).

**Day rollup:**

| Merged | Commit    | Closes |
| ------ | --------- | ------ |
| #192   | `32cd1c2` | —      |
| #193   | `2aece57` | #167   |

**2 PRs merged in one day, 1 issue closed (#167), Epic #72 functionally complete, 12 new tests (251 → 263), 0 Frank review rounds on substance — Frank's only finding was non-blocking, and the P1/P2 fixes came from self-adversarial review before merge.**

**In Progress:**

- None code-wise. Day 1 of June 9 critical path completed end-of-session.

**Blockers / Carryover:**

- **Arabic content fleshing** — escalation drafted for Elsy/Tim, **not sent**. Demo PROMISE quality is now content-bound, not code-bound. Sending tomorrow morning maximizes lead time.
- **Worker#191 e2e test (~0.5d, hedged).** Tomorrow's Stream A.1 work. Requires worker `tests/` directory inspection first.
- **Worker#191 session-state language persistence design.** Gated on Chris/Ian return. Without it, the demo requires re-typing `@arabic` every turn — material UX issue. Promoted to top _UX_ bottleneck in the plan.
- **PR #191 (late-evening tracker)** still open, awaiting Frank since 2026-05-27 22:18 UTC. CI green.
- **Browser smoke of CM6 on staging** — not done (background-session limitation). Seth/Frank to verify TOC navigation + typing + dark-mode rendering before declaring migration fully validated.
- **Multi-line `%%` paragraph decoration** — #77 stays open. Editor v1 dims only the first line of a multi-line `%%` paragraph.

**Patterns / decisions captured today:**

- **Verification can collapse implementation scope (D-007).** Day-1 trace revealed worker#191's "implementation" was already shipped end-to-end — saved 4 days of bandwidth that would have re-implemented an existing path. **Heuristic:** before opening a PR against an "open implementation" issue, spend 30 minutes tracing whether the code path already exists. Cost is asymmetric — verification is cheap; redundant implementation is expensive (review cycles, merge conflicts, retrofitting tests).

- **Frank's day-1 scope-review catches are worth slowing down for.** The TOC-jump imperative-handle requirement (Frank P2) would have caused a silent QA-time regression with no test coverage if I'd gone straight to implementation. "Scope check → Frank review → implement" caught it before code went into a PR. Similar shape to prior Frank P1/P2 catches — he reliably spots the contract-preservation issue when an internal API changes shape.

- **Self-adversarial review BEFORE merge is high-leverage.** PR #193's first commit had the `readOnly` remount bug + the in-fence decoration false-positive. Both were P1s that would have shipped with the merge if I'd accepted Frank's "no blocking issues" verdict at face value. **Heuristic:** after any non-trivial PR with passing CI + clean external review, do a 15-min adversarial pass before merging. Scan for: (a) state machines that re-mount on prop change, (b) regex/parser pairs that should agree on the same semantics, (c) API contract changes that silently break consumers.

- **`Closes the X of #N` is a useful auto-close workaround.** Empirically confirmed today: words between `Closes` and `#N` break GitHub's parser, leaving the issue OPEN despite the human-readable framing. Better than `Tracks #N` when "Closes" reads more accurately. Memorized.

- **CM6 controlled-component bridge pattern.** The standard idiom — dispatch only when `view.state.doc.toString() !== value` — is sufficient under React 18+ auto-batching. The race condition I worried about during scope check (parent re-render with stale value) doesn't reproduce in practice because state updates flush before effects run.

- **Per-instance `Compartment` for prop-driven extensions.** `Compartment` + `useRef` + reconfigure effect is the right pattern for any CM6 extension whose value is a prop (`readOnly`, language, theme, line-numbering toggle, etc.). Putting the prop directly in the extensions `useMemo` deps causes a full remount — destroying undo history and cursor state.

- **Plan-as-source-of-truth: D-NNN versioning lets findings supersede assumptions cleanly.** D-007 superseded D-005's implementation-cost framing without invalidating D-005's classification. The "supersedes in part" header annotation + in-line update note in D-005's body lets a reader landing on either decision get the current picture.

**Next Steps (Day 2 of June 9 critical path, 2026-05-29):**

1. **Arabic content escalation** — Seth sends the drafted message to Elsy + Tim. Longest-lead-time dependency. First thing.
2. **Read `bt-servant-worker/tests/`** to ground the worker#191 e2e test estimate. Determine whether an e2e harness exists or needs scaffolding.
3. **Open worker#191 e2e test PR** — dummy "5-year-old English" language doc, assert Claude response style materially changes. Closes worker#191's last AC.
4. **Browser smoke of CM6 on staging** — Seth/Frank manually verify before declaring #77 visual half + #167 fully validated end-to-end.
5. **PR #191 nudge** — if Frank hasn't reviewed by morning, ping.
6. **Stream A.2 continuation** — CM6 polish (edge cases on large docs, dark-mode rendering quality, accessibility of the contenteditable surface).
7. **#215 Path B Zulip draft** — Seth's send still pending.

### 2026-05-27 (late-evening) — Tuning project plan locked + cross-repo coordination scaffold

**Context entering the session:** Earlier EOD wrapped #166 + the post-EOD Ian Zulip update unblocking cross-repo work. Late-evening session opened with a question about June 9 demo feasibility under the new cross-repo authorization, then expanded into full project scoping + plan-as-source-of-truth coordination work.

**Completed:**

- **Tuning project plan committed + merged.** `docs/tuning-project-plan.md` (PR #190 merged at `54678c7`). Source-of-truth coordination document covering scope (51 issues across 4 repos), June 9 demo critical path, parallel-track structure (6 tracks A–G), operating model, quality gates, risk register, and a decision log (D-001 through D-006). Three Frank review rounds: rev 1 → rev 2 with P1 worker#191 reclassification → rev 3 cleanup-pass on stale section + portal#72 status + Day-12 typo.

- **Three sibling-repo EPICs filed.** worker#239 (Tuning Architecture — worker side), web-client#39 (Identity Bridge consumers), baruch#19 (Language Tuning Integration). Each links back to portal EPICs + the plan doc.

- **51 tuning issues cross-linked.** Comment on every in-scope issue across 4 repos pointing at the plan doc, the parent EPIC in its own repo, the plan track (A–G), and any companion EPIC in sibling repos. Comments not body edits (per [[feedback_gh_closes_keyword]]). Bulk-scripted via `cross-link-issues.sh`.

- **5 portal EPIC umbrella headers added.** Body-prepend on #72, #149, #153, #170, #171 with a quoted header pointing at the plan + cross-repo siblings. First pass had a separator-merge bug (`---## Overview` instead of `---\n\n## Overview`) caused by bash `$(...)` stripping trailing newlines; fixed with a Python re.sub pass.

- **CodeMirror 6 decision locked for #77 / #167.** Three parallel deep-dive research agents (Ian decision-pattern profile from 40+ commits across 5 repos, #77 issue evidence pass, MarkdownEditor stopgap feasibility analysis) converged on CM6 over DIY mirror-div. Key piece of evidence: **70% rewrite cost on the stopgap when CM6 eventually lands** violates Ian's stopgap pattern (named, scoped, recovery-path-clear). Captured as D-001 with day-1 scope-gate mitigation to fall back to DIY if CM6 isn't tractable in 1 day.

- **Frank P1: worker#191 was on the wrong track.** Original plan classified worker#191 under Track B (cascade architecture). Frank verified against portal#72 fifth Goal which calls worker#191 "the remaining DoD-blocker for 'a user typing #spoken @arabic gets responses shaped by both files.'" Without it, the demo trigger parses, mode applies, but the arabic-language tuning document **does not flow into the system prompt**. Plan revision 2 moved worker#191 to Track A.1 (demo PROMISE enabler); #77/#167 became Track A.2 (demo POLISH enabler). Both streams run in parallel since they touch different repos. Captured as D-005.

- **Local main checkout synced.** Was 8 commits behind origin/main; pulled to `a75e57f` (and now `54678c7` post-#190-merge). `.husky/pre-commit` mode-flip drift (chmod via husky `prepare`) discarded. `.understand-anything/` is now in origin's `.gitignore` so it's auto-ignored.

- **bt-servant-web-client + baruch repos cloned** to `/workspace/`. Both up to date on main. Now have working checkouts of every repo the tuning project touches.

**In Progress:**

- None code-wise. Plan is locked; sibling-EPIC scaffold is in place; cross-link graph is fully wired. Day 1 of the June 9 critical path opens tomorrow.

**Blockers / Carryover:**

- **Day 1 verification tasks** (tomorrow): (a) spoken + arabic content readiness in uW; (b) read chat-time system-prompt assembly to confirm whether arabic language content is already injected somewhere (sanity check before implementing worker#191); (c) ping Chris (Klappy) on the worker#191 architecture coordination note; (d) CM6 day-1 scope gate.
- **Ian still on vacation.** Cross-repo authorization in effect (D-003). #172 (cascade storage) + #177 (identity bridge protocol) still design-gated on Ian's return.
- **Tim's modes-cascade reply** still outstanding (carryover from 2026-05-21). Gates Track B detail-scoping; not demo-critical.
- **#215 Path B Zulip draft** still unsent. Awaiting Seth's send to Tim/Christou/Elsy before that rollout can start.
- **Stray untracked file** `src/components/org-context-selector 2.tsx` in main checkout. macOS-style duplicate, unrelated to today's work. Worth clean-up but not urgent.

**Patterns / decisions captured this session:**

- **Three-agent parallel research pattern for high-stakes decisions when the gatekeeper is unavailable.** Today's Ian-on-vacation editor-library decision used: (1) issue + library deep-dive agent, (2) technical feasibility agent on the stopgap path, (3) decision-pattern profile agent reading the gatekeeper's actual commits across multiple repos. Converged evidence beats single-agent inference; the profile agent in particular caught Ian's "stopgaps need named recovery paths" pattern which was the load-bearing argument against DIY. Worth re-using for any future Ian-/Tim-/Christou-gated decision where waiting isn't viable.
- **Plan-as-source-of-truth pattern (D-004).** Source-of-truth coordination doc with decision log (D-NNN refs), bottleneck split (demo-critical vs post-demo), parallel-track structure (independent streams that can run concurrently), and explicit cross-link discipline (every issue knows its plan track, every EPIC knows its sibling EPICs). Makes parallel agentic work tractable; without it, each new agent re-derives the strategic picture. Worth keeping for any future multi-repo coordination of this scale.
- **Bottleneck-split discipline.** Frank P2 surfaced that the original bottleneck ranking (Tim cascade reply, identity bridge, governance) was strategically-ordered but wrong for the June 9 demo specifically — content readiness + worker#191 + CM6 scope were the actual demo-blocking items, ranked further down. Lesson: a single ranked list of bottlenecks across timeframes makes people optimize the wrong queue. Split by horizon explicitly. Captured as the demo-vs-post-demo bisection in the plan.
- **Frank's P1 strategic miss on the original plan was 100% correct.** The CM6 recommendation framing risked making editor polish look like the demo path while runtime language-file injection remained the actual blocker. Without his catch, Day 1–7 work would have gone to editor migration while the demo's stated promise (`#spoken @arabic` shaped by **both** files) sat unimplemented. Worth remembering as a pattern: when the immediate decision feels obvious, audit whether you've correctly identified what's load-bearing for the deadline.
- **Body-edit separator pitfall.** Bash `$(...)` strips trailing newlines. When prepending a `---` separator header to existing body content, the result is `---## Overview` not `---\n\n## Overview`. Use explicit newline injection or Python re.sub for the join. Caught immediately on first portal-EPIC-body update and fixed across all 5.
- **70%-rewrite-cost on a stopgap is the right discriminator for stopgap-vs-do-it-right.** Not "is the stopgap faster" (obviously yes), but "what fraction of the stopgap survives the eventual replacement." If it's <50%, the stopgap is a write-off; if it's >70%, the principled choice is probably right. Captured in D-001's rationale.

**Next Steps (Day 1 of June 9 critical path, 2026-05-28):**

1. **Verify uW spoken mode + arabic language content readiness.** ~30 min smoke check in the portal. If thin, escalate to Elsy/Tim same day.
2. **Read worker chat-time system-prompt assembly.** Sanity check: is arabic language content ALREADY injected somewhere via another path? If yes, scope of worker#191 changes. ~30 min.
3. **Ping Chris (Klappy) on worker#191 architecture note** ("Ian and Chris are pairing on the architecture"). Coordination ask; not a blocker per D-003.
4. **CM6 day-1 scope check.** Setup `@codemirror/lang-markdown` + decoration extension + `useActiveHeadingLine` port concept. If tractable in 1 day, proceed with CM6. If not, fall back to DIY mirror-div per D-001 mitigation.
5. **Implement worker#191** (quick-and-dirty per issue body) starting same day as the CM6 scope check, in parallel.
6. **#215 Path B Zulip draft** — Seth's send to Tim/Christou/Elsy when ready.

### 2026-05-27 — #166 cross-org config end-to-end (2 PRs in one day, one Frank round each)

**Post-EOD update — Ian unblocks cross-repo work (Zulip, late afternoon):**

Ian replied to the long-running cross-repo coordination question while on vacation: _"I also think this is a great opportunity for you and your bots to venture into the other repos. I don't want to be a blocker for anything above. Feel free to knock out all of the created issues regardless of the repo."_ Seth: _"glad to have your blessing!"_

**Operational implications:**

- **Supersedes the admin-portal-only scope** that's been in force since 2026-05-11 ([[feedback_scope_admin_portal_only]] now flagged SUPERSEDED; new [[project_cross_repo_authorization]] memory captures the current rule and the open questions).
- **Sibling-repo PRs become actionable directly,** not just file-and-wait:
  - bt-servant-worker#191 (gates Epic #72's fifth Goal — dynamic language-file loading).
  - bt-servant-worker#215 (gates portal #125 Phase 2) — verify portal#125 state first since it's already CLOSED.
  - The cross-repo companions filed 2026-05-21: bt-servant-worker#236 chain resolution, bt-servant-web-client#36/#37/#38 identity-bridge consumers, baruch#18 language pre-fill.
  - Worker-side execution downstream of portal#172 / #177 once those upstream design calls land — Ian still owns the design decisions ("storage backend" + "identity bridge protocol"), but the downstream sibling-repo work is now Seth's option in either repo.
  - (Portal #143 — `isSuperAdmin` redaction follow-up — was already in scope under the prior rule, just deprioritized. Worker #143 is a different issue, "Cross-org mode availability," which is in the cross-link batch.)
- **Today's 8-comment cross-link batch gets re-shaped.** Comments that were advisory ("recommend move," "file portal companion") can now be action-oriented: file the PR or open the companion, then comment with the link. Lower friction; faster resolution.
- **Open questions flagged for clarification before exercising the new authority:**
  - Merge authority on sibling-repo PRs — does the "ask before merge" rule from admin-portal carry over, or is autonomy implied? Default: ask, until I learn each repo's norms.
  - Frank / Codex coverage — is the bot configured to review PRs on worker / web-client / baruch? Check before opening the first sibling-repo PR.

Tomorrow's priority list above (#143, README docs PR, cross-link batch) now sits inside the new authority — same items, but the sibling-repo subset is no longer gated on Ian.

**Context entering the session:** Six-day dormancy since 2026-05-21 EOD. SOD opened with two stale tracker PRs (#145, #165) sitting green and unmerged, super-admin feature still soaking on staging, and Ian "out this week" per the 2026-05-21 notes. Recommended tuning-priority next task was #166 (super-admin cross-org config) per the issue body's explicit "prerequisite for #149/#153 meta-tuning" framing.

**Completed:**

- **Merged #145 + #165 (stale tracker PRs).** #165 conflicted with main after #145 went in (both touch `docs/progress_tracker.md`); rebase-onto-origin-main + drop-the-duplicate `8852cce` cleanly replayed the three 2026-05-21 commits onto main. Force-push (with lease) + `--auto` merge. Both landed: `84b625a`, `fdd31f9`.

- **#166 PR A — worker side (`worker/config.ts`).** Filed at issue body's three named touchpoints. New `resolveOrg(request, session)` helper accepts `?org=<slug>` on every `/api/config/*` endpoint:
  - Super-admin only; non-super callers get a loud `403 Cross-org config access requires isSuperAdmin` rather than a silent fallback (loud-over-silent-drop, same principle as #138/#141).
  - Shape validation rejects empty / whitespace-only / path-traversal (`/`) values with 400 even for super admins (worker is the only enforcement point under the trusted-portal model).
  - Absent param → byte-for-byte identical to legacy same-org path. Same-org regression test pins this.
  - Language-rights carve-out: `hasLanguageRights` skipped when cross-org, because rights are scoped to the caller's home org and don't translate to a foreign namespace; super-admin already trumps shepherd permissions by design.
  - 15 new tests under "Cross-org via ?org= (#166)" in `tests/config-authz.test.ts`.
  - PR #185 opened; Frank round 1 caught a **P2 self-referential bypass**: `crossOrg: true` was set whenever the param was present, so a restricted-shepherd super admin could bypass their own org's `language_rights` by adding `?org=<their_own_org>`. Fix in `cbe6a7d`: `crossOrg: trimmed !== session.org` — only true when the resolved target genuinely differs from the caller's home org. +2 regression tests pin both branches (own-org + restricted rights → 403, own-org + matching rights → 200 same-org proxy). Frank re-review clean.
  - Merged at `6c3b720`.

- **#166 PR B — UI side.** 20 files across the initial commit + the P1 fix commit (initial: 18; fix added 5 with 3 overlapping), threads cross-org context through the three named pages and the API/hook layers:
  - `src/lib/config-url.ts` (new) — `buildConfigUrl(path, org)` helper. Empty/whitespace dropped silently; trim parity with the worker's `resolveOrg`.
  - All 11 API helpers (`config-api.ts`, `languages-api.ts`, `language-scaffold-api.ts`) gained a trailing optional `org?: string | null` param. Per-user endpoints (`user-mode`, `user-memory`) threaded for parity though no UI consumes them yet.
  - Hooks (`use-prompt-config`, `use-languages`, `use-language-scaffold`) accept the param and include it in TanStack Query keys so org-A and org-B caches don't collide. `null` and `undefined` normalize to the same key.
  - `useUiStore.contextOrg` — new `string | null` slice. Default null = home org. `setContextOrg` clears `selectedMode` + `selectedLanguage` on a real change (so org-A state can't bleed into org-B fetches), no-ops on redundant ticks, cleared by `reset()` on logout.
  - `<OrgContextSelector>` component — renders home org + every other org with ≥1 user (derived from `useAdminUsers`, gated on `callerIsSuperAdmin` so org admins don't pay a wasted fetch). Bridges Radix Select's no-empty-string rule with the store's `null = home` model via `HOME_ORG_SENTINEL`. Returns null for non-super sessions.
  - `languages.tsx` carve-out: when `isCrossOrg`, `effectiveRights = "*"` so the page filter, the `hasAccess` gate, and the stale-selection guard don't block a super-admin with restricted same-org shepherd rights from operating on another org's languages. Mirrors the worker carve-out exactly.
  - `vitest.config.ts`: mirrored the `@` → `./src` alias from `vite.config.ts`. Test pool didn't need it before because the only `@/` imports in src/lib were type-only (erased before runtime); first sibling-lib _value_ import (config-api → config-url) surfaced the gap.
  - 31 new tests across `tests/config-url.test.ts` (new), `tests/config-api.test.ts` (+10), `tests/languages-api.test.ts` (+6 including a `LanguageForbiddenError` regression check pinning that 403 under cross-org still surfaces as the typed error), `tests/language-scaffold-api.test.ts` (+2), and `tests/ui-store.test.ts` (new, polyfills `localStorage` since the workers test pool doesn't ship one).
  - PR #186 opened; Frank round 1 caught a **P1 dirty-edit bypass**: the OrgContextSelector called `setContextOrg` directly on change, the store cleared `selectedMode`/`selectedLanguage` unconditionally, so a super-admin mid-edit could lose their draft with no confirmation — the existing `useBlocker` (routes) and `pendingSwitch` (per-page selectors) guards never fired on the new selector. Fix in `afac7ff`: selector gained an optional `onRequestChange?: (next: string | null) => void` prop; Modes + Languages wire a handler that routes through a new pure helper `decideContextChange(current, next, isDirty, isSaving)` returning `"no-op" | "apply" | "confirm"`. On confirm the page opens an AlertDialog mirroring the existing `pendingSwitch` UX. Prompt Overrides has no draft state → leaves the prop undefined, selector falls through to direct-set. `pendingContextOrg` wrapped as `{ value: T | null } | null` to distinguish "no pending" (outer null) from "pending switch to home org" (`{ value: null }`). +10 tests in `tests/context-org-guard.test.ts` pin the helper contract — every direction (home↔other, other→other), the dirty AND saving overlap, and the no-op-on-current-value rule (so a redundant Radix Select tick can't prompt). Frank re-review clean (no blockers).
  - Merged at `0103dcc`.

- **Cross-link plan review (advisory).** User shared a draft plan for posting 8 cross-link comments across portal + worker repos. Eyeballed against verified portal-side state: confirmed portal#28, #149, #154, #170, #184 all open; confirmed portal#125 **CLOSED 2026-05-13** (separate finding was correct — worker #215 has stale info). Suggested four rewordings before posting: (1) frame #94/#154 as a reconciliation question, not a "subsumes" claim, to leave Ian space to agree or push back; (2) verify #191↔#236 relationship before "v1/v2" labeling — the progress tracker shows #236 was filed as a companion to portal#172, not as a successor to #191; (3) link #143 → #184 (the sub-issue), reference EPIC #149 inline rather than as a parallel top-level link; (4) for #141/#140 "recommend move," file the portal-side companions yourself first (per [[feedback_scope_admin_portal_only]] that's Seth's lane) and convert the comment from "you should move this" into "filed portal#XXX as the actual home." Plus: portal#125/#215 finding deserves a quick portal-side check before commenting, to make the comment precise rather than speculative. User has the revised plan; not yet posted.

**Day rollup:**

| Merged | Commit    | Closes |
| ------ | --------- | ------ |
| #145   | `84b625a` | —      |
| #165   | `fdd31f9` | —      |
| #185   | `6c3b720` | —      |
| #186   | `0103dcc` | #166   |

**4 PRs merged in one day, 1 issue auto-closed (#166), super-admin cross-org config feature shipped end-to-end to staging in a single session (worker + UI), 58 new tests (193 → 251; #185 +17, #186 +41), 2 Frank review rounds — both caught real bugs (P2 self-referential bypass, P1 unsaved-edit bypass) — both fixed in <30 min cycles.**

**In Progress:**

- None code-wise. Staging is now 8 commits ahead of last prod deploy (`25ea9c1` → `0103dcc`). #138 and #166 features both soaking on staging.

**Blockers / Carryover:**

- **bt-servant-worker#215** — still gates portal #125 Phase 2. **Open question raised today** in the cross-link review: portal#125 is CLOSED (auto-close re-fired at some point between 2026-05-11 reopen and 2026-05-13), so #215's body assumption that portal Phase 2 is pending may be stale. Worth a portal-side state check before opening the #215 PR.
- **bt-servant-worker#191** — still gates Epic #72's fifth Goal (dynamic language-file loading). Possibly relates to portal#170's cascade architecture; uncertain whether #191 is a v1 to #236's v2 or a different layer entirely (file loading vs override resolution). Cross-link review surfaced this; needs body inspection before posting.
- **#77** — still paused on Ian's editor-library decision (CodeMirror 6 tentative).
- **#117** — chat-stream user_id ownership; awaiting design call.
- **#143 (worker-side `isSuperAdmin` redaction)** — still on the queue. Small (~30-min PR, defense-in-depth follow-up to PR #142 P2).
- **README docs PR** — CF dashboard KV-edit bootstrap path. Tiny. Still on the queue.
- **Super-admin + cross-org config features** — both soaking on staging. Prod promotion gated on Elsy's comfort signal.
- **Tim's modes-cascade reply** — still outstanding per [[project_meta_tuning_design]]. Gates #149/#152 detail-scoping.
- **Ian on identity bridge (#177) + cascade storage (#172)** — Ian was "out this week" as of 2026-05-21; status unconfirmed today. Gate 8+ downstream issues across 3 repos.

**Patterns / decisions captured today:**

- **Test-pool alias gap was latent until the first sibling-lib value import.** The vitest cloudflare workers pool didn't resolve `@/` for runtime imports; it had been silently working because every `@/...` in `src/lib/*.ts` was a _type-only_ import (erased at compile time). Mirroring the alias from `vite.config.ts` into `vitest.config.ts` was the right fix; the alternative (switch new file to relative imports) would have introduced an inconsistency. Worth noting for any future test-pool surprises — the pool runs in its own resolver context.
- **Two-PR worker/UI split is now a pattern.** #138 used it; #166 used it again. PR A locks the wire contract, PR B consumes it. Each PR small enough to review in one sitting; the worker-side contract gets tested separately from the UI; ordering risk is bounded (worker can't break UI because UI is a follow-on). Worth keeping for any future cross-stack feature with both layers.
- **Self-referential override bypass is a real class of bug.** Frank's P2 on PR A was caused by treating "param present" as semantically equivalent to "cross-org." The right discriminator is "resolved target differs from session.org." Generalizes: any optional override parameter that lifts a same-org gate must check resolved-vs-current, not just presence. Same shape as the modes-cascade design discussion's storage-vs-presentation distinction — easy to conflate.
- **Dirty-edit bypass when adding a new orthogonal selector.** Frank's P1 on PR B: the existing `pendingSwitch` (mode/language selector) and `useBlocker` (route change) guards covered every dirty-edit path in the codebase before #166. The new OrgContextSelector introduced a _third_ path that none of the existing guards saw. Lesson: when adding a selector that mutates state the dirty-flow depends on, audit every existing dirty-guard and either extend it or add a parallel one. The extracted `decideContextChange` pure helper makes the contract testable in the absence of RTL.
- **Tracker-PR conflict resolution via rebase-onto-origin-main + drop-duplicate.** #165's branch carried its own copy of #145's content as the base commit (`8852cce`), so once #145 merged, the duplicate had to be skipped. `git rebase --onto origin/main 8852cce` cleanly replayed the three new commits without merge conflicts. Worth remembering for stacked docs PRs that share a base.
- **Frank review cycles stayed tight today.** P2 on PR A: finding → fix → push → re-review → approval inside ~20 minutes. P1 on PR B: ~30 minutes. The pattern from #138's day still holds — clear evidence + verification path in Frank's findings makes the fix obvious; reply with code references + regression-test names; no back-and-forth needed.
- **Cross-link advisory work is high-leverage, low-blast-radius.** Reviewing the user's 8-comment plan caught one stale assumption (portal#125 closed) and four phrasing/sequencing improvements before the team-visible comments went out. ~10 minutes of work saved a potential round of "wait, actually..." follow-ups across two repos.

**Next Steps:**

1. **Verify portal#125 / worker #215 state** — check whether the Prompt Overrides page is actually deleted from the portal; if it is, worker #215 may be moot or post-shippable; if it isn't, #125 has a third life-cycle moment to account for. Then post the revised #215 comment with precise wording.
2. **Cross-link comments on worker repo (8 issues)** — apply the four rewordings from today's advisory review, then post in one batch.
3. **#143 worker-side `isSuperAdmin` redaction** — still the smallest, highest-signal next code task (~30-min PR).
4. **README docs PR** — CF dashboard KV-edit bootstrap path. Tiny.
5. **Prod promotion of #138 + #166** — once Elsy confirms comfort.
6. **Pioneers demo prep** — BSOK org + Calvin user with starter modes (still pending Elsy/Bincy date confirmation).
7. **Ian return (if back next week)** — lock #177 (identity bridge protocol) and #172 (cascade storage backend). Unblocks 8+ downstream issues.

### 2026-05-21 (evening) — Cascade-vs-fork design lock + epic-shaped issue filing batch

**Context:** Continuation of the late-afternoon Zulip conversation with Tim. Started with the inheritance-mechanism question open; ended with the design locked and 19 portal issues + 6 cross-repo companions filed.

**Design conversation outcome — cascade-via-overrides locked:**

Tim initially defended pure-fork v1 ("It is relatively easy to show a diff between original and forked copy... merge any aspect of the diff into the current fork"). Seth pushed back on the migration concern: cascade → fork later is trivial (materialize inherited sections); fork → cascade later requires per-org reconciliation. Drafted a convergent path — **storage-cascade + UI-fork-with-diff** — and Tim then pivoted on his own to overrides ("one config per language... permit any org to create their own custom overrides instead of forking the entire thing... supersedes the official language config where they conflict and augments it where they do not conflict"). Same model, different framing.

Two remaining variables locked after Tim's follow-up:

- **Override granularity:** both supported — lexical (word-level, primary use) and section-level (markdown heading boundaries, "good selling point" per Tim).
- **System-level variants:** chained overrides with `parent:` pointers, not parallel documents. DCV is an override layer pointing at the Hindi base. Generic stacking — other variants follow the same pattern.

**Filed in admin-portal (13 net new):**

Two new epics:

|          |                                                  |                         |
| -------- | ------------------------------------------------ | ----------------------- |
| **#170** | [EPIC] Language Cascade Override Architecture    | Locked design captured  |
| **#171** | [EPIC] Identity Bridge — Admin Portal ↔ Chat App | Tim's verbal greenlight |

Five sub-issues for #170 (#172–#176): storage model + chained-override schema, override authoring UI (lexical + section), diff view + selective re-inherit UI, worker-side resolution at chat time (cross-repo tracking), curator-update notification UX.

Four sub-issues for #171 (#177–#180): identity unification design (Option A/B/C), session/auth bridging, role + org propagation, welcome flow with cross-org recommended modes.

Two missing #153 sub-issues filled (#181, #182): verb-based permissions (edit vs publish per resource — blocks #156); audit log for non-content events.

Two standalone (#183, #184): per-language and per-mode curator role definition; read-only cross-org browse of published modes and languages.

**Filed in sibling repos (6 cross-repo companions):**

|                          |                                                 |                                   |
| ------------------------ | ----------------------------------------------- | --------------------------------- |
| bt-servant-worker#236    | Language-override chain resolution at chat time | Blocked by admin-portal#172       |
| bt-servant-worker#237    | Append-only audit log storage + query API       | Not structurally blocked          |
| bt-servant-web-client#36 | NextAuth bridge to portal identity              | Blocked by admin-portal#177       |
| bt-servant-web-client#37 | Consume portal identity envelope (role + org)   | Blocked by admin-portal#177, #178 |
| bt-servant-web-client#38 | Welcome flow with recommended modes             | Blocked by admin-portal#177, #180 |
| baruch#18                | Language-tuning pre-fill assistant              | Not structurally blocked          |

Each companion includes an explicit "Blocked by" section. Bidirectional links: comments posted on the portal-side issues pointing at the companions.

**Epic-body updates (4):** #149 (added languages-vs-modes mechanism distinction + open question on whether modes also cascade); #153 (added #181 + #182 to task list, flagged "Draft test mode" as scope-TBD); #170 + #171 (replaced placeholder TBDs with actual sub-issue numbers).

**Earlier in the day (rolled forward to evening):** Four issues filed earlier this afternoon also remain open and on the queue:

- #166 super-admin cross-org config-edit gap (`worker/config.ts:94`) — surfaced in Tim's Zoom; promotable
- #167 markdown editor syntax highlighting (Tim's first ask in the demo)
- #168 Baruch language pre-fill (with the new baruch#18 companion)
- #169 [Design] org-prefixed mode slug convention for cross-org modes

**Blockers (gating new work):**

| Prerequisite                                                                                 | Gated on                                                                                                            |
| -------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------- |
| **#177** identity bridge design (Option A/B/C)                                               | Ian (out this week). Seth's #serving-our-customers write-up has Ian's thumbs-up; protocol choice not yet documented |
| **#172** storage backend decision (sentinel slug in `ORG_CONFIG` vs. new `SYSTEM_CONFIG` KV) | Ian                                                                                                                 |
| **Tim's modes-cascade answer**                                                               | Tim. Affects whether #149 gets re-scoped to mirror #170                                                             |
| **bt-servant-worker#215**                                                                    | Ian. Still gates portal #125 Phase 2 (carryover from prior days)                                                    |
| **bt-servant-worker#191**                                                                    | Ian. Still gates Epic #72's fifth Goal                                                                              |

**Patterns / decisions captured today:**

- **First-pass design framings get falsified fast when both sides engage honestly.** Tim initially advocated pure-fork; Seth pushed back; Tim pivoted to overrides on his own within 30 minutes of dialogue. The convergent model (cascade-via-overrides) is better than either starting position. Worth noting how quickly a "team disagreement" can resolve when both parties are actually thinking, not anchoring.
- **Storage shape ≠ UI presentation.** Tim wanted simple presentation (one document the user owns); Seth wanted cascade storage (no migration trap). Both achievable — storage is per-section overrides with `parent:` pointers; UI is one merged document with a diff view. Worth remembering for future similar design tensions.
- **Cross-repo companion issues with explicit "Blocked by" sections** make the dependency graph readable from either side. Pattern worth keeping. Each companion has bidirectional back-link.
- **Tim is the product/design authority but doesn't claim infallibility.** His pivot from fork to overrides on his own (in response to a constructive challenge) is the same posture as Seth's "first-pass framing is allowed to be wrong, but should be owned directly when falsified" earlier today. Healthy team dynamic.

**Next Steps:**

1. **When Ian's back (next week):** lock #177 (identity bridge protocol choice) and #172 (storage backend decision). These unblock 8+ downstream issues across 3 repos.
2. **When Tim's response on modes-cascade arrives:** decide whether to re-scope #149 to mirror #170 or keep modes as copy-on-import.
3. **#143 worker-side `isSuperAdmin` redaction** — still on the queue from 2026-05-20; small, well-scoped, defense-in-depth follow-up.
4. **README docs PR** — CF dashboard KV-edit bootstrap path. Tiny.
5. **Pioneers demo prep** — BSOK org + Calvin user with starter modes. Config task, no issue needed. Date specifics pending Elsy/Bincy confirmation.
6. **PRs #145 and #165 (today's two stacked tracker PRs)** — both clean and unmerged. Worth a nudge.

### 2026-05-21 (late afternoon) — Tim/Elsy/Seth/Klappy Zoom + design reconciliation

**Context:** Seth joined a previously-scheduled Tim/Elsy demo walkthrough. Conversation pivoted into the shared-library / cross-org tuning design — the same territory Seth was sketching against earlier in the day with the "supermode" question. Chris Klapp also weighed in.

**Locked in this session:**

- **Two-altitude shared-library architecture** confirmed by Tim. System level holds curator-tuned modes and languages; org level adapts. Multiple system-level variants per language can coexist (Hindi base + Hindi-DCV at the same altitude).
- **Per-language curator role** confirmed — trusted individual or working group per language, write-access granted out-of-band (Zoom call) rather than self-service. Read-only cross-org browse is a primary feature.
- **Inline alternatives via comment syntax** (Bluebird Network ask) — `%%`/`++…++` per [[project_ulysses_comment_syntax]] is exactly the mechanism. Re-cast portal #77 from "editor nicety" to "core feature for shared-library alternatives."
- **Org-prefixed slugs** when modes cross orgs (`#YWAM-OBT`, `#spoken-OBT`). New convention to introduce.
- **Identity bridge admin-portal ↔ chat-app — greenlit by Tim.** Seth's prior write-up (in #serving-our-customers, thumbs-up'd by Ian) has Tim's verbal go-ahead: "I would just signal intent." Obsoletes most of the Elsy Discord reply draft from earlier today.
- **Word Collective visibility for super-admins** — Tim surprised Elsy can't see Word Collective. Underlying cause is the `worker/config.ts:94` `session.org` binding identified yesterday. Promotable from follow-up to actual priority.

**Already filed by Elsy this morning (validated by Tim in meeting):**

|          |                                           |                                                                                                                                                               |
| -------- | ----------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **#149** | EPIC — Mode Library & Cross-Org Templates | + sub-issues #150 (org metadata), #151 (copy-on-import + provenance), #152 (uW-curated namespace + curator workflow)                                          |
| **#153** | EPIC — Governance & Versioning            | + #156 (revision states draft/pending_review/published) + worker-side versioning, optimistic concurrency, verb-based permissions, audit log, diff/timeline UI |
| **#161** | EPIC — Operational Reliability            | Carry forward, not directly discussed                                                                                                                         |

Task breakdowns were AI-drafted by Elsy (Tim noted this on call). Need critical-review pass before treating as authoritative — Tim approved substance, not breakdown details.

**Open design question — sent to team, awaiting reply:**

- **Inheritance mechanism: pure-fork (Tim's in-meeting framing) vs. cascade-with-section-granularity (Seth's preference).** Pure fork severs orgs from future curator work as forks accumulate, eroding Tim's "everyone benefits" promise. Cascade preserves that promise by inheriting blank sections from upstream while letting orgs override per section. Tagged Ian, Klappy, Tim, Elsy, Bincy. Several OOO. Holding detailed task breakdowns under #149/#153 until this lands — the breakdowns differ materially. See [[project_meta_tuning_design]] memory for full context.

**Patterns / decisions captured:**

- **Pure fork vs. cascade trade-off is real and worth resolving before code.** Pure fork is simpler to explain and avoids upstream surprises but accumulates drift; cascade preserves curator value across the lifetime of all orgs but adds per-section complexity. Refactoring fork→cascade later is non-trivial; getting it right at v1 matters.
- **AI-drafted epics need explicit critical review.** Tim approved Elsy's epics on substance but didn't audit the task breakdown. Going to code without a review pass risks shipping the AI's structure rather than the intended one.

**Updated Next Steps (supersedes earlier in the day):**

1. **Wait for team on cascade vs. fork** before detail-scoping #149/#152.
2. **Start identity-bridge work** (Seth's prior write-up) — greenlit by Tim in the meeting; no further confirmation needed.
3. **Close `worker/config.ts:94` cross-org config gap** — known limitation Tim is now aware of; was previously yesterday's follow-up #143-adjacent work. Promote.
4. **File the cascade-independent candidate issues** (org-prefixed slugs, editor syntax highlighting, Baruch language pre-fill) — coming as part of this EOD wrap.
5. **Critical-review pass on #149 + #153 sub-issues** — flag cascade-vs-fork sensitivity per task.
6. **Pioneers demo prep — BSOK org + Calvin user** with copies of Understand/Translate/Check modes for the June meeting. Date specifics to confirm with Elsy/Bincy.
7. **Elsy Discord reply** — slim to "we covered this in the 1pm Zoom, Seth has greenlight on the identity-bridge work" or let the thread close itself.

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
