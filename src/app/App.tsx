import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Navigate, Route, Routes } from "react-router";

import { useThemeSync } from "@/hooks/use-theme-sync";
import { useSyncSection } from "@/hooks/use-sync-section";
import { useAuthInit } from "@/hooks/use-auth-init";
import { useSessionGuard } from "@/hooks/use-session-guard";
import { AppShell } from "@/components/app-shell";
import { RequireAuth } from "@/components/require-auth";
import { BaruchPage } from "@/app/pages/baruch";
import { LoginPage } from "@/app/pages/login";
import { ManualConfigPage } from "@/app/pages/manual-config";

const queryClient = new QueryClient();

function AppRoutes() {
  useThemeSync();
  useSyncSection();
  useAuthInit();
  useSessionGuard();

  return (
    <Routes>
      <Route path="/login" element={<LoginPage />} />
      <Route
        element={
          <RequireAuth>
            <AppShell />
          </RequireAuth>
        }
      >
        <Route index element={<BaruchPage />} />
        <Route path="prompt-configuration" element={<ManualConfigPage />} />
      </Route>
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}

export function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <BrowserRouter>
        <AppRoutes />
      </BrowserRouter>
    </QueryClientProvider>
  );
}
