export default {
  async fetch(request: Request): Promise<Response> {
    const url = new URL(request.url);

    if (url.pathname.startsWith("/api/")) {
      return new Response(JSON.stringify({ error: "Not implemented" }), {
        status: 501,
        headers: { "Content-Type": "application/json" },
      });
    }

    // Non-API routes are handled by the static asset serving (SPA mode)
    return new Response("Not found", { status: 404 });
  },
};
