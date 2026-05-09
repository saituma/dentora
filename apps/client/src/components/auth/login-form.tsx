"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useAppDispatch } from "@/store/hooks";
import { setCredentials } from "@/features/auth/authSlice";
import {
  useLazyGetGoogleStartUrlQuery,
  useLoginMutation,
  useSendEmailOtpMutation,
  useVerifyEmailOtpMutation,
} from "@/features/auth/authApi";
import type { OnboardingStep } from "@/features/auth/types";
import { toast } from "sonner";
import { getUserFriendlyApiError } from "@/lib/api-error";
import { API_BASE_URL } from "@/lib/api";
import { Button } from "@/components/ui/button";
import {
  Field,
  FieldGroup,
  FieldLabel,
} from "@/components/ui/field";
import { Input } from "@/components/ui/input";

const mapServerStepToClientStep = (step?: string): OnboardingStep => {
  if (!step) return "clinic-profile";

  if (step === "clinic-profile") return "clinic-profile";
  if (step === "services" || step === "knowledge-base") return "knowledge-base";
  if (step === "voice") return "voice";
  if (step === "phone-number") return "phone-number";
  if (step === "booking-rules" || step === "policies" || step === "rules") {
    return "rules";
  }
  if (step === "integrations") return "integrations";
  if (step === "schedule") return "schedule";
  if (step === "review") return "ai-chat";
  if (step === "test-call") return "test-call";
  if (step === "complete") return "complete";

  return "clinic-profile";
};

const getLoginDestination = (step: OnboardingStep): string => {
  if (step === "complete") return "/dashboard";
  return `/onboarding/${step}`;
};

