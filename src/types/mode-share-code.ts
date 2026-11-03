// #345 — wire contract of the BFF's `GET /api/config/modes/{name}/share-code`
// (worker/share-config.ts), shared by the BFF (which builds it) and the
// client (src/lib/mode-share-code-api.ts, which reads it). One type and one
// field parser, so the two sides can't drift.
//
// The worker behind it is bt-servant-worker#477: it runs the chat path's
// own read, merge and classifier and says which `#<code>` opens a mode
// from the gateway org's point of view.
//
// Types only, with no imports (the onion rule): the runtime half of the
// contract (error codes, the answer parser) is src/lib/mode-share-code-wire.ts.

/**
 * Why the worker's code does not (or cannot) open the mode. The known
 * values are listed; the worker contract is additive, so any other string
 * is possible and reads as "does not open this mode".
 */
export type KnownShareCodeReason =
  | "not_found"
  | "draft"
  | "requires_group"
  | "reserved"
  | "collision"
  | "capped"
  | "org_skipped"
  | "ambiguous"
  /** The stored mode fails the admin PUT shape check, so chat never sees it. */
  | "invalid_mode";
// The intersection keeps the known values in editor completion while
// admitting future ones (a bare `| string` would swallow them).
export type ShareCodeReason =
  | KnownShareCodeReason
  | (string & Record<never, never>);

/** The worker's answer fields, as both the worker and the BFF send them. */
export interface ShareCodeAnswer {
  /** The token without `#`; null when no code can be formed. */
  code: string | null;
  resolves: boolean;
  reason?: ShareCodeReason;
  /** Raw org of the mode `#<code>` actually opens. */
  resolved_org?: string;
  /**
   * True on a `resolves: false` answer when another org couldn't be read
   * just now (bt-servant-worker#477): `resolved_org` is then omitted, and
   * the reason still stands but may change on a re-check.
   */
  resolved_org_uncertain?: boolean;
  /**
   * False when the gateway org has no modes record (the chat path then
   * treats home as empty). Absent when the worker couldn't read the home
   * record for a foreign mode: unknown, so no note. Drives a non-blocking
   * note only.
   */
  home_has_modes?: boolean;
}

/** The 200 bodies of the share-code route. */
export type ModeShareCodeResponse =
  /**
   * The worker answered. The BFF adds `queried_org`: the exact org string
   * it asked the worker about; and `home_org` (WHATSAPP_ORG, as sent)
   * only for a super-admin or when it is exactly `queried_org`.
   * `resolved_org` is compared to `queried_org` byte for byte (the
   * worker's own org keys are exact, #247/#253), never trimmed.
   */
  | ({
      capability: "present";
      home_org?: string;
      queried_org: string;
    } & ShareCodeAnswer)
  /**
   * WHATSAPP_ORG is unusable for this environment: unset or caught by the
   * BFF's guard (the worker isn't asked), or rejected by the worker as
   * `invalid_org` with `field: "home_org"`.
   */
  | { capability: "unconfigured" };
