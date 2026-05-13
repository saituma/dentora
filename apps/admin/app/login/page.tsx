"use client";

import { Activity, Loader2 } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { setCredentials } from "@/features/auth/authSlice";
import { API_BASE_URL, fetchCsrfToken, setTokens } from "@/lib/api";
import { useAppDispatch } from "@/store/hooks";

export default function LoginPage() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const router = useRouter();
  const dispatch = useAppDispatch();

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    try {
      const csrf = await fetchCsrfToken();
      const headers: Record<string, string> = {
        "Content-Type": "application/json",
      };
      if (csrf) headers["x-csrf-token"] = csrf;

      const res = await fetch(`${API_BASE_URL}/auth/login`, {
        method: "POST",
        credentials: "include",
        headers,
        body: JSON.stringify({ email, password }),
      });

      if (!res.ok) {
        const err = await res.json().catch(() => ({ message: "Login failed" }));
        throw new Error(
          (err as { message?: string }).message || "Login failed",
        );
      }

      const data = (await res.json()) as {
        accessToken: string;
        refreshToken: string;
        user: {
          id: string;
          email: string;
          displayName: string | null;
          role: string;
        };
      };

      if (data.user.role !== "platform_admin") {
        toast.error("Access denied. Platform admin role required.");
        return;
      }

      setTokens(data.accessToken, data.refreshToken);
      dispatch(setCredentials({ user: data.user }));
      router.push("/");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Login failed");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="flex min-h-svh items-center justify-center bg-muted/40 p-4">
      <div className="w-full max-w-sm">
        <Card>
          <CardHeader className="flex flex-col items-center gap-3 pb-2">
            <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-emerald-500 text-white shadow-[0_2px_12px_rgba(16,185,129,0.25)]">
              <Activity size={22} />
            </div>
            <div className="text-center">
              <h1 className="text-xl font-bold tracking-tight">
                Dentora Admin
              </h1>
              <p className="mt-0.5 text-sm text-muted-foreground">
                Platform administration portal
              </p>
            </div>
          </CardHeader>
          <CardContent className="pt-4">
            <form onSubmit={handleLogin} className="space-y-4">
              <div className="space-y-1.5">
                <Label htmlFor="email">Email</Label>
                <Input
                  id="email"
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  required
                  autoComplete="email"
                  placeholder="you@example.com"
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="password">Password</Label>
                <Input
                  id="password"
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  required
                  autoComplete="current-password"
                  placeholder="••••••••"
                />
              </div>
              <Button type="submit" className="w-full mt-2" disabled={loading}>
                {loading && <Loader2 className="animate-spin" />}
                {loading ? "Signing in…" : "Sign in"}
              </Button>
            </form>
          </CardContent>
        </Card>
        <p className="mt-4 text-center text-xs text-muted-foreground">
          Platform admin access only — contact your system administrator if you
          need access.
        </p>
      </div>
    </div>
  );
}
