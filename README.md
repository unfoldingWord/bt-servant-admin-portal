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

An "org" in the portal is a free-text string on each user record — it "exists" the moment the first user with that org string is created. Provisioning a new tenant (or any cross-org user creation) goes through the portal worker's `X-Admin-Secret` path, since org-scoped admins can only create users in their own org.

A stopgap CLI wraps the call so operators don't hand-craft curls. (A proper super-admin UI is tracked in [#138](https://github.com/unfoldingWord/bt-servant-admin-portal/issues/138); this script remains the recovery / CI path.)

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