export function LoginForm() {
  const dispatch = useAppDispatch();
  const router = useRouter();
  const searchParams = useSearchParams();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [otpCode, setOtpCode] = useState("");
  const [otpSent, setOtpSent] = useState(false);
  const otpInputId = "login-otp-code";

  const [login, { isLoading }] = useLoginMutation();
  const [sendEmailOtp, { isLoading: sendingOtp }] = useSendEmailOtpMutation();
  const [verifyEmailOtp, { isLoading: verifyingOtp }] = useVerifyEmailOtpMutation();
  const [getGoogleStartUrl, { isFetching: googleLoading }] = useLazyGetGoogleStartUrlQuery();

  const fetchOnboardingStep = async (accessToken: string): Promise<OnboardingStep> => {
    try {
      const response = await fetch(`${API_BASE_URL}/onboarding/status`, {
        headers: {
          Authorization: `Bearer ${accessToken}`,
        },
      });

      if (!response.ok) {
        return "clinic-profile";
      }

      const data = (await response.json()) as { currentStep?: string };
      return mapServerStepToClientStep(data.currentStep);
    } catch {
      return "clinic-profile";
    }
  };

  const finalizeLogin = async (result: {
    accessToken: string;
    refreshToken: string;
    user: { id: string; email: string; displayName: string | null; role: string };
    tenantId: string | null;
  }) => {
    if (typeof window !== "undefined") {
      localStorage.setItem("auth_token", result.accessToken);
      localStorage.setItem("refresh_token", result.refreshToken);
    }

    const onboardingStatus = await fetchOnboardingStep(result.accessToken);

    dispatch(
      setCredentials({
        user: result.user,
        tenantId: result.tenantId,
        onboardingStatus,
      })
    );
    toast.success("Welcome back!");
    router.push(getLoginDestination(onboardingStatus));
  };

  useEffect(() => {
    const oauth = searchParams.get("oauth");

    if (oauth !== "google") {
      return;
    }

    const exchangeOauthCode = async () => {
      try {
        const res = await fetch(`${API_BASE_URL}/auth/google/exchange`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          credentials: "include",
          body: JSON.stringify({}),
        });
        if (!res.ok) {
          const err = await res.json().catch(() => ({ message: "OAuth login failed" }));
          throw new Error((err as { message?: string }).message || "OAuth login failed");
        }
        const result = await res.json();
        await finalizeLogin(result);
      } catch (err) {
        toast.error(err instanceof Error ? err.message : "Google login failed");
      }
    };

    void exchangeOauthCode();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchParams]);

  const handlePasswordLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      const result = await login({ email, password }).unwrap();
      await finalizeLogin(result);
    } catch (err: unknown) {
      toast.error(getUserFriendlyApiError(err, { operation: "login" }));
    }
  };

  const handleSendOtp = async () => {
    try {
      await sendEmailOtp({ email }).unwrap();
      setOtpSent(true);
      toast.success("Verification code sent.");
    } catch (err: unknown) {
      toast.error(getUserFriendlyApiError(err));
    }
  };

  const handleOtpLogin = async () => {
    try {
      const result = await verifyEmailOtp({ email, code: otpCode }).unwrap();
      await finalizeLogin(result);
    } catch (err: unknown) {
      toast.error(getUserFriendlyApiError(err));
    }
  };

  const startGoogle = async () => {
    try {
      const result = await getGoogleStartUrl({ returnTo: window.location.origin }).unwrap();
      window.location.assign(result.authUrl);
    } catch (err: unknown) {
      toast.error(getUserFriendlyApiError(err));
    }
  };

  return (
    <div className="w-full rounded-3xl border border-white/[0.08] bg-[#0f1424]/80 p-1.5 shadow-sm">
      <div className="rounded-[calc(1.5rem-6px)] border border-white/[0.06] bg-gradient-to-br from-[#0f1424] to-[#0a0e1a] p-8">
        <div className="mb-6">
          <h2 className="text-2xl font-bold tracking-tight text-white">Welcome back</h2>
          <p className="mt-1 text-sm text-gray-400">
            Sign in with password, email code, or Google.
          </p>
        </div>
        <form onSubmit={handlePasswordLogin} aria-label="Login form">
          <FieldGroup>
            <Field>
              <FieldLabel htmlFor="email" className="text-gray-300">Email</FieldLabel>
              <Input
                id="email"
                type="email"
                placeholder="admin@clinic.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                autoComplete="email"
                inputMode="email"
                aria-label="Email address"
                required
                className="border-white/10 bg-white/5 text-white placeholder:text-gray-500 focus:border-blue-500"
              />
            </Field>
            <Field>
              <div className="flex items-center justify-between">
                <FieldLabel htmlFor="password" className="text-gray-300">Password</FieldLabel>
                <Link
                  href="/forgot-password"
                  className="text-sm text-blue-400 underline-offset-2 hover:underline"
                >
                  Forgot password?
                </Link>
              </div>
              <Input
                id="password"
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                autoComplete="current-password"
                aria-label="Password"
                required
                className="border-white/10 bg-white/5 text-white placeholder:text-gray-500 focus:border-blue-500"
              />
            </Field>
            <Field>
              <Button type="submit" className="w-full bg-blue-600 text-xs font-mono uppercase tracking-[0.14em] text-white hover:bg-blue-700" disabled={isLoading}>
                {isLoading ? "Signing in..." : "Sign in with password"}
              </Button>
            </Field>
            <Field>
              <Button type="button" variant="outline" className="w-full border-white/10 bg-white/5 text-xs font-mono uppercase tracking-[0.14em] text-gray-300 hover:bg-white/10 hover:text-white" onClick={startGoogle} disabled={googleLoading} aria-label="Continue with Google">
                {googleLoading ? "Redirecting..." : "Continue with Google"}
              </Button>
            </Field>
            <Field>
              {!otpSent ? (
                <Button type="button" variant="outline" className="w-full border-white/10 bg-white/5 text-xs font-mono uppercase tracking-[0.14em] text-gray-300 hover:bg-white/10 hover:text-white" onClick={handleSendOtp} disabled={sendingOtp || !email} aria-label="Send sign in code to email">
                  {sendingOtp ? "Sending code..." : "Send email code"}
                </Button>
              ) : (
                <div className="space-y-2">
                  <FieldLabel htmlFor={otpInputId} className="sr-only">
                    Email verification code
                  </FieldLabel>
                  <Input
                    id={otpInputId}
                    placeholder="Enter 6-digit code"
                    value={otpCode}
                    onChange={(e) => setOtpCode(e.target.value.replace(/\D/g, "").slice(0, 6))}
                    autoComplete="one-time-code"
                    inputMode="numeric"
                    pattern="[0-9]*"
                    aria-label="Email verification code"
                    className="border-white/10 bg-white/5 text-white placeholder:text-gray-500 focus:border-blue-500"
                  />
                  <Button type="button" variant="outline" className="w-full border-white/10 bg-white/5 text-xs font-mono uppercase tracking-[0.14em] text-gray-300 hover:bg-white/10 hover:text-white" onClick={handleOtpLogin} disabled={verifyingOtp || otpCode.length !== 6}>
                    {verifyingOtp ? "Verifying..." : "Sign in with email code"}
                  </Button>
                </div>
              )}
            </Field>
            <p className="text-gray-500 text-xs text-center">
              Don&apos;t have an account?{" "}
              <Link
                href="/signup"
                className="text-blue-400 underline-offset-2 hover:underline"
              >
                Sign up
              </Link>
            </p>
          </FieldGroup>
        </form>
      </div>
    </div>
  );
}
