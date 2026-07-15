# BT Servant Admin Portal

Admin portal for managing BT Servant worker configurations. Built with React 19 and deployed to Cloudflare Workers.

The portal is the admin frontend for [bt-servant-worker](../bt-servant-worker)'s admin API (referred to as "the engine" throughout the code — `ENGINE_BASE_URL` points at it). It also talks to [baruch](../baruch), the conversational configuration agent, via a service binding.

## Tech Stack

- **Frontend**: React 19, TypeScript (strict), Vite, Tailwind CSS 4
- **UI**: Radix UI primitives, shadcn-style components, Font Awesome Pro (duotone/light/solid), Lucide React
- **Editor**: CodeMirror 6 (markdown), react-markdown + remark-gfm for rendering
- **Routing**: React Router v7 (client-side SPA, data router)
- **State**: TanStack React Query v5 (server), Zustand v5 (client)
- **Backend**: Cloudflare Worker BFF (auth + API proxy to the BT Servant worker and Baruch)
- **Auth**: Session-based with KV storage (PBKDF2 password hashing, HttpOnly cookie, 7-day TTL)
- **Tests**: Vitest via `@cloudflare/vitest-pool-workers` (worker code runs in the real workerd runtime)
- **Font**: Outfit

## Architecture

Onion architecture enforced by ESLint `no-restricted-imports`:

```
src/
├── types/       → Domain types (no internal imports)
├── lib/         → Core utilities (can import: types)
├── hooks/       → Business logic hooks (can import: lib, types)
├── components/  → UI components (can import: hooks, lib, types)
└── app/         → Routes & pages (can import: all layers)
worker/
├── index.ts            → Cloudflare Worker entrypoint & router
├── auth.ts             → Login/logout/session/change-password, session hydration + lazy rights migration
├── chat.ts             → Chat SSE streaming, history & memory proxy (with user_id override guard)
├── baruch.ts           → Baruch SSE streaming, initiation & history proxy
├── config.ts           → Modes, languages & prompt-override proxy + verb-perms authorization gate
├── admin.ts            → Admin user CRUD (tri-mode auth: secret / super admin / org admin)
├── rights-migration.ts → Per-user rights migration for rename, plus clone/bootstrap auto-grants
├── crypto.ts           → PBKDF2 hashing, constant-time compare
├── helpers.ts          → Response helpers, same-origin guard, KV listing, org-shape guard
└── types.ts            → StoredUser / SessionData shapes
```

## Pages

| Route                   | Page             | Access                                                     | Description                                                                              |
| ----------------------- | ---------------- | ---------------------------------------------------------- | ---------------------------------------------------------------------------------------- |
| `/login`                | Login            | Public                                                     | Email/password authentication                                                            |
| `/`                     | Baruch           | Any session                                                | Conversational config assistant                                                          |
| `/modes`                | Modes            | Admins, or shepherds with any mode edit/publish rights     | Markdown editor for prompt modes: create, publish, rename, clone, retire, delete, export |
| `/languages`            | Languages        | Admins, or shepherds with any language edit/publish rights | Markdown editor for per-language tuning documents (new drafts seeded from the scaffold)  |
| `/prompt-configuration` | Prompt Overrides | Admin only (direct URL — no sidebar entry)                 | Org-wide prompt-override slots; includes the user-memory viewer                          |
| `/admin/users`          | Users            | Admin only                                                 | Manage users and their rights (org-scoped; super admins see all orgs)                    |

Shared page features:

- **Markdown editor** (Modes + Languages): CodeMirror with heading TOC, debounced autosave (800 ms), manual Save flush, unsaved-changes guards on navigation / selection switch / org-context switch, and read-only rendering when the user lacks edit rights on the selected row.
- **Org context selector** (Modes, Languages, Prompt Overrides): super admins can switch the pages to any org that has at least one user; the choice persists across the three pages and is sent as `?org=` to the BFF.
- **Test chat panel**: slide-out BT Servant chat (SSE) available on every page. Uses a synthetic per-session test user ID so test conversations never touch the caller's own history, with a mode picker that pins the test user's active mode.
- **User menu**: change password, light/dark theme toggle, sign out, app version.

## Permissions Model

The engine trusts the portal with a single shared API token, so this worker's BFF is the enforcement point for per-user authorization.

