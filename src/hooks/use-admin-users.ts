import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import * as api from "@/lib/admin-users-api";
import type { CreateUserBody, UpdateUserBody } from "@/types/admin-users";

const keys = {
  users: ["admin-users"] as const,
};

export function useAdminUsers(enabled = true) {
  return useQuery({
    queryKey: keys.users,
    queryFn: ({ signal }) => api.listAdminUsers(signal),
    enabled,
  });
}

export function useCreateAdminUser() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: CreateUserBody) => api.createAdminUser(body),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: keys.users });
    },
  });
}

export function useUpdateAdminUser() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ email, body }: { email: string; body: UpdateUserBody }) =>
      api.updateAdminUser(email, body),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: keys.users });
    },
  });
}

export function useDeleteAdminUser() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (email: string) => api.deleteAdminUser(email),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: keys.users });
    },
  });
}
