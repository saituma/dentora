"use client";

import { Activity, Loader2 } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { toast } from "sonner";
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
    <div className="flex min-h-screen items-center justify-center bg-[#F6F6F6]">
      <div className="w-full max-w-sm">
        {/* Card */}
        <div className="bg-white rounded-2xl border border-black/[0.07] shadow-[0px_2px_8px_rgba(0,0,0,0.05)] p-8">
          {/* Logo */}
          <div className="flex flex-col items-center gap-3 mb-8">
            <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-emerald-500 text-white shadow-[0_2px_12px_rgba(16,185,129,0.35)]">
              <Activity size={22} />
            </div>
            <div className="text-center">
              <h1 className="text-xl font-bold tracking-tight text-zinc-900">
                Dentora Admin
              </h1>
              <p className="mt-0.5 text-sm text-zinc-500">
                Platform administration portal
              </p>
            </div>
          </div>

          {/* Form */}
          <form onSubmit={handleLogin} className="space-y-4">
            <div className="space-y-1.5">
              <label
                htmlFor="email"
                className="block text-xs font-semibold text-zinc-500 uppercase tracking-wider"
              >
                Email
              </label>
              <input
                id="email"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
                autoComplete="email"
                className="w-full rounded-xl border border-black/[0.1] bg-black/[0.02] px-3.5 py-2.5 text-sm text-zinc-900 placeholder:text-zinc-400 focus:outline-none focus:ring-2 focus:ring-emerald-500/25 focus:border-emerald-500/50 transition"
                placeholder="you@example.com"
              />
            </div>
            <div className="space-y-1.5">
              <label
                htmlFor="password"
                className="block text-xs font-semibold text-zinc-500 uppercase tracking-wider"
              >
                Password
              </label>
              <input
                id="password"
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                autoComplete="current-password"
                className="w-full rounded-xl border border-black/[0.1] bg-black/[0.02] px-3.5 py-2.5 text-sm text-zinc-900 placeholder:text-zinc-400 focus:outline-none focus:ring-2 focus:ring-emerald-500/25 focus:border-emerald-500/50 transition"
                placeholder="••••••••"
              />
            </div>
            <button
              type="submit"
              disabled={loading}
              className="w-full flex items-center justify-center gap-2 mt-2 rounded-xl bg-zinc-900 px-4 py-2.5 text-sm font-semibold text-white hover:bg-zinc-800 shadow-[0px_1px_2px_rgba(0,0,0,0.15)] transition disabled:opacity-50"
            >
              {loading ? <Loader2 size={15} className="animate-spin" /> : null}
              {loading ? "Signing in…" : "Sign in"}
            </button>
          </form>
        </div>

        <p className="mt-4 text-center text-xs text-zinc-400">
          Platform admin access only — contact your system administrator if you
          need access.
        </p>
      </div>
    </div>
  );
}
