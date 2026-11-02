// #345 — wire contract of the BFF's `GET /api/config/modes/{name}/share-code`
// (worker/share-config.ts), shared by the BFF (which builds it) and the
// client (src/lib/mode-share-code-api.ts, which parses it). One copy, so a
// new variant on either side fails the other's typecheck.
//
// The worker behind it is bt-servant-worker#477: it runs the chat path's
// own read, merge and classifier and says which `#<code>` opens a mode
// from the gateway org's point of view.

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
  | "ambiguous";
// The intersection keeps the known values in editor completion while
// admitting future ones (a bare `| string` would swallow them).
export type ShareCodeReason =
  | KnownShareCodeReason
  | (string & Record<never, never>);

/** The 200 bodies of the share-code route. */
export type ModeShareCodeResponse =
  /** The worker answered. `code` is the token without `#`. */
  | {
      capability: "present";
      code: string | null;
      resolves: boolean;
      reason?: ShareCodeReason;
      /** Raw org of the mode `#<code>` actually opens. */
      resolved_org?: string;
      /**
       * False when the gateway org has no modes at all (worker #477,
       * additive). Drives a non-blocking warning only.
       */
      home_has_modes?: boolean;
      /** The gateway org the worker was asked from (WHATSAPP_ORG), added by the BFF. */
      home_org: string;
    }
  /**
   * The worker predates the route (a 404 without its `mode_not_found`
   * body). `home` is true when the mode's org is the gateway org, by the
   * worker's own exact-key rule on the org the BFF resolved.
   */
  | { capability: "absent"; home: boolean }
  /** WHATSAPP_ORG is unset for this environment; the worker isn't asked. */
  | { capability: "unconfigured" }
  /**
   * WHATSAPP_ORG names an org the worker has no modes for (a 400 from
   * pre-final #477 builds; the final contract uses `home_has_modes`).
   */
  | { capability: "unknown-home-org"; home_org: string };
