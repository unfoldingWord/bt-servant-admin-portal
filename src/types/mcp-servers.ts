// MCP server pool types (portal #292 / worker#417).
//
// The pool is one shared "library" of MCP servers, global across every org
// (unlike modes/languages). The worker stores it under a single `__global__`
// key and returns a redacted public projection: the bearer `authToken` is
// never serialised — `hasAuthToken` says whether one is stored. Each entry
// carries an `ownerOrg` (worker >= 2.51) that the portal uses to scope edit
// rights; the worker itself does not gate on it.

export type McpTransport = "json-rpc" | "streamable-http";

// One server as returned by the worker's public projection.
export interface McpServer {
  id: string;
  name: string;
  url: string;
  enabled: boolean;
  priority: number;
  // The secret is redacted server-side; this flag is all the UI ever sees.
  hasAuthToken: boolean;
  // The owning org. Present on worker >= 2.51 (defaults to the migrated
  // unfoldingWord pool for pre-#292 entries). Absent when talking to an older
  // worker — the portal then falls back to super-admin-only management.
  ownerOrg?: string;
  allowedTools?: string[];
  transport?: McpTransport;
}

// The `GET …/mcp-servers` envelope. `migrated` is false when the `__global__`
// key doesn't exist yet in this environment: reads still work (served from the
// legacy fallback) but every write returns 409 until the key is written.
export interface McpServerPoolResponse {
  org: string;
  servers: McpServer[];
  migrated: boolean;
  // Present on the not-migrated read: `MCP_POOL_NOT_MIGRATED` + operator hint.
  code?: string;
  warning?: string;
}

// Write shape for add/edit (POST upsert by id). `ownerOrg` is deliberately not
// a write field — the worker stamps it from the acting org on create and
// preserves it on edit. `authToken` is three-way (worker's #278 write rule):
//   - key omitted → preserve whatever is stored for that id
//   - null or ""  → clear the stored token
//   - non-empty   → set it
export interface McpServerWrite {
  id: string;
  name: string;
  url: string;
  enabled: boolean;
  priority: number;
  authToken?: string | null;
  allowedTools?: string[];
  transport?: McpTransport;
}
