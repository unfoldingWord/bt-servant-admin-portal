// Resource URLs originate from third-party MCP servers (aquifer,
// translation-helps) relayed by the worker — untrusted input as far as the
// portal's origin is concerned. Only absolute http(s) URLs may reach an
// <a href>: a compromised or misbehaving server must not be able to smuggle
// javascript:/data:/etc. into the DOM. React's javascript:-URL mitigation is
// a console error, not a guarantee, and it doesn't cover data: at all.
export function safeResourceHref(url: string | undefined): string | undefined {
  if (!url) return undefined;
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    // Relative or malformed — every legitimate source link in the worker
    // contract is absolute, so reject rather than resolve against our origin.
    return undefined;
  }
  return parsed.protocol === "http:" || parsed.protocol === "https:"
    ? url
    : undefined;
}
