"use client";

import { Suspense, useState } from "react";
import { useSearchParams } from "next/navigation";
import Link from "next/link";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Field, FieldGroup, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { useResetPasswordMutation } from "@/features/auth/authApi";

export default function ResetPasswordPage() {
  return (
    <Suspense>
      <ResetPasswordContent />
    </Suspense>
  );
}

function ResetPasswordContent() {
  const searchParams = useSearchParams();
  const token = searchParams.get("token") ?? "";
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [success, setSuccess] = useState(false);
  const [resetPassword, { isLoading }] = useResetPasswordMutation();

  if (!token) {
    return (
      <Card className="w-full max-w-md border border-foreground/[0.12] bg-card/95 shadow-sm">
        <CardHeader>
          <CardTitle className="text-2xl font-medium tracking-tight">Invalid link</CardTitle>
          <CardDescription className="text-sm text-muted-foreground">
            This password reset link is invalid or has expired.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Link href="/forgot-password" className="text-primary underline-offset-2 hover:underline">
            Request a new reset link
          </Link>
        </CardContent>
      </Card>
    );
  }

  if (success) {
    return (
      <Card className="w-full max-w-md border border-foreground/[0.12] bg-card/95 shadow-sm">
        <CardHeader>
          <CardTitle className="text-2xl font-medium tracking-tight">Password reset</CardTitle>
          <CardDescription className="text-sm text-muted-foreground">
            Your password has been updated. You can now sign in.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Link href="/login">
            <Button className="w-full text-xs font-mono uppercase tracking-[0.14em]">
              Sign in
            </Button>
          </Link>
        </CardContent>
      </Card>
    );
  }

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (newPassword.length < 8) {
      toast.error("Password must be at least 8 characters");
      return;
    }
    if (newPassword !== confirmPassword) {
      toast.error("Passwords do not match");
      return;
    }
    try {
      await resetPassword({ token, newPassword }).unwrap();
      setSuccess(true);
      toast.success("Password has been reset");
    } catch {
      toast.error("This reset link is invalid or has expired");
    }
  };

  return (
    <Card className="w-full max-w-md border border-foreground/[0.12] bg-card/95 shadow-sm">
      <CardHeader>
        <CardTitle className="text-2xl font-medium tracking-tight">Set new password</CardTitle>
        <CardDescription className="text-sm text-muted-foreground">
          Enter your new password below
        </CardDescription>
      </CardHeader>
      <CardContent>
        <form onSubmit={handleSubmit}>
          <FieldGroup>
            <Field>
              <FieldLabel htmlFor="newPassword">New password</FieldLabel>
              <Input
                id="newPassword"
                type="password"
                placeholder="Minimum 8 characters"
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
                minLength={8}
                required
              />
            </Field>
            <Field>
              <FieldLabel htmlFor="confirmPassword">Confirm password</FieldLabel>
              <Input
                id="confirmPassword"
                type="password"
                placeholder="Re-enter your password"
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                minLength={8}
                required
              />
            </Field>
            <Field>
              <Button type="submit" className="w-full text-xs font-mono uppercase tracking-[0.14em]" disabled={isLoading}>
                {isLoading ? "Resetting..." : "Reset password"}
              </Button>
            </Field>
            <p className="text-muted-foreground text-xs text-center">
              <Link href="/login" className="text-primary underline-offset-2 hover:underline">
                Back to sign in
              </Link>
            </p>
          </FieldGroup>
        </form>
      </CardContent>
    </Card>
  );
}
