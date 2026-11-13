import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import * as api from "@/lib/api-keys-api";
import type { ApiKeyCreateInput } from "@/types/api-keys";

const ROOT = ["api-keys"] as const;

/** `org` null = the caller's own org; `allOrgs` = every org (super admins). */
export function useApiKeys(org: string | null, allOrgs: boolean) {
  return useQuery({
    queryKey: [...ROOT, org, allOrgs],
    queryFn: ({ signal }) => api.listApiKeys(org, allOrgs, signal),
  });
}

// Every mutation refreshes every API keys list: a key can show up in both
// an org view and the all-orgs view.
function useInvalidate() {
  const qc = useQueryClient();
  return () => void qc.invalidateQueries({ queryKey: ROOT });
}

export function useCreateApiKey(org: string | null) {
  const invalidate = useInvalidate();
  return useMutation({
    mutationFn: (input: ApiKeyCreateInput) => api.createApiKey(org, input),
    // The result holds a plaintext key: drop it from the cache as soon as
    // nothing observes it, instead of the default five minutes.
    gcTime: 0,
    // Refresh on failure too: a 409 terms refusal or a recorded acceptance
    // changes what the page should show.
    onSettled: invalidate,
  });
}

export function useRevokeApiKey() {
  const invalidate = useInvalidate();
  return useMutation({
    mutationFn: (id: string) => api.revokeApiKey(id),
    onSettled: invalidate,
  });
}

export function useRotateApiKey() {
  const invalidate = useInvalidate();
  return useMutation({
    mutationFn: ({ id, graceSeconds }: { id: string; graceSeconds: number }) =>
      api.rotateApiKey(id, graceSeconds),
    gcTime: 0, // plaintext key in the result; see useCreateApiKey
    onSettled: invalidate,
  });
}
