import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import * as configApi from "@/lib/config-api";

// ---------------------------------------------------------------------------
// Query keys
// ---------------------------------------------------------------------------

const keys = {
  userMemory: (userId: string) => ["user-memory", userId] as const,
};

// ---------------------------------------------------------------------------
// Queries
// ---------------------------------------------------------------------------

export function useUserMemory(userId: string | null) {
  return useQuery({
    queryKey: keys.userMemory(userId ?? ""),
    queryFn: ({ signal }) => configApi.getUserMemory(userId!, signal),
    enabled: !!userId,
  });
}

// ---------------------------------------------------------------------------
// Mutations
// ---------------------------------------------------------------------------

export function useDeleteUserMemory() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (userId: string) => configApi.deleteUserMemory(userId),
    onSuccess: (_data, userId) => {
      void qc.invalidateQueries({ queryKey: keys.userMemory(userId) });
    },
  });
}
