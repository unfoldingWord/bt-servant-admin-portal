export interface Language {
  name: string;
  label?: string;
  document: string;
  published?: boolean;
}

export interface OrgLanguages {
  languages: Language[];
  // #286 / worker#236 — the `name` slug of the org's default language.
  // A REFERENCE into `languages`, never a copy. Absent means either "no
  // default set" or "this worker predates the contract"; the collection
  // read cannot tell those apart, which is why availability is decided by
  // the dedicated `GET /api/config/languages-default` (see
  // `OrgDefaultLanguage`) and this field is only a convenience echo.
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
