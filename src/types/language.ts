export interface Language {
  name: string;
  label?: string;
  document: string;
  published?: boolean;
}

export interface OrgLanguages {
  languages: Language[];
}
