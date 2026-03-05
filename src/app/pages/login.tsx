import { type FormEvent, useState } from "react";
import { Navigate } from "react-router";
import { faBookBible } from "@fortawesome/pro-duotone-svg-icons";
import { faScrewdriverWrench } from "@fortawesome/pro-duotone-svg-icons";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { AlertTriangle, Loader2 } from "lucide-react";

import { useAuthStore } from "@/lib/auth-store";
import { useThemeStore } from "@/lib/theme-store";
import { useAuth } from "@/hooks/use-auth";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ThemeToggle } from "@/components/theme-toggle";

export function LoginPage() {
  const { login, isLoading: authLoading } = useAuth();
  const user = useAuthStore((s) => s.user);
  const theme = useThemeStore((s) => s.theme);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);

  // Already authenticated — redirect to app
  if (!authLoading && user) {
    return <Navigate to="/" replace />;
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError("");
    setSubmitting(true);

    try {
      await login(email, password);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Login failed");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="login-bg relative flex min-h-full flex-col items-center overflow-hidden px-4 pt-[20vh] pb-16">
      {/* Theme toggle — top right */}
      <div className="absolute top-4 right-4">
        <ThemeToggle tooltipSide="left" />
      </div>

      {/* Login card */}
      <Card className="animate-in fade-in w-full max-w-sm shadow-xl [animation-duration:500ms] dark:shadow-black/40">
        <CardHeader className="items-center justify-items-center text-center">
          <div className="relative -mb-1 flex size-14 items-center justify-center">
            <span
              className="text-4xl"
              style={
                theme === "dark"
                  ? undefined
                  : ({
                      "--fa-primary-color": "#ffffff",
                      "--fa-primary-opacity": "1",
                      "--fa-secondary-color": "#ae5630",
                      "--fa-secondary-opacity": "1",
                    } as React.CSSProperties)
              }
            >
              <FontAwesomeIcon
                icon={faBookBible}
                className={theme === "dark" ? "text-primary/80" : undefined}
              />
            </span>
            <FontAwesomeIcon
              icon={faScrewdriverWrench}
              className="absolute -right-1.5 bottom-2.5 text-sm text-slate-500 drop-shadow-sm dark:text-slate-300"
            />
          </div>
          <CardTitle className="text-2xl font-bold tracking-tight">
            BT Servant
          </CardTitle>
          <p className="text-muted-foreground/60 text-xs font-medium tracking-widest uppercase">
            Admin Portal
          </p>
        </CardHeader>

        <CardContent>
          <form onSubmit={(e) => void handleSubmit(e)} className="grid gap-4">
            <div className="grid gap-2">
              <Label htmlFor="email">Email</Label>
              <Input
                id="email"
                type="email"
                placeholder="admin@example.com"
                autoComplete="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                disabled={submitting}
              />
            </div>

            <div className="grid gap-2">
              <Label htmlFor="password">Password</Label>
              <Input
                id="password"
                type="password"
                autoComplete="current-password"
                required
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                disabled={submitting}
              />
            </div>

            {error && (
              <div className="border-destructive/20 bg-destructive/10 text-destructive flex items-start gap-2 rounded-md border px-3 py-2.5 text-sm font-medium">
                <AlertTriangle className="mt-0.5 size-4 shrink-0" />
                {error}
              </div>
            )}

            <Button
              type="submit"
              className="mt-8 h-11 w-full"
              disabled={submitting}
            >
              {submitting ? (
                <>
                  <Loader2 className="size-4 animate-spin" />
                  Signing in...
                </>
              ) : (
                "Sign in"
              )}
            </Button>
          </form>
        </CardContent>
      </Card>

      {/* Version footer */}
      <p className="text-primary/50 dark:text-muted-foreground/60 mt-3 text-xs">
        BT Servant Admin Portal v0.3.0
      </p>
    </div>
  );
}
