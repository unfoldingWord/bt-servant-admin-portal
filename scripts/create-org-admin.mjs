#!/usr/bin/env node
// Stopgap CLI for bootstrapping a new tenant org (or adding any user) via the
// portal worker's X-Admin-Secret path. Tracks issue #139.
//
// Replaces hand-crafted curls. The proper super-admin UI is tracked in #138;
// keep this script as the recovery / CI path even once that ships, symmetric
// to the worker's X-Admin-Secret CLI escape.

import { randomBytes } from "node:crypto";
import { parseArgs } from "node:util";

const PORTAL_URLS = {
  dev: "https://bt-servant-admin-portal-dev.unfoldingword.workers.dev",
  staging: "https://bt-servant-admin-portal-staging.unfoldingword.workers.dev",
  // Best-guess workers.dev URL — override with --url if a custom domain is in use.
  prod: "https://bt-servant-admin-portal.unfoldingword.workers.dev",
};

const USAGE = `Usage: npm run create-org-admin -- [options]

Bootstrap a new tenant org (or add any user) via the portal worker's
X-Admin-Secret path. An org "exists" the moment the first user with that
org string is created — there is no separate "create org" step.

Required:
  --email <email>           User email
  --name <name>             Full name (wrap in quotes if it contains spaces)
  --org <slug>              Org slug (free-text; becomes the org if new)

Optional:
  --env <dev|staging|prod>  Target environment (default: staging)
  --url <url>               Override the portal URL (wins over --env)
  --password <pw>           Initial password (default: auto-generate 16-char)
  --rights <rights>         Language rights: "*" (default), "none", or a
                            comma-separated list of language slugs
  --not-admin               Set isAdmin: false (default: true — first user of
                            a new org typically needs admin to self-administer)
  --confirm-prod            Required when --env prod (guards against typos)
  --dry-run                 Print the request that would be made and exit
  --help, -h                Show this help

Environment:
  ADMIN_SECRET              The portal worker's X-Admin-Secret value.
                            Required. Never echoed.

Examples:
  ADMIN_SECRET=... npm run create-org-admin -- \\
    --env staging --org haneen --email haneen@example.com --name "Haneen X"

  op run -- npm run create-org-admin -- \\
    --env prod --confirm-prod --org haneen --email haneen@example.com --name "Haneen X"

  # Dry run to inspect the constructed request
  ADMIN_SECRET=stub npm run create-org-admin -- --dry-run \\
    --env staging --org haneen --email haneen@example.com --name "Haneen X"
`;

function fail(message, exitCode = 1) {
  process.stderr.write(`error: ${message}\n`);
  process.exit(exitCode);
}

/**
 * Generate a 16-character URL-safe password (96 bits of entropy).
 * @returns {string}
 */
export function generatePassword() {
  return randomBytes(12).toString("base64url");
}

/**
 * Parse the --rights flag into the worker's expected language_rights shape.
 * Returns "*" for full access, [] for no access, or string[] for a list.
 * @param {string | undefined} value
 * @returns {"*" | string[]}
 */
export function parseRights(value) {
  if (value === undefined) return "*";
  const trimmed = value.trim();
  if (trimmed === "*") return "*";
  if (trimmed === "" || trimmed.toLowerCase() === "none") return [];
  return trimmed
    .split(",")
    .map((s) => s.trim())
    .filter((s) => s.length > 0);
}

/**
 * Resolve the portal URL from --url (wins) or --env. Strips trailing slash.
 * @param {{ url?: string, env?: string }} args
 * @returns {string}
 */
export function resolvePortalUrl({ url, env }) {
  if (url) return url.replace(/\/+$/, "");
  const target = env ?? "staging";
  const resolved = PORTAL_URLS[target];
  if (!resolved) {
    throw new Error(
      `Unknown --env "${target}". Expected one of: ${Object.keys(PORTAL_URLS).join(", ")}.`
    );
  }
  return resolved;
}

/**
 * Build the request body sent to POST /api/admin/users.
 * @param {{
 *   email: string,
 *   name: string,
 *   org: string,
 *   password: string,
 *   isAdmin: boolean,
 *   rights: "*" | string[],
 * }} args
 */
export function buildPayload({ email, name, org, password, isAdmin, rights }) {
  return {
    email: email.trim().toLowerCase(),
    name: name.trim(),
    org: org.trim(),
    password,
    isAdmin,
    language_rights: rights,
  };
}

