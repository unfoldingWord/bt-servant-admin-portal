export interface Language {
  name: string;
  label?: string;
  document: string;
  published?: boolean;
}

export interface OrgLanguages {
  languages: Language[];
  // #286 / worker#236 — the `name` slug of the org's default language.
  // A REFERENCE into `languages`, never a copy.
  //
  // Declared for contract fidelity and DELIBERATELY NOT a UI source of
  // truth: absent here is ambiguous between "no default set" and "this
  // worker predates the contract", and the control must hide itself in
  // the second case rather than assert the first. The dedicated
  // `GET /api/config/languages-default` (→ `OrgDefaultLanguage`) is the
  // only read the panel trusts. Do not wire the badge or the notice off
  // this field.
  defaultLanguage?: string | null;
}

// Availability-aware read of the org default (#286). The
// `languages-default` route pair is not deployed on every worker yet, so
// "the endpoint answered with no default" (`supported: true, name: null`)
// must stay distinguishable from "the endpoint isn't there" — the UI hides
// the control entirely in the second case instead of claiming the org has
// no default.
export type OrgDefaultLanguage =
  | { supported: true; name: string | null }
  | { supported: false };
