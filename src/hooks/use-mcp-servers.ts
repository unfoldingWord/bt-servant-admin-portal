import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import * as api from "@/lib/mcp-servers-api";
import type { McpServerWrite } from "@/types/mcp-servers";

const keys = {
  // Scoped by org so a super-admin switching org context refetches the pool.
  pool: (org?: string) => ["mcp-servers", org ?? "@self"] as const,
};

export function useMcpServers(org?: string, enabled = true) {
  return useQuery({
    queryKey: keys.pool(org),
    queryFn: ({ signal }) => api.getMcpServers(org, signal),
    enabled,
  });
}

export function useUpsertMcpServer(org?: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: McpServerWrite) => api.upsertMcpServer(body, org),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: keys.pool(org) });
    },
  });
}

export function useDeleteMcpServer(org?: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => api.deleteMcpServer(id, org),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: keys.pool(org) });
    },
  });
}