async function main() {
  let parsed;
  try {
    parsed = parseArgs({
      options: {
        email: { type: "string" },
        name: { type: "string" },
        org: { type: "string" },
        env: { type: "string" },
        url: { type: "string" },
        password: { type: "string" },
        rights: { type: "string" },
        "not-admin": { type: "boolean", default: false },
        "confirm-prod": { type: "boolean", default: false },
        "dry-run": { type: "boolean", default: false },
        help: { type: "boolean", short: "h", default: false },
      },
      strict: true,
      allowPositionals: false,
    });
  } catch (err) {
    process.stderr.write(USAGE);
    fail(err instanceof Error ? err.message : String(err));
    return;
  }

  const { values } = parsed;

  if (values.help) {
    process.stdout.write(USAGE);
    return;
  }

  const missing = ["email", "name", "org"].filter((k) => !values[k]);
  if (missing.length > 0) {
    process.stderr.write(USAGE);
    fail(`Missing required: ${missing.map((k) => `--${k}`).join(", ")}`);
    return;
  }

  const env = values.env ?? "staging";
  if (env === "prod" && !values["confirm-prod"] && !values["dry-run"]) {
    fail(
      "Refusing to target prod without --confirm-prod. Re-run with --confirm-prod once you have verified the org slug, email, and that this is the right environment."
    );
    return;
  }

  const adminSecret = process.env.ADMIN_SECRET;
  if (!adminSecret && !values["dry-run"]) {
    fail(
      "ADMIN_SECRET env var is required. Source it from your password manager (e.g. `op run -- npm run create-org-admin -- ...`)."
    );
    return;
  }

  let portalUrl;
  try {
    portalUrl = resolvePortalUrl({ url: values.url, env });
  } catch (err) {
    fail(err instanceof Error ? err.message : String(err));
    return;
  }

  const password = values.password ?? generatePassword();
  const payload = buildPayload({
    email: values.email,
    name: values.name,
    org: values.org,
    password,
    isAdmin: !values["not-admin"],
    rights: parseRights(values.rights),
  });

  const endpoint = `${portalUrl}/api/admin/users`;

  if (values["dry-run"]) {
    process.stdout.write(
      [
        "DRY RUN — no request sent.",
        "",
        `  endpoint: POST ${endpoint}`,
        `  headers:  X-Admin-Secret: <redacted${adminSecret ? "" : "; not set"}>`,
        `            Content-Type: application/json`,
        `  body:     ${JSON.stringify({ ...payload, password: "<redacted>" }, null, 2).replace(/\n/g, "\n            ")}`,
        "",
        `  password (would be sent): ${password}`,
        "",
      ].join("\n")
    );
    return;
  }

  let res;
  try {
    res = await fetch(endpoint, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Admin-Secret": adminSecret,
      },
      body: JSON.stringify(payload),
    });
  } catch (err) {
    fail(
      `Network error reaching ${endpoint}: ${err instanceof Error ? err.message : String(err)}`
    );
    return;
  }

  const rawBody = await res.text();
  let body;
  try {
    body = rawBody ? JSON.parse(rawBody) : null;
  } catch {
    body = rawBody;
  }

  if (!res.ok) {
    const hint =
      res.status === 401
        ? " (bad ADMIN_SECRET — verify it matches the portal worker's wrangler secret for this env)"
        : res.status === 409
          ? " (user with that email already exists)"
          : "";
    process.stderr.write(
      `HTTP ${res.status}${hint}\n${
        typeof body === "string" ? body : JSON.stringify(body, null, 2)
      }\n`
    );
    process.exit(1);
  }

  const created = (body && typeof body === "object" && body.user) || null;
  process.stdout.write(
    [
      "Created user.",
      "",
      `  env:       ${env}`,
      `  endpoint:  ${endpoint}`,
      `  email:     ${created?.email ?? payload.email}`,
      `  name:      ${created?.name ?? payload.name}`,
      `  org:       ${created?.org ?? payload.org}`,
      `  isAdmin:   ${created?.isAdmin ?? payload.isAdmin}`,
      `  rights:    ${JSON.stringify(created?.language_rights ?? payload.language_rights)}`,
      "",
      `  password:  ${password}`,
      "",
      "Share the email + password with the user out-of-band. They can",
      "change the password after first sign-in.",
      "",
    ].join("\n")
  );
}

// Only run main() when invoked as a script, not when imported by tests.
const invokedDirectly =
  import.meta.url === `file://${process.argv[1]}` ||
  process.argv[1]?.endsWith("create-org-admin.mjs");

if (invokedDirectly) {
  main().catch((err) => {
    fail(err instanceof Error ? (err.stack ?? err.message) : String(err));
  });
}
