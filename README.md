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
├── config.ts    → Prompt override & mode config proxy
├── admin.ts     → Admin user CRUD
└── helpers.ts   → Response helpers, same-origin guard
```

## Pages

| Route            | Page                 | Description                     |
| ---------------- | -------------------- | ------------------------------- |
| `/login`         | Login                | Email/password authentication   |
| `/`              | Baruch               | Conversational config assistant |
| `/manual-config` | Prompt Configuration | Manage prompt overrides & modes |

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

| Route           | Auth         | Description                               |
| --------------- | ------------ | ----------------------------------------- |
| `/api/auth/*`   | None         | Login, logout, session check              |
| `/api/admin/*`  | Admin secret | User CRUD                                 |
| `/api/chat/*`   | Session      | SSE streaming, history                    |
| `/api/baruch/*` | Session      | Baruch SSE streaming, initiation, history |
| `/api/config/*` | Session      | Prompt overrides, modes, default mode     |