- **Org admin** (`isAdmin`): manages users in their own org; can edit any _mode_ in their org (admin trump); can create the _first_ language draft in their org (bootstrap carve-out, with auto-grant of both verbs to the creator) — but existing language documents remain per-row gated even for admins.
- **Super admin** (`isSuperAdmin`): cross-org powers — sees/manages users in every org, moves users between orgs, grants/revokes `isSuperAdmin`, and bypasses per-row gates when operating on _another_ org's config (their home-org rights stay enforced at home).
- **Verb rights** (per user, per resource): `language_edit_rights`, `language_publish_rights`, `mode_edit_rights`, `mode_publish_rights` — each either `"*"` or an array of slugs, assigned via a four-selector matrix in the user dialogs. Edit gates document/label/description changes; publish gates the published flag; delete requires both.
- **Legacy fallback**: the pre-verb-perms `language_rights` field is lazily migrated at session time — it applies only when _both_ language verb fields are unset (setting one verb makes the unset partner an explicit deny, not legacy-full). Modes have no legacy fallback: a non-admin with both mode fields unset has no mode access.
- Sessions re-hydrate from the live user record on every request, so grants, revocations, and org moves take effect immediately (no re-login needed).

### Mode lifecycle (rename / clone / retire)

The Modes page drives the engine's `_rename`, `_clone`, and `_retire` ops through the BFF, which layers rights handling on top:

- **Rename** (needs edit on the source): reslugs the mode in place; the engine keeps the old slug as an alias so end-user assignments aren't stranded. The BFF migrates every same-org user's stored mode rights old-slug→new-slug around the engine call (expand → rename → contract, superset-on-ambiguity so failures can never strand a shepherd).
- **Clone** (needs edit on the source): copies content to a new unpublished slug. Non-admin cloners are auto-granted the verbs they hold on the source (edit always; publish only if held) on the new slug, signalled back via `X-Bootstrap-Grant` and mirrored into the client session.
- **Retire** (needs edit + publish on the source, plus edit on the forward target): moves the retired slug (and its aliases) onto the target's alias list and deletes the source — subscribers silently resolve to the target.
- **Export**: downloads the selected mode (including unsaved edits, label, description, aliases) as a frontmattered Markdown snapshot.

All three ops run fail-closed preflights against the engine (alias-addressing and slug-collision checks) before any rights mutation.

## Development

```bash
npm install        # Install dependencies (Font Awesome Pro registry token required)
npm run dev        # Start Vite dev server
npm run build      # Production build
npm run preview    # Preview via Cloudflare Workers runtime
```

## Quality

```bash
npm run typecheck     # TypeScript type check (project references)
npm run lint          # ESLint (zero warnings)
npm run lint:fix      # ESLint with auto-fix
npm run format        # Prettier format
npm run format:check  # Prettier check (CI)
npm test              # Vitest (worker pool — BFF integration tests + lib unit tests)
npm run test:watch    # Vitest watch mode
```

Pre-commit hooks (via Husky + lint-staged) run ESLint, Prettier, typecheck, and build on every commit. CI additionally runs secret scanning (gitleaks), the test suite, a production-dependency audit, and a bundle-size report.

## Environments

| Environment    | Deploys on                                   | Worker name                       | Engine API               |
| -------------- | -------------------------------------------- | --------------------------------- | ------------------------ |
| **Per-PR dev** | PR opened/updated (`deploy-pr.yml`)          | `bt-servant-admin-portal-pr-<N>`  | staging-api.btservant.ai |
| **Staging**    | PR merged to `main` (`deploy-staging.yml`)   | `bt-servant-admin-portal-staging` | staging-api.btservant.ai |
| **Production** | Manual workflow dispatch (`deploy-prod.yml`) | `bt-servant-admin-portal`         | api.btservant.ai         |

Each open PR gets its own ephemeral worker (URL commented on the PR), torn down by `cleanup-pr.yml` when the PR closes. Docs/mockup-only changes skip deploys. There are no direct deploys from local machines.

Worker configuration (`wrangler.jsonc`): `ENGINE_BASE_URL` / `BARUCH_BASE_URL` vars, `AUTH_KV` KV namespace (users + sessions + login rate limits), and a `BARUCH` service binding (used when available to avoid same-zone subrequest restrictions). Secrets: `ENGINE_API_KEY`, `BARUCH_API_KEY`, `ADMIN_SECRET`.

## Worker BFF Routes

The Cloudflare Worker acts as a BFF, authenticating requests (session cookie + `X-Requested-With` same-origin guard) and forwarding to the engine or Baruch with the shared API keys.

