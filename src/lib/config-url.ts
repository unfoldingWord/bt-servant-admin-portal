// Builds a /api/config/* URL with an optional `?org=` query suffix for the
// super-admin cross-org override path. The worker validates and gates the
// param (worker/config.ts `resolveOrg`); the helper exists so every callsite
// shares one encoding rule and the optional-param branching doesn't litter
// each API helper.
//
// Empty/whitespace-only orgs are dropped silently rather than appended — a
// stale `contextOrg` shouldn't poison every URL with a guaranteed-400 param.
// The selector is the only writer in normal flow, but defense-in-depth here
// keeps the contract honest for callers that pass `contextOrg ?? undefined`
// without checking the trim.
export function buildConfigUrl(path: string, org?: string | null): string {
  if (org === undefined || org === null) return path;
  const trimmed = org.trim();
  if (!trimmed) return path;
  return `${path}?org=${encodeURIComponent(trimmed)}`;
}
