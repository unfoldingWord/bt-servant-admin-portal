import type {
  McpServerPoolResponse,
  McpServerWrite,
} from "@/types/mcp-servers";

// X-Requested-With is the same-origin marker the worker requires on the
// cookie-auth path. Every MCP-servers request from the browser includes it.
const SAME_ORIGIN_HEADERS = {
  "X-Requested-With": "XMLHttpRequest",
} as const;

// Thrown when the BFF returns 403 — the caller lacks the rights for this
// operation (not an admin, editing a server owned by another org, or a
// non-super-admin attempting a delete).
export class McpServersForbiddenError extends Error {
  constructor(public readonly serverMessage?: string) {
    super(serverMessage ?? "Forbidden");
    this.name = "McpServersForbiddenError";
  }
}

// Thrown when the pool hasn't been migrated in this environment: the
// `__global__` key doesn't exist yet, so the worker refuses writes with 409
// `MCP_POOL_NOT_MIGRATED`. Reads still succeed. Surfaced distinctly so the UI
// can explain the environment state rather than showing a generic failure.
export class McpPoolNotMigratedError extends Error {
  constructor(public readonly serverMessage?: string) {
    super(serverMessage ?? "The MCP server pool has not been migrated yet.");
    this.name = "McpPoolNotMigratedError";
  }
}

// Thrown for other 4xx/5xx (400 validation, 404, 500). serverMessage is the
// response body's `error` field when present.
export class McpServersRequestError extends Error {
  constructor(
    public readonly status: number,
    public readonly serverMessage?: string
  ) {
    super(serverMessage ?? `Request failed (${status})`);
    this.name = "McpServersRequestError";
  }
}

interface ErrorBody {
  error?: string;
  code?: string;
}

async function readErrorBody(res: Response): Promise<ErrorBody> {
  try {
    return (await res.json()) as ErrorBody;
  } catch {
    return {};
  }
}

async function throwForStatus(res: Response): Promise<never> {
  const body = await readErrorBody(res);
  if (res.status === 403) throw new McpServersForbiddenError(body.error);
  if (res.status === 409 && body.code === "MCP_POOL_NOT_MIGRATED") {
    throw new McpPoolNotMigratedError(body.error);
  }
  throw new McpServersRequestError(res.status, body.error);
}

// Every request targets the caller's own org — the BFF resolves that from the
// session. The pool is global, so there's no org to pass from the client.
export async function getMcpServers(
  signal?: AbortSignal
): Promise<McpServerPoolResponse> {
  const res = await fetch("/api/config/mcp-servers", {
    headers: SAME_ORIGIN_HEADERS,
    signal,
  });
  if (!res.ok) await throwForStatus(res);
  return (await res.json()) as McpServerPoolResponse;
}

// Add or edit a server. The worker upserts by `id`: a new id appends, an
// existing id replaces in place (token and owner preserved unless changed).
// The success body (the updated pool) is not read: the hooks refetch, and
// parsing it would turn an empty/204 success into a spurious error.
export async function upsertMcpServer(
  body: McpServerWrite,
  signal?: AbortSignal
): Promise<void> {
  const res = await fetch("/api/config/mcp-servers", {
    method: "POST",
    headers: { "Content-Type": "application/json", ...SAME_ORIGIN_HEADERS },
    body: JSON.stringify(body),
    signal,
  });
  if (!res.ok) await throwForStatus(res);
}

export async function deleteMcpServer(
  id: string,
  signal?: AbortSignal
): Promise<void> {
  const res = await fetch(`/api/config/mcp-servers/${encodeURIComponent(id)}`, {
    method: "DELETE",
    headers: SAME_ORIGIN_HEADERS,
    signal,
  });
  if (!res.ok) await throwForStatus(res);
}
