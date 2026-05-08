"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useAppDispatch } from "@/store/hooks";
import { setCredentials } from "@/features/auth/authSlice";
import {
  useLazyGetGoogleStartUrlQuery,
  useSendEmailOtpMutation,
  useVerifyEmailOtpMutation,
} from "@/features/auth/authApi";
import { toast } from "sonner";
import { getUserFriendlyApiError } from "@/lib/api-error";
import { Button } from "@/components/ui/button";
import {
  Field,
  FieldGroup,
  FieldLabel,
} from "@/components/ui/field";
import { Input } from "@/components/ui/input";

export function SignupForm() {
  const dispatch = useAppDispatch();
  const router = useRouter();
  const [sendEmailOtp, { isLoading: sendingOtp }] = useSendEmailOtpMutation();
  const [verifyEmailOtp, { isLoading: verifyingOtp }] = useVerifyEmailOtpMutation();
  const [getGoogleStartUrl, { isFetching: googleLoading }] = useLazyGetGoogleStartUrlQuery();

  const [clinicName, setClinicName] = useState("");
  const [email, setEmail] = useState("");
  const [code, setCode] = useState("");
  const [otpSent, setOtpSent] = useState(false);
  const codeInputId = "signup-otp-code";

  const handleSendOtp = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      await sendEmailOtp({ email }).unwrap();
      setOtpSent(true);
      toast.success("Verification code sent to your email.");
    } catch (err: unknown) {
      toast.error(getUserFriendlyApiError(err));
    }
  };

  const handleVerifyAndCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      const result = await verifyEmailOtp({
        email,
        code,
        clinicName,
        displayName: clinicName,
      }).unwrap();
      localStorage.setItem("auth_token", result.accessToken);
      localStorage.setItem("refresh_token", result.refreshToken);
      dispatch(
        setCredentials({
          user: result.user,
          tenantId: result.tenantId,
          onboardingStatus: "clinic-profile",
        })
      );
      toast.success("Account created. Complete your setup.");
      router.push("/onboarding/clinic-profile");
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
          <h2 className="text-2xl font-bold tracking-tight text-white">Create your account</h2>
          <p className="mt-1 text-sm text-gray-400">
            Start your 14-day free trial with email verification.
          </p>
        </div>
        <form onSubmit={otpSent ? handleVerifyAndCreate : handleSendOtp} aria-label="Sign up form">
          <FieldGroup>
            <Field>
              <FieldLabel htmlFor="clinicName" className="text-gray-300">Clinic name</FieldLabel>
              <Input
                id="clinicName"
                placeholder="Smile Dental"
                value={clinicName}
                onChange={(e) => setClinicName(e.target.value)}
                autoComplete="organization"
                aria-label="Clinic name"
                required
                className="border-white/10 bg-white/5 text-white placeholder:text-gray-500 focus:border-blue-500"
              />
            </Field>
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
            {otpSent ? (
              <Field>
                <FieldLabel htmlFor={codeInputId} className="text-gray-300">Verification code</FieldLabel>
                <Input
                  id={codeInputId}
                  placeholder="123456"
                  value={code}
                  onChange={(e) => setCode(e.target.value.replace(/\D/g, "").slice(0, 6))}
                  autoComplete="one-time-code"
                  inputMode="numeric"
                  pattern="[0-9]*"
                  aria-label="Verification code"
                  required
                  className="border-white/10 bg-white/5 text-white placeholder:text-gray-500 focus:border-blue-500"
                />
              </Field>
            ) : null}
            <Field>
              <Button type="submit" className="w-full bg-blue-600 text-xs font-mono uppercase tracking-[0.14em] text-white hover:bg-blue-700" disabled={sendingOtp || verifyingOtp}>
                {otpSent
                  ? (verifyingOtp ? "Verifying..." : "Verify and create account")
                  : (sendingOtp ? "Sending code..." : "Send verification code")}
              </Button>
            </Field>
            <Field>
              <Button type="button" variant="outline" className="w-full border-white/10 bg-white/5 text-xs font-mono uppercase tracking-[0.14em] text-gray-300 hover:bg-white/10 hover:text-white" onClick={startGoogle} disabled={googleLoading} aria-label="Continue with Google">
                {googleLoading ? "Redirecting..." : "Continue with Google"}
              </Button>
            </Field>
            <p className="text-gray-500 text-xs text-center">
              Already have an account?{" "}
              <Link
                href="/login"
                className="text-blue-400 underline-offset-2 hover:underline"
              >
                Sign in
              </Link>
            </p>
          </FieldGroup>
        </form>
      </div>
    </div>
  );
}
