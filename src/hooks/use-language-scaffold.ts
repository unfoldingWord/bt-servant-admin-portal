import { useQuery } from "@tanstack/react-query";

import { getLanguageScaffold } from "@/lib/language-scaffold-api";

const keys = {
  scaffold: (org: string | null) => ["language-scaffold", org] as const,
};

function normalize(org?: string | null): string | null {
  return org ?? null;
}

export function useLanguageScaffold(org?: string | null) {
  const key = normalize(org);
  return useQuery({
    queryKey: keys.scaffold(key),
    queryFn: ({ signal }) => getLanguageScaffold(signal, key),
  });
}
