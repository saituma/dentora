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
    <Card className="w-full max-w-2xl border border-foreground/[0.12] bg-card/95 shadow-sm">
      <CardHeader>
        <CardTitle className="text-2xl font-medium tracking-tight">Create your account</CardTitle>
        <CardDescription className="text-sm text-muted-foreground">
          Start your 14-day free trial with email verification.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <form onSubmit={otpSent ? handleVerifyAndCreate : handleSendOtp} aria-label="Sign up form">
          <FieldGroup>
            <Field>
              <FieldLabel htmlFor="clinicName">Clinic name</FieldLabel>
              <Input
                id="clinicName"
                placeholder="Smile Dental"
                value={clinicName}
                onChange={(e) => setClinicName(e.target.value)}
                autoComplete="organization"
                aria-label="Clinic name"
                required
              />
            </Field>
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
            {otpSent ? (
              <Field>
                <FieldLabel htmlFor={codeInputId}>Verification code</FieldLabel>
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
                />
              </Field>
            ) : null}
            <Field>
              <Button type="submit" className="w-full text-xs font-mono uppercase tracking-[0.14em]" disabled={sendingOtp || verifyingOtp}>
                {otpSent
                  ? (verifyingOtp ? "Verifying..." : "Verify and create account")
                  : (sendingOtp ? "Sending code..." : "Send verification code")}
              </Button>
            </Field>
            <Field>
              <Button type="button" variant="outline" className="w-full text-xs font-mono uppercase tracking-[0.14em]" onClick={startGoogle} disabled={googleLoading} aria-label="Continue with Google">
                {googleLoading ? "Redirecting..." : "Continue with Google"}
              </Button>
            </Field>
            <FieldDescription className="text-center">
              Already have an account?{" "}
              <Link
                href="/login"
                className="text-primary underline-offset-2 hover:underline"
              >
                Sign in
              </Link>
            </FieldDescription>
          </FieldGroup>
        </form>
      </CardContent>
    </Card>
  );
}
