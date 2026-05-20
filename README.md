# BT Servant Admin Portal

Admin portal for managing BT Servant worker configurations. Built with React 19 and deployed to Cloudflare Workers.

## Tech Stack

- **Frontend**: React 19, TypeScript (strict), Vite, Tailwind CSS 4
- **UI**: Radix UI primitives, shadcn-style components, Font Awesome Pro (duotone), Lucide React
- **Routing**: React Router v7 (client-side SPA)
- **State**: TanStack React Query v5 (server), Zustand v5 (client)
- **Backend**: Cloudflare Worker BFF (API proxy to BT Servant Engine)
- **Auth**: Session-based with KV storage
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
├── index.ts     → Cloudflare Worker entrypoint & router
├── auth.ts      → Login/logout/session management
├── chat.ts      → Chat SSE streaming & history proxy
├── baruch.ts    → Baruch SSE streaming, initiation & history proxy
├── config.ts    → Modes, languages & prompt-override config proxy
├── admin.ts     → Admin user CRUD
└── helpers.ts   → Response helpers, same-origin guard
```

## Pages

| Route          | Page        | Description                                               |
| -------------- | ----------- | --------------------------------------------------------- |
| `/login`       | Login       | Email/password authentication                             |
| `/`            | Baruch      | Conversational config assistant                           |
| `/modes`       | Modes       | Markdown editor for prompt modes (admin only)             |
| `/languages`   | Languages   | Markdown editor for per-language tuning (language rights) |
| `/admin/users` | Admin Users | Manage users in your org (admin only)                     |

## Development

```bash
npm install        # Install dependencies
npm run dev        # Start Vite dev server
npm run build      # Production build
npm run preview    # Preview via Cloudflare Workers runtime
```

## Quality

```bash
npm run typecheck     # TypeScript type check
npm run lint          # ESLint (zero warnings)
npm run lint:fix      # ESLint with auto-fix
npm run format        # Prettier format
npm run format:check  # Prettier check (CI)
```

Pre-commit hooks (via Husky + lint-staged) run ESLint, Prettier, typecheck, and build on every commit.

## Environments

| Environment    | Deploys on               | Engine API               |
| -------------- | ------------------------ | ------------------------ |
| **Dev**        | PR opened/updated        | staging-api.btservant.ai |
| **Staging**    | Push to `main`           | staging-api.btservant.ai |
| **Production** | Manual workflow dispatch | api.btservant.ai         |

## Worker BFF Routes

The Cloudflare Worker acts as a BFF proxy, authenticating requests and forwarding to the BT Servant Engine API.

| Route           | Auth                       | Description                               |
| --------------- | -------------------------- | ----------------------------------------- |
| `/api/auth/*`   | None                       | Login, logout, session check              |
| `/api/admin/*`  | Admin secret or session    | User CRUD                                 |
| `/api/chat/*`   | Session                    | SSE streaming, history                    |
| `/api/baruch/*` | Session                    | Baruch SSE streaming, initiation, history |
| `/api/config/*` | Session (admin for writes) | Modes, languages, prompt overrides        |

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
