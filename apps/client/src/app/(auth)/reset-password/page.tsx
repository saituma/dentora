"use client";

import { Suspense, useState } from "react";
import { useSearchParams } from "next/navigation";
import Link from "next/link";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Field, FieldGroup, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { useResetPasswordMutation } from "@/features/auth/authApi";

function BentoShell({ children, className = "" }: { children: React.ReactNode; className?: string }) {
  return (
    <div className={`w-full max-w-md rounded-3xl border border-white/[0.08] bg-[#0f1424]/80 p-1.5 shadow-sm ${className}`}>
      <div className="rounded-[calc(1.5rem-6px)] border border-white/[0.06] bg-gradient-to-br from-[#0f1424] to-[#0a0e1a] p-8">
        {children}
      </div>
    </div>
  );
}

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
      <BentoShell>
        <h2 className="text-2xl font-bold tracking-tight text-white">Invalid link</h2>
        <p className="mt-1 text-sm text-gray-400">
          This password reset link is invalid or has expired.
        </p>
        <p className="mt-6">
          <Link href="/forgot-password" className="text-blue-400 underline-offset-2 hover:underline">
            Request a new reset link
          </Link>
        </p>
      </BentoShell>
    );
  }

  if (success) {
    return (
      <BentoShell>
        <h2 className="text-2xl font-bold tracking-tight text-white">Password reset</h2>
        <p className="mt-1 text-sm text-gray-400">
          Your password has been updated. You can now sign in.
        </p>
        <div className="mt-6">
          <Link href="/login">
            <Button className="w-full bg-blue-600 text-xs font-mono uppercase tracking-[0.14em] text-white hover:bg-blue-700">
              Sign in
            </Button>
          </Link>
        </div>
      </BentoShell>
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
    <BentoShell>
      <div className="mb-6">
        <h2 className="text-2xl font-bold tracking-tight text-white">Set new password</h2>
        <p className="mt-1 text-sm text-gray-400">Enter your new password below</p>
      </div>
      <form onSubmit={handleSubmit}>
        <FieldGroup>
          <Field>
            <FieldLabel htmlFor="newPassword" className="text-gray-300">New password</FieldLabel>
            <Input
              id="newPassword"
              type="password"
              placeholder="Minimum 8 characters"
              value={newPassword}
              onChange={(e) => setNewPassword(e.target.value)}
              minLength={8}
              required
              className="border-white/10 bg-white/5 text-white placeholder:text-gray-500 focus:border-blue-500"
            />
          </Field>
          <Field>
            <FieldLabel htmlFor="confirmPassword" className="text-gray-300">Confirm password</FieldLabel>
            <Input
              id="confirmPassword"
              type="password"
              placeholder="Re-enter your password"
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              minLength={8}
              required
              className="border-white/10 bg-white/5 text-white placeholder:text-gray-500 focus:border-blue-500"
            />
          </Field>
          <Field>
            <Button type="submit" className="w-full bg-blue-600 text-xs font-mono uppercase tracking-[0.14em] text-white hover:bg-blue-700" disabled={isLoading}>
              {isLoading ? "Resetting..." : "Reset password"}
            </Button>
          </Field>
          <p className="text-gray-500 text-xs text-center">
            <Link href="/login" className="text-blue-400 underline-offset-2 hover:underline">
              Back to sign in
            </Link>
          </p>
        </FieldGroup>
      </form>
    </BentoShell>
  );
}
