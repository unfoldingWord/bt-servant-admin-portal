# BT Servant — Tuning Project Plan

> Source-of-truth coordination document for the **response-tuning** workstream across the BT Servant repo family. Drives parallel execution across portal, worker, web-client, and baruch. Updated as decisions land; the index of decisions is intentional history, not churn.

## Status

| Field                               | Value                                                                        |
| ----------------------------------- | ---------------------------------------------------------------------------- |
| **Plan opened**                     | 2026-05-27                                                                   |
| **Phase**                           | Active development under cross-repo authorization (Ian, 2026-05-27 Zulip)    |
| **Hard demo deadline**              | **2026-06-09** — `#spoken @arabic` end-to-end with the new editor            |
| **Strategic deliverable**           | BT Servant Q2 2026 — Modes & Tuning (per Notion roadmap)                     |
| **Repos in scope**                  | bt-servant-admin-portal · bt-servant-worker · bt-servant-web-client · baruch |
| **Open tuning issues (2026-05-27)** | ~51 across 4 repos                                                           |
| **EPIC count (formal + implicit)**  | 5 portal + 3 sibling-repo umbrellas to file                                  |
| **Last revised**                    | 2026-05-27                                                                   |

## Strategic Context

This work delivers **two of the four Q2 2026 deliverables** from the BT Servant roadmap:

1. **Operational modes** (Spoken, uW, FIA — at least 3) — `#149` Mode Library & Cross-Org Templates is the portal-side enabler; worker-side has the trigger parsing + resolution
2. **Per-language response tuning** (3 languages minimum — Hindi, Arabic, possibly Nepali) — `#170` Language Cascade Override Architecture is the portal-side enabler; worker-side resolution lands via worker#236

Plus three architecture pieces that make the above possible without becoming unmanageable later:

3. **Governance & versioning** (`#153`) — keeps modes/languages curated without losing the small-team agility
4. **Identity bridge** (`#171`) — connects portal-managed users + roles to the chat-app session, so per-user/per-org mode delivery is possible
5. **Cross-org config edits** (closed today as `#166`) — super-admin ergonomics so curators can operate across orgs without proxy

The June 9 demo is a **narrow vertical slice** through all of this: prove `#spoken @arabic` works in the portal's mode editor, in test-chat, end-to-end. Everything else extends from that proof.

## Scope

### Issue distribution (2026-05-27)

