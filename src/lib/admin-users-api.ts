import type {
  AdminUser,
  CreateUserBody,
  UpdateUserBody,
} from "@/types/admin-users";

// X-Requested-With is the same-origin marker the worker requires on the
// cookie-auth path (see worker/admin.ts requireAdminAuth). All admin user
// requests from the browser must include it.
const SAME_ORIGIN_HEADERS = {
  "X-Requested-With": "XMLHttpRequest",
} as const;

// Thrown when the worker returns 403 on an admin user operation. Most
// commonly this means the caller isn't isAdmin (or session expired) — but
// also fires for cross-org create attempts and move-org refusals.
export class AdminUsersForbiddenError extends Error {
  constructor(public readonly serverMessage?: string) {
    super(serverMessage ?? "Forbidden");
    this.name = "AdminUsersForbiddenError";
  }
}

// Thrown for 4xx that aren't 403 (e.g. 400 on self-demote/self-delete, 409
// on duplicate email, 404 on cross-org or missing target). serverMessage
// is the response body's `error` field if present.
export class AdminUsersRequestError extends Error {
  constructor(
    public readonly status: number,
    public readonly serverMessage?: string
  ) {
    super(serverMessage ?? `Request failed (${status})`);
    this.name = "AdminUsersRequestError";
  }
}

async function readErrorMessage(res: Response): Promise<string | undefined> {
  try {
    const body = (await res.json()) as { error?: string };
    return body.error;
  } catch {
    return undefined;
  }
}

async function throwForStatus(res: Response): Promise<never> {
  const message = await readErrorMessage(res);
  if (res.status === 403) throw new AdminUsersForbiddenError(message);
  throw new AdminUsersRequestError(res.status, message);
}

export async function listAdminUsers(
  signal?: AbortSignal
): Promise<AdminUser[]> {
  const res = await fetch("/api/admin/users", {
    headers: SAME_ORIGIN_HEADERS,
    signal,
  });
  if (!res.ok) await throwForStatus(res);
  const data = (await res.json()) as { users: AdminUser[] };
  return data.users;
}

export async function createAdminUser(
  body: CreateUserBody,
  signal?: AbortSignal
): Promise<AdminUser> {
  const res = await fetch("/api/admin/users", {
    method: "POST",
    headers: { "Content-Type": "application/json", ...SAME_ORIGIN_HEADERS },
    body: JSON.stringify(body),
    signal,
  });
  if (!res.ok) await throwForStatus(res);
  const data = (await res.json()) as { user: AdminUser };
  return data.user;
}

export async function updateAdminUser(
  email: string,
  body: UpdateUserBody,
  signal?: AbortSignal
): Promise<AdminUser> {
  const res = await fetch(`/api/admin/users/${encodeURIComponent(email)}`, {
    method: "PUT",
    headers: { "Content-Type": "application/json", ...SAME_ORIGIN_HEADERS },
    body: JSON.stringify(body),
    signal,
  });
  if (!res.ok) await throwForStatus(res);
  const data = (await res.json()) as { user: AdminUser };
  return data.user;
}

export async function deleteAdminUser(
  email: string,
  signal?: AbortSignal
): Promise<void> {
  const res = await fetch(`/api/admin/users/${encodeURIComponent(email)}`, {
    method: "DELETE",
    headers: SAME_ORIGIN_HEADERS,
    signal,
  });
  if (!res.ok) await throwForStatus(res);
}
