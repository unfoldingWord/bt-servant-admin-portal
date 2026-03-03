import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Navigate, Route, Routes } from "react-router";

import { useThemeSync } from "@/hooks/use-theme-sync";
import { useSyncSection } from "@/hooks/use-sync-section";
import { AppShell } from "@/components/app-shell";
import { BaruchPage } from "@/app/pages/baruch";
import { ManualConfigPage } from "@/app/pages/manual-config";

const queryClient = new QueryClient();

function AppRoutes() {
  useThemeSync();
  useSyncSection();

  return (
    <Routes>
      <Route element={<AppShell />}>
        <Route index element={<BaruchPage />} />
        <Route path="manual-config" element={<ManualConfigPage />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Route>
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