| Repo                    | In-scope open      | Out-of-scope (housekeeping, polish)                              |
| ----------------------- | ------------------ | ---------------------------------------------------------------- |
| bt-servant-admin-portal | 36 (incl. 5 EPICs) | 13 (#161 operational, #132 dark mode polish, others)             |
| bt-servant-worker       | 8                  | 72 (worker hardening; will surface tuning-coupling case-by-case) |
| bt-servant-web-client   | 3                  | 4 (PDF inline, audio chunks, localStorage migration, client_id)  |
| baruch                  | 4                  | 0 (entire repo is tuning-adjacent)                               |
| **Tuning total**        | **~51**            | —                                                                |

### EPIC structure

**Portal (existing):**

| #    | Title                                     | Status                                          |
| ---- | ----------------------------------------- | ----------------------------------------------- |
| #72  | Admin Portal Redesign for Response Tuning | ~95% done; only #77 left                        |
| #149 | Mode Library & Cross-Org Templates        | Sub-issues filed; cascade-decision-gated        |
| #153 | Governance & Versioning                   | Sub-issues filed; revision-state design pending |
| #170 | Language Cascade Override Architecture    | Design locked 2026-05-21; sub-issues #172–#176  |
| #171 | Identity Bridge — Admin Portal ↔ Chat App | Greenlit by Tim; protocol design pending        |

**Sibling-repo (to file):**

| Repo                  | Proposed EPIC title                     | Issues to link                                |
| --------------------- | --------------------------------------- | --------------------------------------------- |
| bt-servant-worker     | EPIC: Tuning Architecture — worker side | #94, #115, #137, #143, #191, #215, #236, #237 |
| bt-servant-web-client | EPIC: Identity Bridge consumers         | #36, #37, #38                                 |
| baruch                | EPIC: Language Tuning Integration       | #6, #10, #17, #18                             |

These are filed alongside this plan so cross-repo dependency tracking has explicit anchors.

## June 9 Demo — Critical Path

### Demo definition

When demoed on **2026-06-09**, the following must work end-to-end:

- A super-admin (Elsy, on her uW session) opens the portal's Modes page
- Selects the `spoken` published mode for uW
- The mode document is shown in the markdown editor with **visible syntax differentiation** (bold/headers/lists/code are distinct from raw markdown)
- She can save, publish, and the changes flow through
- She switches to the test-chat affordance
- Types `#spoken @arabic <translation question>`
- The trigger parses (worker#211/#212, already shipped 2026-05-11)
- Response is in arabic, with spoken-mode behavior
- Quality is **demo-worthy** — not stubs, real translation guidance

### Critical-path requirements

| Item                                | Status (2026-05-27)                     | Owner           |
| ----------------------------------- | --------------------------------------- | --------------- |
| Markdown editor with TOC + autosave | ✅ Shipped 2026-05-07 (#75, #76, #82)   | —               |
| Languages CRUD + scaffold           | ✅ Shipped 2026-05-08–11 (#74, #79)     | —               |
| Trigger parsing `#mode @lang`       | ✅ Shipped 2026-05-11 (worker#211/#212) | —               |
| Test-chat affordance                | ✅ Shipped 2026-05-11 (#81)             | —               |
| Super-admin cross-org config edits  | ✅ Shipped 2026-05-27 (#166)            | —               |
| **Syntax highlighting (#167)**      | ⚠ depends on #77 — decision below       | TBD             |
| **Spoken mode content for uW**      | ⚠ unverified — Day-1 task               | Seth + Elsy/Tim |
| **Arabic language content for uW**  | ⚠ unverified — Day-1 task               | Seth + Elsy/Tim |

### Day-by-day plan

| Day | Date       | Work                                                                                  | Decision gate                                                                  |
| --- | ---------- | ------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------ |
| 1   | 2026-05-28 | Verify spoken + arabic content readiness in uW. Day-1 CodeMirror 6 scope check.       | If CM6 day-1 scoping unclear after 1 day → fall back to DIY mirror-div overlay |
| 2   | 2026-05-29 | Begin #77 CM6 migration (or DIY fallback). Content gap-filling in parallel if needed. | —                                                                              |
| 3   | 2026-05-30 | CM6 editor swap + `@codemirror/lang-markdown` integration                             | —                                                                              |
| 4   | 2026-05-31 | `useActiveHeadingLine` port to CM6 transactions; dark-mode theming via CSS variables  | —                                                                              |
| 5   | 2026-06-01 | Integration on Modes + Languages pages; tests                                         | —                                                                              |
| 6   | 2026-06-02 | Polish, edge cases (large docs, Ulysses comments, code fences)                        | —                                                                              |
| 7   | 2026-06-03 | Frank review round + fix cycle                                                        | —                                                                              |
| 8   | 2026-06-04 | Ship #167 turn-key via CM6's syntax tokens. Land #187 (Export Config) if bandwidth    | —                                                                              |
| 9   | 2026-06-05 | Content polish in coordination with Elsy/Tim                                          | —                                                                              |
| 10  | 2026-06-06 | Demo dry run on staging. Capture any edge cases                                       | —                                                                              |
| 11  | 2026-06-07 | Fixes from dry-run findings                                                           | —                                                                              |
| 12  | 2026-06-08 | Final smoke test. Promote to prod if needed                                           | —                                                                              |
| 13  | 2026-06-09 | **Demo day**                                                                          | —                                                                              |

### Explicitly NOT in this 13-day window

- `#170` cascade architecture sub-issues (multi-week, scope-creep risk)
- `#171` identity bridge sub-issues (Ian-design-gated)
- `#149` mode library cross-org sub-issues (cascade-decision-gated)
- `#153` governance/versioning sub-issues (multi-week, design-gated)
- `#215` Path B rollout (separate 2-week plan in flight; not demo-visible)
- `#169` design-only issue (org-prefixed slug convention)
- `#188` Baruch + manual config UX merge (UX restructure, post-demo)

These are tracked in the broader plan below but explicitly held until after June 9.

## Decisions

### D-001 · #77 editor library: **CodeMirror 6** (2026-05-27)

**Decision:** Migrate the MarkdownEditor from plain textarea to **CodeMirror 6** with `@codemirror/lang-markdown`. Close #77 and unblock #167 in the same PR (or stacked PRs).

**Why not DIY mirror-div stopgap?** Throwaway analysis: ~70% of stopgap code rewrites when CM6 lands. Ian's stopgap pattern (per evidence-based profile from his prior PRs) requires a clean recovery path — stopgaps that get _replaced and deleted_ don't fit. The create-org-admin CLI is his canonical stopgap because it survives indefinitely as a recovery path. A DIY syntax highlighter wouldn't.

**Why CM6 specifically?**

- Principled long-term choice (per Ian's library-tolerance pattern)
- `@codemirror/lang-markdown` gives Tim's "basic syntax highlighting" demo ask turn-key
- Reusable across Modes, Languages, and any future editor surfaces
- 3–5 day realistic implementation (Agent estimates: 1–2 days optimistic, 5–7 days full migration; honest middle is 3–5)

**Mitigation:** Day-1 scope gate. If CM6 setup + decoration extension + `useActiveHeadingLine` port don't look tractable within 1 day of scoping, fall back to DIY mirror-div the same day. DIY is 2.5 days, fits the window with 7-day buffer.

**Evidence base:** Three subagent reports filed 2026-05-27 (#77 issue deep-dive, MarkdownEditor stopgap feasibility, Ian decision-pattern profile from 40+ commits across 5 repos).

### D-002 · #215 prompt-overrides retirement: **Path B (per-org default mode)** (2026-05-27)

**Decision:** Add a per-org "default mode" auto-apply mechanism rather than baking uW's overrides into `DEFAULT_PROMPT_VALUES` (Path A) or accepting silent regression (Path C).

**Why:** A bakes uW's theological framing into multi-tenant defaults (governance issue). C breaks WhatsApp production (no UI affordance to select modes there). B is architecturally clean and lines up with Tim's locked two-altitude design.

**Scope:** Adds `OrgConfig.default_mode?: string` (not a new KV namespace — per Frank's storage recommendation). Resolves as a **baseline layer beneath explicit selected modes**, not a "no mode selected" fallback (sparse modes must continue to inherit from the org tier — Frank P1 catch from the worker review).

**Rollout:** 5-phase phased deploy with `shadow_match` logging proving equivalence before the cutover removes the legacy reads.

**Owners:** Tim + Christou + Elsy on team approval (Zulip draft prepared 2026-05-27; awaiting send). Seth + Claude on implementation across worker + portal once approved.

**Detail:** See `docs/215-path-b-rollout.md` (to be created when team signs off).

### D-003 · Cross-repo authorship authority: **Seth + bots, across BT Servant family** (2026-05-27)

**Decision:** Seth has PR-author authority across bt-servant-worker, bt-servant-web-client, baruch, and other family repos. Was previously admin-portal-only.

**Authority source:** Ian Lindsley Zulip message 2026-05-27 while on vacation: _"I also think this is a great opportunity for you and your bots to venture into the other repos. I don't want to be a blocker for anything above. Feel free to knock out all of the created issues regardless of the repo."_

**Open questions:**

- Merge authority on sibling-repo PRs — does the "ask before merge" rule from admin-portal carry over? **Default: ask, per-repo, until each repo's norms are clear.** Routine docs PRs may be exception.
- Frank/Codex coverage — is the bot configured to review PRs on worker / web-client / baruch? **Default: assume yes for worker** (evidence: Frank reviewed prior worker PRs); verify on first PR in web-client / baruch.

### D-004 · Plan governance: **this document is the source of truth** (2026-05-27)

**Decision:** `docs/tuning-project-plan.md` (this file) is the canonical plan. Each tuning-scope issue cross-links to it. Each EPIC body links to it. Updates to the plan are commits + PRs like any other code change.

**Why:** Single canonical reference makes it possible for parallel agents working on different tracks to share context without re-deriving the strategic picture.

## Parallel Tracks

Six mostly-independent work tracks. Each track has internal dependencies that serialize within the track; between tracks, parallelization is the default.

### Track A — June 9 Editor Critical Path

| Issues                    | Status               | Dependencies          |
| ------------------------- | -------------------- | --------------------- |
| #77 editor library        | Decided: CM6 (D-001) | Worker#201 ✅ shipped |
| #167 syntax highlighting  | Unblocked by #77     | CM6 + #77             |
| #187 Export Config button | Independent, small   | None                  |

**Cadence:** Daily check-in during May 28 – June 9 window. Frank review per PR.

### Track B — Language Cascade Architecture (#170 family)

| Issues                                   | Status                                            | Dependencies |
| ---------------------------------------- | ------------------------------------------------- | ------------ |
| #170                                     | EPIC                                              | —            |
| #172 storage + chained-override schema   | Design pending Ian (per memory)                   | —            |
| #173 override authoring UI               | Blocked by #172                                   | —            |
| #174 diff view + selective re-inherit UI | Blocked by #172                                   | —            |
| #175 worker-side resolution tracking     | Mirrors worker#236                                | —            |
| #176 curator-update notification UX      | Blocked by #172                                   | —            |
| worker#236 chain resolution              | Blocked by #172 (admin-portal)                    | —            |
| worker#191 dynamic language-file loading | Possibly related to #236; needs cross-link review | —            |

**Status:** Held until Tim's modes-cascade reply lands. **Do not start implementation until #172 storage decision is committed.**

**Anticipated work:** Once unblocked, 6–8 weeks serial, 4–5 weeks with parallel UI + worker.

### Track C — Mode Library & Cross-Org (#149 family)

| Issues                                                | Status                        | Dependencies |
| ----------------------------------------------------- | ----------------------------- | ------------ |
| #149                                                  | EPIC                          | —            |
| #150 org metadata (display name, logo, contact)       | Independent                   | —            |
| #151 copy-on-import mode library with provenance      | Blocked by cascade decision   | —            |
| #152 uW-curated namespace + curator approval workflow | Blocked by #149 + #153 design | —            |
| #169 org-prefixed slug convention (design)            | Design discussion only        | —            |
| #184 read-only cross-org browse                       | Independent of cascade        | —            |
| worker#143 cross-org mode availability                | Blocked by #184 design        | —            |
| worker#137 ?mode= query param preload                 | Independent                   | —            |

**Quick win:** #150 (org metadata) and #184 (read-only cross-org browse) are unblocked. Could ship pre-June 9 if bandwidth allows, but not demo-critical.

### Track D — Identity Bridge (#171 family)

| Issues                                           | Status                                            | Dependencies |
| ------------------------------------------------ | ------------------------------------------------- | ------------ |
| #171                                             | EPIC                                              | —            |
| #177 identity unification design (Option A/B/C)  | Verbal greenlight from Ian, protocol undocumented | —            |
| #178 session/auth bridging                       | Blocked by #177 design lock                       | —            |
| #179 role + org propagation                      | Blocked by #177, #178                             | —            |
| #180 welcome flow for unauthenticated chat users | Blocked by #177, #179                             | —            |
| web-client#36 NextAuth bridge                    | Blocked by portal #178                            | —            |
| web-client#37 consume portal identity envelope   | Blocked by portal #179, web-client#36             | —            |
| web-client#38 welcome flow                       | Blocked by portal #180, web-client#37             | —            |

**Status:** Sit on this track until protocol choice is documented. Ian's verbal greenlight on Seth's #serving-our-customers write-up is not enough to start implementation — protocol selection (A vs B vs C) needs to land in #177.

**Optional pre-work:** Seth can finalize the protocol-choice document and post it on #177 as the proposal; if Ian or Tim doesn't object within a soak window, treat as authorized.

### Track E — Governance & Versioning (#153 family)

| Issues                                                    | Status                                                | Dependencies |
| --------------------------------------------------------- | ----------------------------------------------------- | ------------ |
| #153                                                      | EPIC                                                  | —            |
| #154 versioned-config API                                 | Worker-side; cross-link review with worker#94 pending | —            |
| #155 optimistic concurrency on saves                      | Independent                                           | —            |
| #156 revision states (draft / pending_review / published) | Schema design                                         | —            |
| #157 / #181 verb-based permissions                        | **Potential duplicates — reconcile**                  | —            |
| #158 / #182 audit log for non-content events              | **Potential duplicates — reconcile**                  | —            |
| #159 draft test mode                                      | UI work                                               | —            |
| #160 portal diff view + revision timeline                 | Blocked by #156                                       | —            |
| #163 in-app review queue notifications                    | Blocked by #156                                       | —            |
| #183 per-language and per-mode curator role               | Blocked by #157                                       | —            |
| worker#94 revision history for prompts/modes              | Reconciliation needed with portal #154                | —            |
| worker#237 append-only audit log storage                  | Mirrors portal #158/#182                              | —            |

**Quick win:** Resolve #157/#181 and #158/#182 duplicates first (~30 min of issue housekeeping).

### Track F — Baruch Integration (baruch family + portal#168, #188)

| Issues                                        | Status                    | Dependencies |
| --------------------------------------------- | ------------------------- | ------------ |
| portal#168 Baruch-assisted language pre-fill  | Cross-repo with baruch#18 | —            |
| portal#188 Merge Baruch + manual config views | UX restructure            | —            |
| baruch#18 Language-tuning pre-fill assistant  | Mirrors portal#168        | —            |
| baruch#17 5 of 7 prompt slots exposure        | Quick fix likely          | —            |
| baruch#10 Baruch's own config not org-scoped  | Architecture              | —            |
| baruch#6 set_prompt_overrides unwrapped body  | Bug fix                   | —            |

**Status:** Largely independent of other tracks. baruch#6 and baruch#17 are likely quick wins.

### Track G — #215 Path B Rollout (separate plan)

The 5-phase rollout outlined in this morning's planning work. Will get its own plan doc (`docs/215-path-b-rollout.md`) once Tim/Christou/Elsy sign off via Zulip. Not demo-critical for June 9.

## Cross-Repo EPIC Structure

### Portal — existing EPICs

Already filed; bodies will get a "Cross-repo umbrella" section pointing at the new sibling-repo EPICs:

- `#72` Admin Portal Redesign for Response Tuning
- `#149` Mode Library & Cross-Org Templates
- `#153` Governance & Versioning
- `#170` Language Cascade Override Architecture
- `#171` Identity Bridge — Admin Portal ↔ Chat App

### Sibling-repo EPICs — to file alongside this plan

**bt-servant-worker — EPIC: Tuning Architecture (worker side)**

Issues to link: #94, #115, #137, #143, #191, #215, #236, #237.

Body sketch: _"Worker-side companion to admin-portal's tuning EPICs (#149, #153, #170, #171). Covers trigger parsing (shipped), prompt resolution pipeline, language-file loading, mode availability, revision history, audit logging, and the in-flight #215 Path B rollout. Cross-link to admin-portal `docs/tuning-project-plan.md` for the strategic picture."_

**bt-servant-web-client — EPIC: Identity Bridge consumers**

Issues to link: #36, #37, #38.

Body sketch: _"Chat-app side of the portal-as-IdP integration (admin-portal#171). NextAuth bridge, identity envelope consumption, welcome-flow with recommended modes. Blocked on admin-portal#177 protocol-choice landing."_

**baruch — EPIC: Language Tuning Integration**

Issues to link: #6, #10, #17, #18.

Body sketch: _"Baruch's role in the BT Servant tuning project: language-pre-fill assistant for portal new-language flow (#18), prompt-slot exposure parity (#17), org-scoping for Baruch's own config (#10), set_prompt_overrides body shape fix (#6). Cross-link to admin-portal#168 and admin-portal `docs/tuning-project-plan.md`."_

## Operating Model

### Parallel work model

Up to **6 concurrent tracks** can run productively without stepping on each other. Each track owns:

- A set of issues (mostly within one EPIC; some cross-EPIC)
- An execution worktree (in `.claude/worktrees/`) for each branch
- A daily progress note to this plan doc (or to the track's issue thread)

**Constraints:**

- Frank reviews every PR. Frank's review bandwidth is the throughput ceiling — don't batch 10 PRs at once.
- Staging deploys per-merge. Coordinate large rollouts so they don't queue.
- Cross-repo PRs that change shared contracts (worker ↔ portal) get an explicit "I'm starting" note in this plan so other tracks aren't surprised.

### Branch + worktree strategy

- One worktree per track. Track-A worktree = `.claude/worktrees/june9-editor/`. Track-B worktree = `.claude/worktrees/cascade/`. Etc.
- Inside each worktree, one branch per PR (`feature/<issue>-<short>`, `fix/<issue>-<short>`, `docs/<short>`).
- Stale worktrees get pruned post-merge.

### Per-PR ritual

For every code-change PR:

1. Pre-commit hook MUST pass — no `--no-verify`, ever.
2. PR description carries the trade-off framing (per Ian's pattern).
3. Tests added for any pure logic with discrete edge cases (per [[feedback_real_tests]]).
4. Frank review round (P1/P2/P3) — fix all medium+ before merge.
5. After fix, kick off a new review.
6. After Frank approves, ask Seth for merge nod (per portal CLAUDE.md). For sibling repos, ask explicitly first time per repo, then settle into local norm.

For docs-only PRs (like this one or progress trackers):

1. Pre-commit still runs prettier + typecheck + build.
2. Frank review is optional but standard practice for substantial planning docs.
3. Same merge-nod rule.

### Decision-logging

This file's "Decisions" section is append-only. Decisions get a `D-NNN` reference for cross-citation. When superseded, mark the old decision SUPERSEDED with a pointer to the new one. Don't delete history.

### Cross-link discipline

Every tuning-scope issue gets a "Cross-links" comment (not body edit, per [[feedback_gh_closes_keyword]]) pointing at:

1. This plan doc (raw GitHub URL with line-anchor)
2. The parent EPIC in its own repo
3. Any companion EPIC in sibling repos

This makes the dependency graph readable from any starting issue.

## Quality Gates

**Non-negotiable (per CLAUDE.md):**

- Pre-commit hook passes (lint-staged + typecheck + build)
- ESLint zero warnings (`--max-warnings 0`)
- TypeScript strict mode passes
- Frank review on every PR
- All medium+ severity findings fixed before merge

**Project-specific:**

- Tests added per [[feedback_real_tests]] for pure logic with discrete edge cases
- AlertDialogAction not used for async confirmations (per [[feedback_alertdialogaction_async]])
- Storage decisions justify via existing namespaces over new KV keys (per Frank's #215 storage recommendation)
- Override mechanisms check resolved-vs-current, not param-presence (per Frank's #185 P2 finding)
- New selectors that mutate state audit existing dirty-guards (per Frank's #186 P1 finding)
- Don't log raw prompts; structured metadata only

## Risk Register

| ID    | Risk                                                                                           | Probability                             | Impact                               | Mitigation                                                                                                                |
| ----- | ---------------------------------------------------------------------------------------------- | --------------------------------------- | ------------------------------------ | ------------------------------------------------------------------------------------------------------------------------- |
| R-001 | Spoken mode / Arabic language content for uW is thin or missing                                | Medium                                  | High (demo-blocking)                 | Day-1 verification (May 28). If gap, escalate to Elsy/Tim immediately.                                                    |
| R-002 | CM6 implementation stretches past 5 days due to `useActiveHeadingLine` port complexity         | Medium                                  | Medium (demo-tightening)             | Day-1 scope gate. Fall back to DIY mirror-div (2.5 days).                                                                 |
| R-003 | Tim's modes-cascade reply doesn't land before June 9                                           | High (outstanding since 2026-05-21)     | Low (Track B is post-demo)           | Park Track B. Not demo-blocking.                                                                                          |
| R-004 | Frank/Codex coverage on sibling repos is partial — first sibling PR doesn't get reviewed       | Medium                                  | Medium                               | Verify on first sibling-repo PR. Add manual review pass if needed.                                                        |
| R-005 | WhatsApp v2 rollout regresses post-#215 cutover                                                | Low (Path B mitigation is exactly this) | High                                 | `shadow_match` logging proves equivalence pre-cutover. Soak windows. Per-org sign-off.                                    |
| R-006 | Cross-repo coordination breaks down — work in repo X invalidates work in repo Y                | Medium                                  | Medium                               | Cross-link comments + EPIC umbrellas + this plan doc. Daily check-in on Track-A; weekly across all tracks.                |
| R-007 | Scope-creep on sub-issues (today's #215 ballooned from 10-line patch to 2-week phased rollout) | High                                    | Medium                               | Each sub-issue gets a 2-day timebox; if it stretches, surface and re-plan.                                                |
| R-008 | Ian unreachable for design-gated decisions (#172, #177)                                        | Already in effect                       | Medium                               | Per D-003, Seth has interim authority. Surface clearly when proceeding without his sign-off; document inferred rationale. |
| R-009 | Content quality of captured #215 Path B per-org modes diverges from existing prompts           | Medium                                  | High (silent prompt regression)      | `shadow_match: true` rate must be 100% before Phase 4 cutover. Org-admin sign-off on captured content.                    |
| R-010 | Frank's review bandwidth saturated by parallel work                                            | Medium                                  | Medium (throughput cap, not quality) | Stagger PR opens. Don't merge 4+ PRs/day average across tracks.                                                           |

## Open Questions

| #     | Question                                                                             | Defaulting to                                           | Resolve by            |
| ----- | ------------------------------------------------------------------------------------ | ------------------------------------------------------- | --------------------- |
| Q-001 | Merge authority on sibling-repo PRs — same "ask before merge" rule?                  | Ask, per repo, until norms are clear                    | First sibling-repo PR |
| Q-002 | Frank/Codex coverage on sibling repos?                                               | Assume yes for worker; verify for web-client and baruch | First PR in each repo |
| Q-003 | What's the demo channel for June 9 — portal test-chat, chat web-client, or WhatsApp? | Portal test-chat (most controlled)                      | Day 1 with Elsy       |
| Q-004 | Is the June 9 demo uW-specific, or another org (BSOK / Pioneers)?                    | uW (canary, has substantive content)                    | Day 1 with Elsy       |
| Q-005 | #157 vs #181 verb-based permissions — same issue?                                    | Treat as duplicates pending Elsy's clarification        | Day 1                 |
| Q-006 | #158 vs #182 audit log — same issue?                                                 | Treat as duplicates pending Elsy's clarification        | Day 1                 |
| Q-007 | worker#94 vs portal#154 — separate layers or overlap?                                | Frame as reconciliation question on cross-link comment  | Cross-link batch      |
| Q-008 | worker#191 vs worker#236 — same layer or different?                                  | Verify by reading issue bodies before labeling v1/v2    | Cross-link batch      |

## Bottlenecks (in priority order)

1. **Tim's modes-cascade reply** — gates Track B detail-scoping
2. **Ian's identity-bridge protocol documentation** — gates Track D
3. **Christou/Elsy bandwidth for #153 governance calls** — gates Track E sub-issues
4. **Tim/Christou/Elsy on #215 Path B** — gates Track G start (Zulip draft prepared 2026-05-27, awaiting send)
5. **Frank's review bandwidth** — at 6+ parallel tracks, this caps PR-throughput before any other constraint
6. **Content readiness of spoken mode + arabic language in uW** — demo-blocking, must verify Day 1

## Resources

- [Notion: BT Servant Capability Roadmap](https://www.notion.so/) (linked from product report)
- [Notion: BT Servant Product Report](https://www.notion.so/) (April 2026 status)
- Repo links:
  - [bt-servant-admin-portal](https://github.com/unfoldingWord/bt-servant-admin-portal)
  - [bt-servant-worker](https://github.com/unfoldingWord/bt-servant-worker)
  - [bt-servant-web-client](https://github.com/unfoldingWord/bt-servant-web-client)
  - [baruch](https://github.com/unfoldingWord/baruch)
- Existing related docs:
  - `docs/progress_tracker.md` — daily session log
- Decision records:
  - D-001 (CM6) — this doc
  - D-002 (#215 Path B) — this doc
  - D-003 (Cross-repo authority) — this doc
  - D-004 (Plan governance) — this doc

## Change Log

| Date       | Change                                                                                                                                                     | Author |
| ---------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------- | ------ |
| 2026-05-27 | Plan opened. 5 portal EPICs + 3 sibling-repo EPICs (to file). 51 in-scope issues. June 9 demo critical path defined. Decisions D-001 through D-004 logged. | Claude |
