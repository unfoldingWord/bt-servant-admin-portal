import { env } from "cloudflare:test";
import { describe, expect, it } from "vitest";

import worker from "../worker/index";
import { handleShareConfig } from "../worker/share-config";
import type { SessionData, StoredUser } from "../worker/types";

// #311 — GET /api/share-config. Pins: the gates (same-origin header,
// session, GET only) and the pass-through shape (raw var, empty → null).

const PATH = "https://portal.example.test/api/share-config";

async function seedSession(): Promise<string> {
  const email = `share-${crypto.randomUUID()}@acme.com`;
  const user: StoredUser = {
    id: crypto.randomUUID(),
    email,
    name: "Share Tester",
    org: "acme",
    passwordHash: "unused",
    salt: "unused",
    isAdmin: false,
    isSuperAdmin: false,
  };
  await env.AUTH_KV.put(`user:${email}`, JSON.stringify(user));
  const sessionId = crypto.randomUUID();
  const session: SessionData = {
    userId: user.id,
    email,
    name: user.name,
    org: user.org,
    isAdmin: false,
    isSuperAdmin: false,
    createdAt: new Date().toISOString(),
  };
  await env.AUTH_KV.put(`session:${sessionId}`, JSON.stringify(session));
  return sessionId;
}

function request(init: RequestInit = {}, sessionId?: string): Request {
  const headers = new Headers(init.headers);
  headers.set("X-Requested-With", "XMLHttpRequest");
  if (sessionId) headers.set("Cookie", `session=${sessionId}`);
  return new Request(PATH, { ...init, headers });
}

describe("GET /api/share-config — gates", () => {
  it("403 without the same-origin header", async () => {
    const res = await worker.fetch(new Request(PATH), env);
    expect(res.status).toBe(403);
  });

  it("401 without a session", async () => {
    const res = await worker.fetch(request(), env);
    expect(res.status).toBe(401);
  });

  it("405 for anything but GET, even with a session", async () => {
    const sessionId = await seedSession();
    const res = await worker.fetch(
      request({ method: "POST", body: "{}" }, sessionId),
      env
    );
    expect(res.status).toBe(405);
  });
});

describe("GET /api/share-config — shape", () => {
  it("returns the vars as set (any session, any org)", async () => {
    const sessionId = await seedSession();
    const res = await worker.fetch(request({}, sessionId), env);
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({
      whatsapp_number: "+1 (555) 010-0100",
      whatsapp_org: "acme",
    });
  });

  it("maps empty and whitespace vars to null", () => {
    const res = handleShareConfig({
      ...env,
      WHATSAPP_NUMBER: "   ",
      WHATSAPP_ORG: "",
    });
    return res.json().then((body) => {
      expect(body).toEqual({ whatsapp_number: null, whatsapp_org: null });
    });
  });

  it("maps absent vars to null (deploy without the bindings)", async () => {
    const res = handleShareConfig({
      ...env,
      WHATSAPP_NUMBER: undefined,
      WHATSAPP_ORG: undefined,
    });
    expect(await res.json()).toEqual({
      whatsapp_number: null,
      whatsapp_org: null,
    });
  });
});