| Route                             | Auth                                                          | Description                                            |
| --------------------------------- | ------------------------------------------------------------- | ------------------------------------------------------ |
| `/api/auth/*`                     | None (login) / session                                        | Login, logout, session check (`/me`), change password  |
| `/api/admin/users[/:email]`       | `X-Admin-Secret` OR admin/super-admin session                 | User CRUD with org scoping and self-lockout guards     |
| `/api/chat/stream`                | Session                                                       | BT Servant SSE streaming                               |
| `/api/chat/history`               | Session                                                       | GET/DELETE chat history                                |
| `/api/chat/memory`                | Session                                                       | DELETE user memory                                     |
| `/api/baruch/*`                   | Session                                                       | Baruch SSE streaming, initiation, history (GET/DELETE) |
| `/api/config/prompt-overrides`    | Session (writes: admin)                                       | Org prompt-override slots                              |
| `/api/config/modes[/:name]`       | Session (writes: verb-perms, admin trump)                     | List/read/write/delete modes                           |
| `/api/config/modes/:name/_rename` | Admin or edit-on-source                                       | Rename + per-user rights migration                     |
| `/api/config/modes/:name/_clone`  | Admin or edit-on-source                                       | Clone + cloner auto-grant                              |
| `/api/config/modes/:name/_retire` | Admin, or edit+publish-on-source + edit-on-target             | Retire-and-forward                                     |
| `/api/config/languages[/:name]`   | Session (writes: verb-perms, no admin trump on existing rows) | List/read/write/delete language documents              |
| `/api/config/language-scaffold`   | Session (read-only)                                           | Org scaffold template for new language drafts          |
| `/api/config/user-mode/:userId`   | Session                                                       | PUT/DELETE the test-chat user's active mode            |
| `/api/config/user-memory/:userId` | Session                                                       | GET/DELETE a user's persistent memory                  |

Notes:

- All `/api/config/*` routes accept `?org=<slug>` — same-org values resolve as if absent; a _different_ org requires `isSuperAdmin` (rejected loudly otherwise).
- Chat `user_id` overrides (used by the test-chat panel's synthetic IDs) are verified against the stored-user list so no authenticated user can read or delete a colleague's history/memory.
- Login and change-password are rate-limited per IP via KV (10 attempts / 5 minutes).

## Bootstrapping a new org

An "org" in the portal is a free-text string on each user record — it "exists" the moment the first user with that org string is created. Two paths:

1. **From the UI as a super admin** — on `/admin/users` the create-user dialog has an editable Org field for super admins. Typing a new slug creates that org with this user as a member. (See "Bootstrapping a super admin" below for how to get the first super admin.)
2. **Via the CLI with `X-Admin-Secret`** — the recovery / CI path, also used before any super admin exists in an environment.

```bash
# Source ADMIN_SECRET from your password manager (1Password example below)
op run -- npm run create-org-admin -- \
  --env staging \
  --org haneen \
  --email haneen@example.com \
  --name "Haneen <last>"

# Other useful flags:
#   --password '...'     supply your own (default: auto-generate 16-char)
#   --rights '*'         "*" (default), "none", or comma-separated language slugs
#   --not-admin          create a non-admin member (default: admin)
#   --confirm-prod       required when --env prod
#   --url <full-url>     override the portal URL (e.g. custom domain)
#   --dry-run            print the request without sending
#   --help               full usage

ADMIN_SECRET=… npm run create-org-admin -- --help
```

On success the script prints the created user and the initial password — share both out-of-band; the user can change the password after first sign-in. `ADMIN_SECRET` is the portal worker's wrangler secret (see `worker/admin.ts` for the auth model); it is never echoed back.

Once the org's first admin exists, they can create their org's first language draft directly from the Languages page — the worker allows same-org admins to create drafts that don't exist yet and auto-grants them edit + publish on the new slug (the user dialogs also surface a "no drafts yet" CTA pointing at the Languages page).

## Bootstrapping a super admin

A super admin has cross-org powers: they see users across every org on `/admin/users`, can create users in any org, can move users between orgs, and can grant/revoke `isSuperAdmin` on others. This is intentionally a small set of people (typically the maintainers).

The first super admin in any environment is granted via a one-time curl against the portal worker with `X-Admin-Secret`. After that, super admins can grant the role to each other from the UI.

```bash
op run -- curl -X PUT \
  https://bt-servant-admin-portal-staging.unfoldingword.workers.dev/api/admin/users/seth@example.com \
  -H "X-Admin-Secret: $ADMIN_SECRET" \
  -H "Content-Type: application/json" \
  -d '{"isSuperAdmin": true}'
```

The grant takes effect on the user's next request (the session re-hydrates from the live user record on every request, so no logout/login is required — but they may need to refresh the page to see the new UI affordances).

Revocation works the same way with `{"isSuperAdmin": false}`. A super admin cannot self-revoke from the UI (the worker rejects with 400 to prevent locking yourself out); use the CLI for that.
