import type { Env } from "./helpers";
import { errorResponse, jsonResponse, listKvKeys } from "./helpers";
import type { SessionData, StoredUser } from "./types";

const CLIENT_ID = "admin-portal";

const UUID_V4_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

// The user_id override exists for the test-chat panel: the portal mints a
// synthetic UUID per session (ui-store testChatUserId) so test
// conversations don't touch the caller's own history. Synthetic and real
// IDs are indistinguishable by shape — portal user IDs are ALSO
// crypto.randomUUID() (worker/admin.ts) — so shape alone was an IDOR:
// any authenticated user could read or delete a colleague's history/
// memory by passing their user ID, and under the trusted-portal model
// (single shared engine key) this worker is the only enforcement point
// (#253 review). An override is therefore rejected when it matches any
// OTHER portal user's stored id; synthetic test IDs match nobody and
// pass. Residual: engine-side IDs the portal doesn't store (e.g.
// messaging end-users) can't be checked here.
//
// Per-isolate memo of ids already verified as matching no stored user,
// so the test-chat panel doesn't pay a full user scan per message.
// Sound because stored ids are minted server-side (crypto.randomUUID at
// create) — an id that matched nobody can't become a stored user's id
// later. Cleared wholesale at a size cap; it's an optimization, not
// state anything depends on.
const verifiedSyntheticIds = new Set<string>();
const VERIFIED_SYNTHETIC_IDS_CAP = 256;

async function resolveUserId(
  env: Env,
  override: string | null | undefined,
  session: SessionData
): Promise<{ userId: string } | { error: Response }> {
  if (!override || !UUID_V4_RE.test(override)) {
    return { userId: session.userId };
  }
  // Compare lowercased: UUID_V4_RE accepts uppercase hex, and stored ids
  // (crypto.randomUUID) are lowercase — a case-sensitive compare would
  // let an uppercased copy of a victim's id slip past both checks and
  // reach the engine (#253 review round 6). Comparisons only: the
  // FORWARDED id stays verbatim, because a non-matching override may be
  // an engine-side id the portal doesn't store, and case-folding one of
  // those would silently retarget the request (round 7).
  const normalized = override.toLowerCase();
  if (normalized === session.userId.toLowerCase()) {
    return { userId: session.userId };
  }
  if (verifiedSyntheticIds.has(normalized)) {
    return { userId: override };
  }
  // Fail CLOSED on a KV blip: this is a security guard, and failing open
  // would let an induced storage error bypass it. The 503 is retryable
  // and scoped to overridden requests (test-chat panel); non-overridden
  // traffic never enters this branch.
  try {
    const keys = await listKvKeys(env.AUTH_KV, "user:");
    // Parallel like admin.ts listUsers — a serial loop would put N
    // round-trips on the chat hot path.
    const users = await Promise.all(
      keys.map((key) => env.AUTH_KV.get<StoredUser>(key, { type: "json" }))
    );
    if (
      users.some(
        // typeof guard: a malformed record whose id is absent must scan
        // past, not throw into the catch below — one corrupt KV entry
        // would otherwise turn every overridden request into a
        // permanent 'retryable' 503 (round 7).
        (user) =>
          typeof user?.id === "string" && user.id.toLowerCase() === normalized
      )
    ) {
      return {
        error: errorResponse("user_id may not target another user", 403),
      };
    }
  } catch (error) {
    console.error("user_id verification scan failed:", error);
    return {
      error: errorResponse("Could not verify user_id; try again", 503),
    };
  }
  if (verifiedSyntheticIds.size >= VERIFIED_SYNTHETIC_IDS_CAP) {
    verifiedSyntheticIds.clear();
  }
  verifiedSyntheticIds.add(normalized);
  return { userId: override };
}

