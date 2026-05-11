import { useQuery } from "@tanstack/react-query";

import { getLanguageScaffold } from "@/lib/language-scaffold-api";

const keys = {
  scaffold: ["language-scaffold"] as const,
};

export function useLanguageScaffold() {
  return useQuery({
    queryKey: keys.scaffold,
    queryFn: ({ signal }) => getLanguageScaffold(signal),
  });
}
