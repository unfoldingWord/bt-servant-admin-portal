import type { AuthUser } from "@/types/auth";

const SAME_ORIGIN_HEADERS = {
  "X-Requested-With": "XMLHttpRequest",
} as const;

interface AuthResponse {
  user: AuthUser;
}

export async function login(
  email: string,
  password: string
): Promise<AuthUser> {
  const res = await fetch("/api/auth/login", {
    method: "POST",
    headers: { "Content-Type": "application/json", ...SAME_ORIGIN_HEADERS },
    body: JSON.stringify({ email, password }),
  });

  if (!res.ok) {
    const body = await res.json().catch(() => ({ error: "Login failed" }));
    throw new Error(
      (body as { error?: string }).error || `Login failed (${res.status})`
    );
  }

  const data = (await res.json()) as AuthResponse;
  return data.user;
}

export async function logout(): Promise<void> {
  await fetch("/api/auth/logout", {
    method: "POST",
    headers: SAME_ORIGIN_HEADERS,
  });
}

export async function changePassword(
  currentPassword: string,
  newPassword: string
): Promise<void> {
  const res = await fetch("/api/auth/change-password", {
    method: "POST",
    headers: { "Content-Type": "application/json", ...SAME_ORIGIN_HEADERS },
    body: JSON.stringify({ currentPassword, newPassword }),
  });

  if (!res.ok) {
    const body = await res
      .json()
      .catch(() => ({ error: "Failed to change password" }));
    throw new Error(
      (body as { error?: string }).error ||
        `Failed to change password (${res.status})`
    );
  }
}

export async function fetchMe(): Promise<AuthUser | null> {
  const res = await fetch("/api/auth/me", {
    headers: SAME_ORIGIN_HEADERS,
  });

  if (res.status === 401) return null;

  if (!res.ok) {
    throw new Error(`Session check failed (${res.status})`);
  }

  const data = (await res.json()) as AuthResponse;
  return data.user;
}
