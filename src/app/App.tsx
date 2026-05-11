import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import {
  Navigate,
  Outlet,
  RouterProvider,
  createBrowserRouter,
} from "react-router";

import { useThemeSync } from "@/hooks/use-theme-sync";
import { useSyncSection } from "@/hooks/use-sync-section";
import { useAuthInit } from "@/hooks/use-auth-init";
import { useSessionGuard } from "@/hooks/use-session-guard";
import { AppShell } from "@/components/app-shell";
import { RequireAdmin } from "@/components/require-admin";
import { RequireAuth } from "@/components/require-auth";
import { AdminUsersPage } from "@/app/pages/admin-users";
import { BaruchPage } from "@/app/pages/baruch";
import { LanguagesPage } from "@/app/pages/languages";
import { LoginPage } from "@/app/pages/login";
import { ManualConfigPage } from "@/app/pages/manual-config";
import { ModesPage } from "@/app/pages/modes";

const queryClient = new QueryClient();

// Root layout for the data router. Hooks that need router context
// (useSyncSection -> useLocation, useSessionGuard -> useNavigate) live here.
// Required for useBlocker support in child routes — useBlocker only works
// under a data router (createBrowserRouter), not under <BrowserRouter>.
function RootLayout() {
  useThemeSync();
  useSyncSection();
  useAuthInit();
  useSessionGuard();
  return <Outlet />;
}

const router = createBrowserRouter([
  {
    element: <RootLayout />,
    children: [
      { path: "/login", element: <LoginPage /> },
      {
        element: (
          <RequireAuth>
            <AppShell />
          </RequireAuth>
        ),
        children: [
          { index: true, element: <BaruchPage /> },
          {
            path: "modes",
            element: (
              <RequireAdmin>
                <ModesPage />
              </RequireAdmin>
            ),
          },
          {
            path: "prompt-configuration",
            element: (
              <RequireAdmin>
                <ManualConfigPage />
              </RequireAdmin>
            ),
          },
          { path: "languages", element: <LanguagesPage /> },
          {
            path: "admin/users",
            element: (
              <RequireAdmin>
                <AdminUsersPage />
              </RequireAdmin>
            ),
          },
        ],
      },
      { path: "*", element: <Navigate to="/" replace /> },
    ],
  },
]);

export function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <RouterProvider router={router} />
    </QueryClientProvider>
  );
}
