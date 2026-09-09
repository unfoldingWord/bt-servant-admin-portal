import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import * as api from "@/lib/mcp-servers-api";
import type { McpServerWrite } from "@/types/mcp-servers";

// The pool is global and every request targets the caller's own org (the BFF
// resolves that from the session), so the key needs no org dimension.
const POOL_KEY = ["mcp-servers"] as const;

export function useMcpServers(enabled = true) {
  return useQuery({
    queryKey: POOL_KEY,
    queryFn: ({ signal }) => api.getMcpServers(signal),
    enabled,
  });
}

export function useUpsertMcpServer() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: McpServerWrite) => api.upsertMcpServer(body),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: POOL_KEY });
    },
  });
}

export function useDeleteMcpServer() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => api.deleteMcpServer(id),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: POOL_KEY });
    },
  });
}
