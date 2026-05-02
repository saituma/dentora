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
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Field,
  FieldDescription,
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

const getLoginDestination = (_step: OnboardingStep): string => "/dashboard";

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
    const accessToken = searchParams.get("accessToken");
    const refreshToken = searchParams.get("refreshToken");
    const userId = searchParams.get("userId");
    const userEmail = searchParams.get("email");
    const userRole = searchParams.get("role");
    const displayName = searchParams.get("displayName");
    const tenantId = searchParams.get("tenantId");

    if (oauth !== "google" || !accessToken || !refreshToken || !userId || !userEmail || !userRole) {
      return;
    }

    void finalizeLogin({
      accessToken,
      refreshToken,
      tenantId: tenantId || null,
      user: {
        id: userId,
        email: userEmail,
        role: userRole,
        displayName: displayName || null,
      },
    });
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
    <Card className="w-full max-w-2xl border border-foreground/[0.12] bg-card/95 shadow-sm">
      <CardHeader>
        <CardTitle className="text-2xl font-medium tracking-tight">Welcome back</CardTitle>
        <CardDescription className="text-sm text-muted-foreground">
          Sign in with password, email code, or Google.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <form onSubmit={handlePasswordLogin} aria-label="Login form">
          <FieldGroup>
            <Field>
              <FieldLabel htmlFor="email">Email</FieldLabel>
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
              />
            </Field>
            <Field>
              <div className="flex items-center justify-between">
                <FieldLabel htmlFor="password">Password</FieldLabel>
                <Link
                  href="/forgot-password"
                  className="text-sm text-primary underline-offset-2 hover:underline"
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
              />
            </Field>
            <Field>
              <Button type="submit" className="w-full text-xs font-mono uppercase tracking-[0.14em]" disabled={isLoading}>
                {isLoading ? "Signing in..." : "Sign in with password"}
              </Button>
            </Field>
            <Field>
              <Button type="button" variant="outline" className="w-full text-xs font-mono uppercase tracking-[0.14em]" onClick={startGoogle} disabled={googleLoading} aria-label="Continue with Google">
                {googleLoading ? "Redirecting..." : "Continue with Google"}
              </Button>
            </Field>
            <Field>
              {!otpSent ? (
                <Button type="button" variant="outline" className="w-full text-xs font-mono uppercase tracking-[0.14em]" onClick={handleSendOtp} disabled={sendingOtp || !email} aria-label="Send sign in code to email">
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
                  />
                  <Button type="button" variant="outline" className="w-full text-xs font-mono uppercase tracking-[0.14em]" onClick={handleOtpLogin} disabled={verifyingOtp || otpCode.length !== 6}>
                    {verifyingOtp ? "Verifying..." : "Sign in with email code"}
                  </Button>
                </div>
              )}
            </Field>
            <FieldDescription className="text-center">
              Don&apos;t have an account?{" "}
              <Link
                href="/signup"
                className="text-primary underline-offset-2 hover:underline"
              >
                Sign up
              </Link>
            </FieldDescription>
          </FieldGroup>
        </form>
      </CardContent>
    </Card>
  );
}
