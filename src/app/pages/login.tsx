import { type FormEvent, useState } from "react";
import { Navigate } from "react-router";
import { faBookBible } from "@fortawesome/pro-duotone-svg-icons";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { Loader2 } from "lucide-react";

import { useAuthStore } from "@/lib/auth-store";
import { useAuth } from "@/hooks/use-auth";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ThemeToggle } from "@/components/theme-toggle";
import { TooltipProvider } from "@/components/ui/tooltip";

export function LoginPage() {
  const { login, isLoading: authLoading } = useAuth();
  const user = useAuthStore((s) => s.user);
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
    <TooltipProvider delayDuration={300}>
      <div className="login-bg relative flex min-h-full flex-col items-center justify-center px-4">
        {/* Theme toggle — top right */}
        <div className="absolute top-4 right-4">
          <ThemeToggle />
        </div>

        {/* Login card */}
        <Card className="animate-in fade-in slide-in-from-bottom-4 w-full max-w-sm duration-500">
          <CardHeader className="items-center text-center">
            <div className="bg-primary/10 text-primary mb-2 flex size-14 items-center justify-center rounded-2xl">
              <FontAwesomeIcon icon={faBookBible} className="text-2xl" />
            </div>
            <CardTitle className="text-xl tracking-tight">BT Servant</CardTitle>
            <CardDescription>Admin Portal</CardDescription>
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
                <p className="text-destructive text-sm font-medium">{error}</p>
              )}

              <Button type="submit" className="w-full" disabled={submitting}>
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
        <p className="text-muted-foreground/60 mt-8 text-xs">
          bt-servant-admin v0.1.0
        </p>
      </div>
    </TooltipProvider>
  );
}
