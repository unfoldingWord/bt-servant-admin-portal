import { afterEach, describe, expect, it, vi } from "vitest";

import {
  AdminUsersForbiddenError,
  AdminUsersRequestError,
  createAdminUser,
  deleteAdminUser,
  listAdminUsers,
  updateAdminUser,
} from "../src/lib/admin-users-api";

afterEach(() => {
  vi.restoreAllMocks();
});

function mockFetchOnce(status: number, body: unknown): void {
  vi.spyOn(globalThis, "fetch").mockResolvedValueOnce(
    new Response(typeof body === "string" ? body : JSON.stringify(body), {
      status,
      headers: { "Content-Type": "application/json" },
    })
  );
}

const SAMPLE_USER = {
  id: "abc-123",
  email: "alice@acme.com",
  name: "Alice",
  org: "acme",
  isAdmin: true,
};

describe("listAdminUsers", () => {
  it("returns `data.users` from the JSON envelope", async () => {
    mockFetchOnce(200, { users: [SAMPLE_USER] });
    const users = await listAdminUsers();
    expect(users).toEqual([SAMPLE_USER]);
  });

  it("sends X-Requested-With on the same-origin marker", async () => {
    const spy = vi
      .spyOn(globalThis, "fetch")
      .mockResolvedValueOnce(new Response(JSON.stringify({ users: [] })));
    await listAdminUsers();
    const init = spy.mock.calls[0]![1] as RequestInit;
    expect((init.headers as Record<string, string>)["X-Requested-With"]).toBe(
      "XMLHttpRequest"
    );
  });

  it("throws AdminUsersForbiddenError on 403", async () => {
    mockFetchOnce(403, { error: "Forbidden" });
    await expect(listAdminUsers()).rejects.toBeInstanceOf(
      AdminUsersForbiddenError
    );
  });

  it("throws AdminUsersRequestError with status preserved on non-403 4xx", async () => {
    mockFetchOnce(401, { error: "Unauthorized" });
    await expect(listAdminUsers()).rejects.toMatchObject({
      name: "AdminUsersRequestError",
      status: 401,
    });
  });
});

describe("createAdminUser", () => {
  it("sends the body as JSON via POST and returns `data.user`", async () => {
    const spy = vi
      .spyOn(globalThis, "fetch")
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ user: SAMPLE_USER }), { status: 201 })
      );
    const body = {
      email: "alice@acme.com",
      password: "exactly8c",
      name: "Alice",
      org: "acme",
    };
    const result = await createAdminUser(body);
    expect(result).toEqual(SAMPLE_USER);
    const init = spy.mock.calls[0]![1] as RequestInit;
    expect(init.method).toBe("POST");
    expect(JSON.parse(init.body as string)).toEqual(body);
    expect((init.headers as Record<string, string>)["Content-Type"]).toBe(
      "application/json"
    );
  });

  it("AdminUsersForbiddenError surfaces the server's error message", async () => {
    mockFetchOnce(403, { error: "Cannot create user outside your org (acme)" });
    try {
      await createAdminUser({
        email: "x@other.com",
        password: "exactly8c",
        name: "X",
        org: "other",
      });
      throw new Error("expected rejection");
    } catch (e) {
      expect(e).toBeInstanceOf(AdminUsersForbiddenError);
      const err = e as AdminUsersForbiddenError;
      expect(err.serverMessage).toBe(
        "Cannot create user outside your org (acme)"
      );
      expect(err.message).toBe("Cannot create user outside your org (acme)");
    }
  });

  it("AdminUsersRequestError preserves status on 409 duplicate", async () => {
    mockFetchOnce(409, { error: "User already exists" });
    try {
      await createAdminUser({
        email: "alice@acme.com",
        password: "exactly8c",
        name: "Alice",
        org: "acme",
      });
      throw new Error("expected rejection");
    } catch (e) {
      expect(e).toBeInstanceOf(AdminUsersRequestError);
      const err = e as AdminUsersRequestError;
      expect(err.status).toBe(409);
      expect(err.serverMessage).toBe("User already exists");
    }
  });
});

describe("updateAdminUser", () => {
  it("URL-encodes the email in the path and sends PUT", async () => {
    const spy = vi
      .spyOn(globalThis, "fetch")
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ user: SAMPLE_USER }))
      );
    await updateAdminUser("user+tag@acme.com", { name: "Updated" });
    expect(spy.mock.calls[0]![0]).toBe(
      "/api/admin/users/user%2Btag%40acme.com"
    );
    expect((spy.mock.calls[0]![1] as RequestInit).method).toBe("PUT");
  });

  it("returns `data.user` on success", async () => {
    mockFetchOnce(200, { user: SAMPLE_USER });
    const result = await updateAdminUser("alice@acme.com", { name: "Alice" });
    expect(result).toEqual(SAMPLE_USER);
  });

  it("400 self-demote → AdminUsersRequestError with status", async () => {
    mockFetchOnce(400, { error: "Cannot demote yourself" });
    await expect(
      updateAdminUser("alice@acme.com", { isAdmin: false })
    ).rejects.toMatchObject({
      name: "AdminUsersRequestError",
      status: 400,
    });
  });

  it("404 cross-org → AdminUsersRequestError (not Forbidden)", async () => {
    // Worker returns 404 (not 403) on cross-org targets to avoid existence
    // enumeration. The client must surface it as a request error, not a
    // forbidden error, so the dialog renders the right copy.
    mockFetchOnce(404, { error: "User not found" });
    await expect(
      updateAdminUser("carol@other.com", { name: "X" })
    ).rejects.toMatchObject({
      name: "AdminUsersRequestError",
      status: 404,
    });
  });
});

describe("deleteAdminUser", () => {
  it("sends DELETE and URL-encodes the email", async () => {
    const spy = vi
      .spyOn(globalThis, "fetch")
      .mockResolvedValueOnce(new Response("{}", { status: 200 }));
    await deleteAdminUser("user+tag@acme.com");
    expect(spy.mock.calls[0]![0]).toBe(
      "/api/admin/users/user%2Btag%40acme.com"
    );
    expect((spy.mock.calls[0]![1] as RequestInit).method).toBe("DELETE");
  });

  it("403 → AdminUsersForbiddenError", async () => {
    mockFetchOnce(403, { error: "Forbidden" });
    await expect(deleteAdminUser("alice@acme.com")).rejects.toBeInstanceOf(
      AdminUsersForbiddenError
    );
  });

  it("400 self-delete → AdminUsersRequestError", async () => {
    mockFetchOnce(400, { error: "Cannot delete yourself" });
    await expect(deleteAdminUser("alice@acme.com")).rejects.toMatchObject({
      name: "AdminUsersRequestError",
      status: 400,
    });
  });
});

describe("error parsing edge cases", () => {
  it("readErrorMessage tolerates a non-JSON error body (undefined message)", async () => {
    // The worker returns JSON via errorResponse, but defense-in-depth: if a
    // proxy or CDN ever rewrites the body to HTML/plaintext, the client must
    // not crash on the JSON parse.
    vi.spyOn(globalThis, "fetch").mockResolvedValueOnce(
      new Response("<html>oops</html>", {
        status: 500,
        headers: { "Content-Type": "text/html" },
      })
    );
    try {
      await listAdminUsers();
      throw new Error("expected rejection");
    } catch (e) {
      expect(e).toBeInstanceOf(AdminUsersRequestError);
      const err = e as AdminUsersRequestError;
      expect(err.status).toBe(500);
      expect(err.serverMessage).toBeUndefined();
      // Falls back to the default "Request failed (500)" message.
      expect(err.message).toBe("Request failed (500)");
    }
  });
});
