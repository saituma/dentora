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
  const [seeding, setSeeding] = useState(false);
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

  const handleSeed = async () => {
    setSeeding(true);
    try {
      const res = await fetch(`${API_BASE_URL}/admin/seed`, { method: "POST" });
      const data = (await res.json()) as { message?: string };
      if (res.ok) {
        toast.success(data.message || "Admin seeded");
        setEmail("admin@gmail.com");
        setPassword("Password123!");
      } else {
        toast.error(data.message || "Seed failed");
      }
    } catch {
      toast.error("Failed to seed admin");
    } finally {
      setSeeding(false);
    }
  };

  return (
    <div className="flex min-h-screen items-center justify-center bg-[#050505]">
      <div className="w-full max-w-md space-y-8 p-8">
        <div className="flex flex-col items-center gap-4">
          <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-emerald-500 shadow-[0_0_30px_rgba(16,185,129,0.4)] text-white">
            <Activity size={28} />
          </div>
          <div className="text-center">
            <h1 className="text-3xl font-bold tracking-tighter text-zinc-50">
              Dentora Admin
            </h1>
            <p className="mt-1 text-sm text-zinc-500">
              Platform administration portal
            </p>
          </div>
        </div>

        <form onSubmit={handleLogin} className="space-y-4">
          <div className="space-y-2">
            <label
              htmlFor="email"
              className="text-xs font-medium text-zinc-400 uppercase tracking-wider"
            >
              Email
            </label>
            <input
              id="email"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
              className="w-full rounded-xl border border-white/10 bg-white/5 px-4 py-3 text-sm text-zinc-100 placeholder:text-zinc-600 focus:outline-none focus:ring-2 focus:ring-emerald-500/30 transition"
              placeholder="admin@gmail.com"
            />
          </div>
          <div className="space-y-2">
            <label
              htmlFor="password"
              className="text-xs font-medium text-zinc-400 uppercase tracking-wider"
            >
              Password
            </label>
            <input
              id="password"
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              className="w-full rounded-xl border border-white/10 bg-white/5 px-4 py-3 text-sm text-zinc-100 placeholder:text-zinc-600 focus:outline-none focus:ring-2 focus:ring-emerald-500/30 transition"
              placeholder="••••••••"
            />
          </div>
          <button
            type="submit"
            disabled={loading}
            className="w-full flex items-center justify-center gap-2 rounded-xl bg-emerald-500 px-4 py-3 text-sm font-semibold text-white hover:bg-emerald-600 shadow-[0_1px_20px_-5px_rgba(16,185,129,0.4)] transition disabled:opacity-50"
          >
            {loading ? <Loader2 size={16} className="animate-spin" /> : null}
            {loading ? "Signing in..." : "Sign in"}
          </button>
        </form>

        <div className="relative">
          <div className="absolute inset-0 flex items-center">
            <div className="w-full border-t border-white/5" />
          </div>
          <div className="relative flex justify-center text-xs">
            <span className="bg-[#050505] px-2 text-zinc-600">First time?</span>
          </div>
        </div>

        <button
          type="button"
          onClick={handleSeed}
          disabled={seeding}
          className="w-full rounded-xl border border-white/10 px-4 py-3 text-sm font-medium text-zinc-400 hover:text-zinc-200 hover:border-white/20 transition disabled:opacity-50"
        >
          {seeding ? "Seeding..." : "Seed admin account"}
        </button>
      </div>
    </div>
  );
}
