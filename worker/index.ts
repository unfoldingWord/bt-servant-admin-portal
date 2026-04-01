import { handleAdmin } from "./admin";
import {
  handleChangePassword,
  handleLogin,
  handleLogout,
  handleMe,
  validateSession,
} from "./auth";
import {
  handleBaruchDeleteHistory,
  handleBaruchHistory,
  handleBaruchInitiate,
  handleBaruchStream,
} from "./baruch";
import {
  handleDeleteHistory,
  handleDeleteMemory,
  handleHistory,
  handleStream,
} from "./chat";
import { handleConfig } from "./config";
import type { Env } from "./helpers";
import { errorResponse, requireSameOrigin } from "./helpers";

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);

    // Auth endpoints (some require session — see individual handlers)
    if (url.pathname.startsWith("/api/auth/")) {
      const blocked = requireSameOrigin(request);
      if (blocked) return blocked;

      if (url.pathname === "/api/auth/login") {
        return handleLogin(request, env);
      }
      if (url.pathname === "/api/auth/logout") {
        return handleLogout(request, env);
      }
      if (url.pathname === "/api/auth/me") {
        return handleMe(request, env);
      }
      if (url.pathname === "/api/auth/change-password") {
        return handleChangePassword(request, env);
      }
      return errorResponse("Not found", 404);
    }

    // Admin endpoints — admin secret required, no same-origin check
    if (url.pathname.startsWith("/api/admin/")) {
      return handleAdmin(request, env, url.pathname);
    }

    // Chat endpoints — session required
    if (
      url.pathname === "/api/chat/stream" ||
      url.pathname === "/api/chat/history" ||
      url.pathname === "/api/chat/memory"
    ) {
      const blocked = requireSameOrigin(request);
      if (blocked) return blocked;

      const session = await validateSession(request, env);
      if (!session) {
        return errorResponse("Unauthorized", 401);
      }

      if (url.pathname === "/api/chat/stream") {
        return handleStream(request, env, session);
      }
      if (url.pathname === "/api/chat/history") {
        if (request.method === "DELETE") {
          return handleDeleteHistory(request, env, session);
        }
        return handleHistory(request, env, session);
      }
      // /api/chat/memory
      if (request.method === "DELETE") {
        return handleDeleteMemory(request, env, session);
      }
      return errorResponse("Method not allowed", 405);
    }

    // Config endpoints — session required
    if (url.pathname.startsWith("/api/config/")) {
      const blocked = requireSameOrigin(request);
      if (blocked) return blocked;

      const session = await validateSession(request, env);
      if (!session) {
        return errorResponse("Unauthorized", 401);
      }

      return handleConfig(request, env, session, url.pathname);
    }

    // Baruch chat endpoints — session required
    if (
      url.pathname === "/api/baruch/stream" ||
      url.pathname === "/api/baruch/history" ||
      url.pathname === "/api/baruch/initiate"
    ) {
      const blocked = requireSameOrigin(request);
      if (blocked) return blocked;

      const session = await validateSession(request, env);
      if (!session) {
        return errorResponse("Unauthorized", 401);
      }

      if (url.pathname === "/api/baruch/stream") {
        return handleBaruchStream(request, env, session);
      }
      if (url.pathname === "/api/baruch/initiate") {
        return handleBaruchInitiate(request, env, session);
      }
      // /api/baruch/history
      if (request.method === "DELETE") {
        return handleBaruchDeleteHistory(request, env, session);
      }
      return handleBaruchHistory(request, env, session);
    }

    if (url.pathname.startsWith("/api/")) {
      return errorResponse("Not found", 404);
    }

    // Non-API routes are handled by the static asset serving (SPA mode)
    return new Response("Not found", { status: 404 });
  },
};
