import { KNOWN_SUBJECT_LABELS } from "@/types/resources";

// The canonical subject set is OPEN by contract (worker#257): unmapped server
// vocabulary is slugified by the worker rather than dropped, so new categories
// must degrade to "visible but unknown" here — a readable humanized label,
// never a raw slug and never a missing row.
export function subjectLabel(slug: string): string {
  const known = KNOWN_SUBJECT_LABELS[slug];
  if (known) return known;
  return slug
    .split("-")
    .filter((part) => part.length > 0)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}
