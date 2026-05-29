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
| **EPIC count**                      | 5 portal + 3 sibling-repo umbrellas (all filed 2026-05-27)                   |
| **Last revised**                    | 2026-05-27 (revision 3 — Frank cleanup-pass)                                 |

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

| #    | Title                                     | Status                                                                                                                                                  |
| ---- | ----------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------- |
| #72  | Admin Portal Redesign for Response Tuning | DoD-blocked on #77 (editor library); worker#191 trigger-path injection verified shipped 2026-05-27 (D-007); other Goals shipped 2026-05-07 → 2026-05-11 |
| #149 | Mode Library & Cross-Org Templates        | Sub-issues filed; cascade-decision-gated                                                                                                                |
| #153 | Governance & Versioning                   | Sub-issues filed; revision-state design pending                                                                                                         |
| #170 | Language Cascade Override Architecture    | Design locked 2026-05-21; sub-issues #172–#176                                                                                                          |
| #171 | Identity Bridge — Admin Portal ↔ Chat App | Greenlit by Tim; protocol design pending                                                                                                                |

**Sibling-repo (filed 2026-05-27):**

| Repo                  | EPIC                                                                                                            | Issues linked                                 |
| --------------------- | --------------------------------------------------------------------------------------------------------------- | --------------------------------------------- |
| bt-servant-worker     | [#239 — EPIC: Tuning Architecture — worker side](https://github.com/unfoldingWord/bt-servant-worker/issues/239) | #94, #115, #137, #143, #191, #215, #236, #237 |
| bt-servant-web-client | [#39 — EPIC: Identity Bridge consumers](https://github.com/unfoldingWord/bt-servant-web-client/issues/39)       | #36, #37, #38                                 |
| baruch                | [#19 — EPIC: Language Tuning Integration](https://github.com/unfoldingWord/baruch/issues/19)                    | #6, #10, #17, #18                             |

These were filed alongside this plan so cross-repo dependency tracking has explicit anchors. Each portal EPIC now carries a "Cross-repo siblings" header pointing at the relevant sibling EPIC(s).

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

| Item                                                    | Status (2026-05-27)                                                                                                                                                                                                                                                                                                                            | Owner                                             |
| ------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------- |
| Markdown editor with TOC + autosave                     | ✅ Shipped 2026-05-07 (#75, #76, #82)                                                                                                                                                                                                                                                                                                          | —                                                 |
| Languages CRUD + scaffold                               | ✅ Shipped 2026-05-08–11 (#74, #79)                                                                                                                                                                                                                                                                                                            | —                                                 |
| Trigger parsing `#mode @lang`                           | ✅ Shipped 2026-05-11 (worker#211/#212)                                                                                                                                                                                                                                                                                                        | —                                                 |
| Test-chat affordance                                    | ✅ Shipped 2026-05-11 (#81)                                                                                                                                                                                                                                                                                                                    | —                                                 |
| Super-admin cross-org config edits                      | ✅ Shipped 2026-05-27 (#166)                                                                                                                                                                                                                                                                                                                   | —                                                 |
| **🟢 Worker-side language-file injection (worker#191)** | **Trigger-path verified shipped 2026-05-27 (D-007). Demo PROMISE works against staging today: `#spoken @arabic` parses, mode applies, arabic language document injects as `## Language Guidance`. Remaining scope collapsed to (a) e2e confidence test ~0.5d, and (b) session-state language persistence design — gated on Chris/Ian return.** | Seth (e2e test); Chris + Ian (persistence design) |
| **Syntax highlighting (#167)**                          | ⚠ depends on #77 — decision below                                                                                                                                                                                                                                                                                                              | Seth                                              |
| **Spoken mode content for uW**                          | ✅ Verified 2026-05-27 — ~48KB published markdown, slot-organized under the canonical H2s, real content                                                                                                                                                                                                                                        | —                                                 |
| **Arabic language content for uW**                      | 🟡 Verified 2026-05-27 — published but THIN (~250 chars, 3 stub headings, no DCV overrides, no examples). Hindi at the right depth as the comparator. Escalation drafted for Elsy/Tim                                                                                                                                                          | Elsy/Tim (fleshing)                               |

### Day-by-day plan

The critical path was originally **two parallel streams**: (1) worker#191 runtime language-file injection, and (2) #77 CodeMirror 6 editor migration. **As of D-007 (2026-05-27), Stream 1 collapsed to verification + e2e test** — the trigger-path injection was already shipped. Stream 2 (CM6) is now the only meaningful code-critical-path stream; Stream 1 freed bandwidth shifts to content polish and Frank review headroom.

| Day | Date       | Stream 1: worker#191 (the demo-promise enabler)                                                                                                                                                                           | Stream 2: #77 → #167 (the demo-polish enabler)                                                                    | Decision gate                                                      |
| --- | ---------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------ |
| 1   | 2026-05-28 | ✅ **Pulled forward to 2026-05-27 evening.** Verified trigger-path injection already shipped end-to-end (D-007); spoken-mode content ready; arabic content thin (escalation drafted). Issue comment posted on worker#191. | Day-1 CodeMirror 6 scope check.                                                                                   | If CM6 day-1 scoping unclear → fall back to DIY mirror-div overlay |
| 2   | 2026-05-29 | E2E confidence test (~0.5d): dummy language document materially changes Claude response style. Closes worker#191 last AC.                                                                                                 | Begin #77 CM6 migration (or DIY fallback). Content gap-filling in parallel if needed.                             | —                                                                  |
| 3   | 2026-05-30 | E2E test PR opens; Frank review. (Persistence design held until Chris/Ian return.)                                                                                                                                        | CM6 editor swap + `@codemirror/lang-markdown` integration                                                         | —                                                                  |
| 4   | 2026-05-31 | E2E test fix cycle (if needed) + merge. Stream 1 bandwidth shifts to content polish + Stream 2 support.                                                                                                                   | `useActiveHeadingLine` port to CM6 transactions + TOC jump imperative handle; dark-mode theming via CSS variables | —                                                                  |
| 5   | 2026-06-01 | End-to-end smoke: `#spoken @arabic` in test-chat → response shaped by BOTH spoken mode AND arabic language file. Capture before/after diff.                                                                               | Integration on Modes + Languages pages; tests                                                                     | —                                                                  |
| 6   | 2026-06-02 | —                                                                                                                                                                                                                         | Polish, edge cases (large docs, Ulysses comments, code fences)                                                    | —                                                                  |
| 7   | 2026-06-03 | —                                                                                                                                                                                                                         | Frank review round + fix cycle on #77                                                                             | —                                                                  |
| 8   | 2026-06-04 | —                                                                                                                                                                                                                         | Ship #167 turn-key via CM6's syntax tokens. Land #187 (Export Config) if bandwidth                                | —                                                                  |
| 9   | 2026-06-05 | Content polish — Elsy/Tim coordinating on spoken + arabic content quality.                                                                                                                                                | Content polish (same stream — content work doesn't separate by repo).                                             | —                                                                  |
| 10  | 2026-06-06 | Demo dry run on staging. Capture any edge cases.                                                                                                                                                                          | Same.                                                                                                             | —                                                                  |
| 11  | 2026-06-07 | Fixes from dry-run findings.                                                                                                                                                                                              | Same.                                                                                                             | —                                                                  |
| 12  | 2026-06-08 | Final smoke test. **If the demo requires prod**, coordinate manual production workflow dispatch with Ian/Jaap-Jan (no direct local deploys per project rules; "Promote Production" Actions workflow is the only path).    | Same.                                                                                                             | —                                                                  |
| 13  | 2026-06-09 | **Demo day.**                                                                                                                                                                                                             |                                                                                                                   | —                                                                  |

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

### D-005 · worker#191 classified on Track A.1, not Track B (2026-05-27, revision 2; implementation-cost assumption superseded by D-007)

**Decision:** worker#191 (dynamic language-file loading into system prompt) is on **Track A.1 — June 9 critical path**, not Track B (Language Cascade Architecture).

**Why:** Frank P1 review of plan revision 1 surfaced that the original classification was wrong. The June 9 demo's stated DoD per portal#72 is _"a user typing `#spoken @arabic` gets responses shaped by **both** the Spoken mode file AND the Arabic language file."_ Without worker#191, `#spoken @arabic` parses (worker#211/#212, shipped) and spoken mode applies, but the arabic-language tuning document **does not flow into the system prompt**. The portal#72 body explicitly calls worker#191 "the remaining DoD-blocker for the fifth Goal."

worker#191's issue body is explicit: _"This is the quick-and-dirty approach for June 9 — we load the whole language file every time."_ It's scoped for the demo. It belongs on the demo's critical path, not behind the cascade-design gate.

**Update 2026-05-27 (D-007):** Verification revealed the trigger-path implementation is already shipped end-to-end against worker `main` at `47626b7`. D-005's classification (on Track A.1) holds; D-005's implementation-cost framing below ("tractable in days 1–4", "we want the v1 mechanism for June 9") is superseded by D-007. The remaining work is an e2e confidence test + session-state persistence design — not net-new implementation.

**Why not block on Ian/Chris pair-programming note?** The issue body says _"Ian and Chris are pairing on the architecture for this — coordinate before implementing."_ Ian is on vacation. Two options: (a) wait for Ian + Chris together (kills June 9), (b) implement under D-003 cross-repo authority, ping Chris (Klappy) on the PR for coordination input + Frank-style review. (b) is consistent with Ian's vacation message ("knock out all of the created issues") and respects the coordination ask without blocking on it.

**Why not the cascade-resolution v2 path (worker#236)?** worker#236 is the post-design-decision cascade-chain resolution mechanism for Track B. It supersedes #191's quick-and-dirty approach when the storage decision lands (admin-portal#172). For June 9 we want the v1 mechanism (#191), not v2.

### D-006 · Plan URL stability: **point at `/blob/main/`; merge PR #190 promptly** (2026-05-27, revision 2)

**Decision:** Cross-link comments and EPIC umbrella headers point at the canonical `/blob/main/docs/tuning-project-plan.md` URL. **The PR #190 docs PR must merge promptly** so that URL resolves (otherwise the 51 cross-link comments and 5 EPIC umbrella headers have a transient 404 window).

**Why:** Frank P2 review of plan revision 1 surfaced that the `/blob/main/...` URL 404s while PR #190 is still open. The cross-link comments noted this with _"Plan currently in admin-portal#190; merges shortly — URL will resolve once merged"_, but the EPIC umbrella headers did NOT carry that disclaimer. Two ways to resolve: (a) merge PR #190 ASAP (cleaner), (b) update all links to point at PR #190 until merge (more work, transient).

**Choice:** (a) — merge PR #190 as soon as Frank approves revision 2 and Seth gives the merge nod.

**Open mitigation:** If merge is delayed >24h post-Frank-approval, switch to (b) by editing the 5 EPIC umbrella headers to add the "merges shortly" disclaimer. Cross-link comments already have it.

### D-007 · worker#191 trigger-path injection verified shipped — scope collapses (2026-05-27)

**Decision:** worker#191 is reclassified from "open implementation work" to "verified shipped; remaining scope = e2e confidence test + session-state persistence design call." Track A.1's 5-day implementation stream collapses to ~0.5d of e2e test work plus a gated design conversation.

**Why:** Day-1 trace of the worker chat-time system-prompt assembly confirmed the trigger-path injection is already wired end-to-end (worker `main` at `47626b7`):

- `src/services/classifier/index.ts:299` — classifier parses `@<lang>` head tokens, sets `languageName`
- `src/durable-objects/user-do.ts:1159-1163` — at chat time, `loaded.orgLanguages.languages.find(l => l.name === classified.languageName)` resolves the language document
- `src/services/claude/orchestrator.ts:917-918` — `stripUlyssesComments(languageDocument)` strips comments before injection
- `src/services/claude/system-prompt.ts:201-204` — `pushLanguageSection` injects `## Language Guidance\n\n${document}` into the system prompt
- `tests/unit/system-prompt.test.ts:381-405` — section include/exclude both pinned
- `src/durable-objects/user-do.ts:1047` — telemetry emits `language_document_injected`

Demo PROMISE (`#spoken @arabic` produces a response shaped by both files) works against staging today, provided the user types both triggers at the head of every message.

**What remains in scope:**

1. **Session-state language persistence** — `@arabic` does NOT persist across turns (no `SELECTED_LANGUAGE_KEY` analogue to `SELECTED_MODE_KEY`). Whether language SHOULD persist is a UX decision: yes mirrors mode behavior; no requires re-typing every turn but keeps language choice explicit per request. **Design call, not implementation. Gated on Chris/Ian return** (issue body: "Ian and Chris are pairing on the architecture").
2. **E2E confidence test** — automated test with a dummy override ("5-year-old English") proving Claude's response style actually changes. Closes worker#191's last acceptance criterion. ~0.5d.

**Implication for the day-by-day plan:** Stream 1 frees ~4 days of engineering bandwidth (originally days 2–5 of implementation). Demo PROMISE is no longer a code risk — it is a **content** risk (arabic file is thin per Day-1 readiness check; escalation to Elsy/Tim drafted). Stream 2 (CM6) is now the only meaningful code-critical-path stream.

**Relationship to D-005:** D-005 (worker#191 on Track A.1) remains correct as classification — the issue still belongs on the demo's critical path because closing it confirms the DoD. D-007 supersedes the implementation-cost assumption in D-005, not the classification.

**Trace artifact:** worker#191 issue comment at https://github.com/unfoldingWord/bt-servant-worker/issues/191#issuecomment-4559421886.

## Parallel Tracks

Six mostly-independent work tracks. Each track has internal dependencies that serialize within the track; between tracks, parallelization is the default.

### Track A — June 9 Critical Path

Two parallel streams. **As of D-007 (2026-05-27), Stream A.1 collapsed to verification + e2e test work** — the implementation half was already shipped:

**Stream A.1 — worker#191 runtime language-file injection (demo PROMISE enabler)**

| Issues                                      | Status                                                                                                                                                                                                             | Dependencies                      |
| ------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | --------------------------------- |
| worker#191 dynamic language-file loading    | **Trigger-path shipped (verified 2026-05-27 — D-007).** Remaining: e2e confidence test (~0.5d) + session-state language persistence design (gated on Chris/Ian return). Issue comment posted with file:line trace. | Chris + Ian on persistence design |
| portal#72 fifth Goal closes once #191 lands | Marked 🔴 in portal#72 body                                                                                                                                                                                        | worker#191                        |

**Why this is on Track A and not Track B (per Frank's P1).** Without worker#191's runtime injection, `#spoken @arabic` parses but the arabic document never reaches the prompt — the demo's stated promise ("response shaped by _both_ files") would be fake-thin. This is feature-completeness, not polish.

**Update 2026-05-27 (D-007):** verification revealed the trigger-path injection was already shipped end-to-end (no code missing). Stream A.1 classification on Track A holds — closing #191 still confirms the DoD — but the implementation cost in D-005 was wrong. Demo PROMISE is no longer a code risk; it is now a **content** risk (arabic file is thin).

**Stream A.2 — Editor polish (#77 → #167) (demo POLISH enabler)**

| Issues                    | Status               | Dependencies          |
| ------------------------- | -------------------- | --------------------- |
| #77 editor library        | Decided: CM6 (D-001) | worker#201 ✅ shipped |
| #167 syntax highlighting  | Unblocked by #77     | CM6 + #77             |
| #187 Export Config button | Independent, small   | None                  |

**Parallel-safety:** Streams A.1 and A.2 touch different repos (worker vs portal). No merge conflicts; both can run concurrently start of day 1.

**Cadence:** Daily check-in during May 28 – June 9 window. Frank review per PR.

### Track B — Language Cascade Architecture (#170 family)

| Issues                                   | Status                                                                                                                                                                                              | Dependencies |
| ---------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------ |
| #170                                     | EPIC                                                                                                                                                                                                | —            |
| #172 storage + chained-override schema   | Design pending Ian (per memory)                                                                                                                                                                     | —            |
| #173 override authoring UI               | Blocked by #172                                                                                                                                                                                     | —            |
| #174 diff view + selective re-inherit UI | Blocked by #172                                                                                                                                                                                     | —            |
| #175 worker-side resolution tracking     | Mirrors worker#236                                                                                                                                                                                  | —            |
| #176 curator-update notification UX      | Blocked by #172                                                                                                                                                                                     | —            |
| worker#236 chain resolution              | Blocked by #172 (admin-portal)                                                                                                                                                                      | —            |
| ~~worker#191~~                           | **Moved to Track A.1 (June 9 critical path) per Frank's P1 finding.** Trigger-path verified shipped 2026-05-27 (D-007); post-demo, worker#236 may supersede the v1 load with cascade-resolution v2. | —            |

**Status:** Held until Tim's modes-cascade reply lands. **Do not start implementation until #172 storage decision is committed.** worker#191 was previously listed here as a Track-B item; it is now correctly classified under Track A.1 because the June 9 demo's DoD requires it.

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

| Issues                                                    | Status                                                                          | Dependencies |
| --------------------------------------------------------- | ------------------------------------------------------------------------------- | ------------ |
| #153                                                      | EPIC                                                                            | —            |
| #154 versioned-config API                                 | **Foundational** — reconciliation with worker#94 pending; API contract to draft | —            |
| #155 optimistic concurrency on saves                      | —                                                                               | #154         |
| #156 revision states (draft / pending_review / published) | Schema design                                                                   | #154, #181   |
| ~~#157~~ → #181 verb-based permissions                    | #157 closed 2026-05-28 as dup of #181; #181 canonical                           | —            |
| ~~#158~~ → #182 audit log for non-content events          | #158 closed 2026-05-28 as dup of #182; #182 canonical                           | —            |
| #159 draft test mode                                      | UI work                                                                         | #156         |
| #160 portal diff view + revision timeline                 | UI work                                                                         | #154         |
| #163 in-app review queue notifications                    | UI work                                                                         | #156         |
| #181 verb-based permissions (edit vs publish)             | Portal-side schema + UI                                                         | —            |
| #182 audit log for non-content events                     | Portal UI + cross-repo storage                                                  | worker#237   |
| #183 per-language and per-mode curator role               | —                                                                               | #181         |
| worker#94 revision history for prompts/modes              | Reconciliation needed with portal #154                                          | —            |
| worker#237 append-only audit log storage                  | Mirrors portal #182                                                             | —            |

**Entry sequence (Phase 1 — Stabilize):**

1. **Reconcile #154 ↔ worker#94 + draft the versioned-config API contract** (immutable revisions, version tokens, expected-version PUTs, rollback as new-PUT-from-old, KV layout, migration path).
2. **#181 verb-permissions schema + portal UI** — independent of the spine; unblocks #156 and #183.
3. **Implement #154** (worker-side) — cross-repo; Ian's lane per [[feedback_scope_admin_portal_only]].
4. **#155 optimistic concurrency** (portal-side wrap of #154's expected-version mechanism).
5. **#156 revision states** + dependents (#159 draft test mode, #160 diff view, #163 review notifications).
6. **#182 audit log** (parallel to the spine; mirrors worker#237).

Steps 1–2 are parallel and unblocked today. Steps 3–6 serialize off step 1.

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

### Sibling-repo EPICs (filed 2026-05-27)

| Repo                  | EPIC                                                                                                            | Scope                                                                                                                                                                                                                                                            |
| --------------------- | --------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| bt-servant-worker     | [#239 — EPIC: Tuning Architecture — worker side](https://github.com/unfoldingWord/bt-servant-worker/issues/239) | Worker-side companion to portal #149, #153, #170, #171. Covers prompt resolution pipeline, language-file loading, mode availability, revision history, audit logging, in-flight #215 Path B rollout. Links worker #94, #115, #137, #143, #191, #215, #236, #237. |
| bt-servant-web-client | [#39 — EPIC: Identity Bridge consumers](https://github.com/unfoldingWord/bt-servant-web-client/issues/39)       | Chat-app side of portal-as-IdP integration (portal #171). NextAuth bridge, identity envelope consumption, welcome flow. Blocked on portal#177 protocol-choice landing. Links web-client #36, #37, #38.                                                           |
| baruch                | [#19 — EPIC: Language Tuning Integration](https://github.com/unfoldingWord/baruch/issues/19)                    | Language-pre-fill assistant (#18 ↔ portal#168), slot-exposure parity (#17), org-scoping for Baruch's own config (#10), `set_prompt_overrides` body fix (#6).                                                                                                     |

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

| #     | Question                                                                             | Defaulting to                                                                                                                    | Resolve by            |
| ----- | ------------------------------------------------------------------------------------ | -------------------------------------------------------------------------------------------------------------------------------- | --------------------- |
| Q-001 | Merge authority on sibling-repo PRs — same "ask before merge" rule?                  | Ask, per repo, until norms are clear                                                                                             | First sibling-repo PR |
| Q-002 | Frank/Codex coverage on sibling repos?                                               | Assume yes for worker; verify for web-client and baruch                                                                          | First PR in each repo |
| Q-003 | What's the demo channel for June 9 — portal test-chat, chat web-client, or WhatsApp? | Portal test-chat (most controlled)                                                                                               | Day 1 with Elsy       |
| Q-004 | Is the June 9 demo uW-specific, or another org (BSOK / Pioneers)?                    | uW (canary, has substantive content)                                                                                             | Day 1 with Elsy       |
| Q-005 | #157 vs #181 verb-based permissions — same issue?                                    | Treat as duplicates pending Elsy's clarification                                                                                 | Day 1                 |
| Q-006 | #158 vs #182 audit log — same issue?                                                 | Treat as duplicates pending Elsy's clarification                                                                                 | Day 1                 |
| Q-007 | worker#94 vs portal#154 — separate layers or overlap?                                | Frame as reconciliation question on cross-link comment                                                                           | Cross-link batch      |
| Q-008 | worker#191 vs worker#236 — same layer or different?                                  | **Different layers.** #191 = runtime injection (verified shipped 2026-05-27, D-007); #236 = cascade-chain resolution for Track B | Resolved 2026-05-27   |

## Bottlenecks

**Split into June-9-critical vs post-demo** (per Frank's P2 finding — without this split, optimization effort goes to the wrong queue).

### Demo-critical (June 9 path, in priority order)

1. **worker#191 runtime language-file injection** — **Substantially descoped 2026-05-27 (D-007).** Trigger-path injection verified shipped end-to-end against worker `main` at `47626b7`. Demo PROMISE works against staging today (provided the user types both triggers at the head of every message — see persistence note below). Remaining scope: e2e confidence test (Seth, estimate pending tests/ directory inspection in worker repo) + session-state language persistence design (gated on Chris/Ian return — without it, the demo requires the user to re-type `@arabic` every turn, which materially affects demo UX). No longer the top _code_ bottleneck; persistence is the top _UX_ bottleneck.
2. **Content readiness of spoken mode + arabic language in uW** — coordination, not engineering. Verify Day 1; if thin, escalate to Elsy/Tim immediately.
3. **CodeMirror 6 scope check** — Day-1 gate. If CM6 day-1 scoping is unclear, fall back to DIY mirror-div (per D-001 mitigation).
4. **Frank's review bandwidth across two parallel streams** — both A.1 (worker#191) and A.2 (#77/#167) need PR review; stagger PR-opens to avoid review queue.

### Post-demo (architecture work, in priority order)

5. **Tim's modes-cascade reply** — gates Track B detail-scoping
6. **Ian's identity-bridge protocol documentation** — gates Track D
7. **Christou/Elsy bandwidth for #153 governance calls** — gates Track E sub-issues
8. **Tim/Christou/Elsy on #215 Path B** — gates Track G start (Zulip draft prepared 2026-05-27, awaiting send)
9. **Frank's review bandwidth at full parallel-track velocity (6+ concurrent tracks)** — caps post-demo PR throughput

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
  - D-005 (worker#191 on Track A.1) — this doc
  - D-006 (Plan URL stability) — this doc
  - D-007 (worker#191 verified shipped — scope collapse) — this doc

## Change Log

| Date               | Change                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                             | Author |
| ------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------ |
| 2026-05-27 (rev 1) | Plan opened. 5 portal EPICs + 3 sibling-repo EPICs (to file). 51 in-scope issues. June 9 demo critical path defined. Decisions D-001 through D-004 logged.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                         | Claude |
| 2026-05-27 (rev 2) | Frank P1/P2 revision. **worker#191 moved to Track A.1** as the demo's actual DoD-blocker per portal#72 fifth Goal (D-005). Sibling EPIC statuses updated to "filed" with URLs (worker#239, web-client#39, baruch#19). Bottlenecks split into June-9 vs post-demo. Prod-promotion wording tightened to require manual workflow dispatch. D-006 logged on plan URL stability (PR #190 merge needed for `/blob/main/` resolution). Day-by-day plan restructured into two parallel streams (A.1 + A.2).                                                                                                                                                                                | Claude |
| 2026-05-27 (rev 3) | Frank cleanup-pass P2/P3. Replaced stale "Sibling-repo EPICs — to file alongside this plan" section with a filed-status table mirroring the top-of-doc EPIC table. Portal #72 row in EPIC table now reads "DoD-blocked on #77 + worker#191" instead of "only #77 left." Fixed Day 12 escaped-bold typo (`Ian/Jaap-Jan\*\*` → `Ian/Jaap-Jan`).                                                                                                                                                                                                                                                                                                                                      | Claude |
| 2026-05-27 (rev 4) | **D-007 logged.** Day-1 findings revision. worker#191 trigger-path injection verified shipped end-to-end against worker `main` at `47626b7`; Track A.1 implementation scope collapses to e2e test (~0.5d) + persistence design (gated on Chris/Ian). Spoken mode content verified ready (~48KB); arabic content verified thin (~250 chars; escalation drafted for Elsy/Tim). Day-by-day Stream 1 cells updated to reflect collapsed scope; status table, Track A intro, Stream A.1 table, Track B row, Q-008, and bottleneck #1 all reclassified. D-005 header annotated as implementation-cost assumption superseded.                                                             | Claude |
| 2026-05-27 (rev 5) | Self-review consistency pass. D-005 body now carries an in-line update referencing D-007 so a reader landing on D-005 cold gets the corrected picture without scrolling. Bottleneck #1 softened: "Cleared" → "Substantially descoped", strikethrough removed (issue is verified-shipped but not closed), e2e estimate hedged pending worker repo `tests/` inspection, persistence gap promoted as the top _UX_ bottleneck since the demo requires re-typing `@arabic` every turn without it.                                                                                                                                                                                       | Claude |
| 2026-05-29 (rev 6) | Track E refresh — Phase 1 orientation. Dup rows for #157/#181 and #158/#182 replaced with their actual resolved state (closed 2026-05-28 as dups; canonicals are #181/#182). Dependency column corrected per sub-issue bodies: #155/#156/#160 depend on #154 (not "Independent"/"Blocked by #156"); #156 depends on #154 + #181; #163 depends on #156; #183 depends on #181 (formerly #157, now closed). #154 callout promoted to "Foundational" per its own body. Added a 6-step Phase 1 entry sequence with steps 1 (#154 ↔ worker#94 reconciliation) and 2 (#181 verb-perms schema) unblocked today. Quick-win callout removed (the dup housekeeping it referenced is shipped). | Claude |