export async function handleStream(
  request: Request,
  env: Env,
  session: SessionData
): Promise<Response> {
  if (request.method !== "POST") {
    return errorResponse("Method not allowed", 405);
  }

  let body: { message?: string; message_type?: string; user_id?: string };
  try {
    body = (await request.json()) as typeof body;
  } catch {
    return errorResponse("Invalid JSON", 400);
  }

  if (!body.message) {
    return errorResponse("Missing 'message' field", 400);
  }

  const resolvedUser = await resolveUserId(env, body.user_id, session);
  if ("error" in resolvedUser) return resolvedUser.error;

  const engineUrl = `${env.ENGINE_BASE_URL}/api/v1/chat/stream`;
  const engineBody = {
    message: body.message,
    message_type: body.message_type || "text",
    user_id: resolvedUser.userId,
    org: session.org,
    client_id: CLIENT_ID,
  };

  const engineRes = await fetch(engineUrl, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${env.ENGINE_API_KEY}`,
    },
    body: JSON.stringify(engineBody),
  });

  if (!engineRes.ok) {
    const text = await engineRes.text().catch(() => "");
    console.error(
      `Engine stream failed (${engineRes.status}) ${engineUrl}: ${text}`
    );
    return errorResponse("Failed to stream chat response", 502);
  }

  return new Response(engineRes.body, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
    },
  });
}

export async function handleHistory(
  request: Request,
  env: Env,
  session: SessionData
): Promise<Response> {
  if (request.method !== "GET") {
    return errorResponse("Method not allowed", 405);
  }

  const url = new URL(request.url);
  const limit = String(
    Math.min(
      Math.max(parseInt(url.searchParams.get("limit") || "50", 10) || 50, 1),
      100
    )
  );
  const offset = String(
    Math.max(parseInt(url.searchParams.get("offset") || "0", 10) || 0, 0)
  );

  const resolvedUser = await resolveUserId(
    env,
    url.searchParams.get("user_id"),
    session
  );
  if ("error" in resolvedUser) return resolvedUser.error;
  const userId = resolvedUser.userId;
  const params = new URLSearchParams({ limit, offset });
  const engineUrl = `${env.ENGINE_BASE_URL}/api/v1/orgs/${encodeURIComponent(session.org)}/users/${userId}/history?${params.toString()}`;

  const engineRes = await fetch(engineUrl, {
    headers: {
      Authorization: `Bearer ${env.ENGINE_API_KEY}`,
    },
  });

  if (!engineRes.ok) {
    const text = await engineRes.text().catch(() => "");
    console.error(`Engine history failed (${engineRes.status}): ${text}`);
    return errorResponse("Failed to fetch history", 502);
  }

  const data: unknown = await engineRes.json();
  if (
    !data ||
    typeof data !== "object" ||
    !("entries" in data) ||
    !Array.isArray((data as { entries: unknown }).entries)
  ) {
    console.error("Engine history returned unexpected shape:", data);
    return errorResponse("Unexpected engine response", 502);
  }

  return jsonResponse(data);
}

export async function handleDeleteHistory(
  request: Request,
  env: Env,
  session: SessionData
): Promise<Response> {
  if (request.method !== "DELETE") {
    return errorResponse("Method not allowed", 405);
  }

  const url = new URL(request.url);
  const resolvedUser = await resolveUserId(
    env,
    url.searchParams.get("user_id"),
    session
  );
  if ("error" in resolvedUser) return resolvedUser.error;
  const userId = resolvedUser.userId;
  const engineUrl = `${env.ENGINE_BASE_URL}/api/v1/admin/orgs/${encodeURIComponent(session.org)}/users/${userId}/history`;

  const engineRes = await fetch(engineUrl, {
    method: "DELETE",
    headers: {
      Authorization: `Bearer ${env.ENGINE_API_KEY}`,
    },
  });

  if (!engineRes.ok) {
    const text = await engineRes.text().catch(() => "");
    console.error(
      `Engine delete history failed (${engineRes.status}): ${text}`
    );
    return errorResponse("Failed to delete history", 502);
  }

  return jsonResponse({ success: true });
}

export async function handleDeleteMemory(
  request: Request,
  env: Env,
  session: SessionData
): Promise<Response> {
  if (request.method !== "DELETE") {
    return errorResponse("Method not allowed", 405);
  }

  const url = new URL(request.url);
  const resolvedUser = await resolveUserId(
    env,
    url.searchParams.get("user_id"),
    session
  );
  if ("error" in resolvedUser) return resolvedUser.error;
  const userId = resolvedUser.userId;
  const engineUrl = `${env.ENGINE_BASE_URL}/api/v1/admin/orgs/${encodeURIComponent(session.org)}/users/${userId}/memory`;

  const engineRes = await fetch(engineUrl, {
    method: "DELETE",
    headers: {
      Authorization: `Bearer ${env.ENGINE_API_KEY}`,
    },
  });

  if (!engineRes.ok) {
    const text = await engineRes.text().catch(() => "");
    console.error(`Engine delete memory failed (${engineRes.status}): ${text}`);
    return errorResponse("Failed to delete memory", 502);
  }

  return jsonResponse({ success: true });
}
