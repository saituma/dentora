"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useAppDispatch } from "@/store/hooks";
import { setCredentials } from "@/features/auth/authSlice";
import { useLoginMutation } from "@/features/auth/authApi";
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
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [login, { isLoading }] = useLoginMutation();

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

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      const result = await login({ email, password }).unwrap();
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
    } catch (err: unknown) {
      toast.error(getUserFriendlyApiError(err, { operation: "login" }));
    }
  };

  return (
    <Card className="w-full max-w-md">
      <CardHeader>
        <CardTitle>Welcome back</CardTitle>
        <CardDescription>
          Sign in to your DentalFlow AI account
        </CardDescription>
      </CardHeader>
      <CardContent>
        <form onSubmit={handleSubmit}>
          <FieldGroup>
            <Field>
              <FieldLabel htmlFor="email">Email</FieldLabel>
              <Input
                id="email"
                type="email"
                placeholder="admin@clinic.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
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
                required
              />
            </Field>
            <Field>
              <Button type="submit" className="w-full" disabled={isLoading}>
                {isLoading ? "Signing in..." : "Sign in"}
              </Button>
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
