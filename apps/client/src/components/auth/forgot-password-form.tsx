"use client";

import { useState } from "react";
import Link from "next/link";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Field, FieldGroup, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { useForgotPasswordMutation } from "@/features/auth/authApi";

export function ForgotPasswordForm() {
  const [email, setEmail] = useState("");
  const [submitted, setSubmitted] = useState(false);
  const [forgotPassword, { isLoading }] = useForgotPasswordMutation();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      await forgotPassword({ email }).unwrap();
      setSubmitted(true);
      toast.success("Check your email for reset instructions");
    } catch {
      toast.error("Something went wrong. Please try again.");
    }
  };

  if (submitted) {
    return (
      <div className="w-full max-w-md rounded-3xl border border-white/[0.08] bg-[#0f1424]/80 p-1.5 shadow-sm">
        <div className="rounded-[calc(1.5rem-6px)] border border-white/[0.06] bg-gradient-to-br from-[#0f1424] to-[#0a0e1a] p-8">
          <h2 className="text-2xl font-bold tracking-tight text-white">Check your email</h2>
          <p className="mt-1 text-sm text-gray-400">
            We sent a password reset link to {email}
          </p>
          <p className="mt-6 text-xs text-gray-500">
            <Link href="/login" className="text-blue-400 underline-offset-2 hover:underline">
              Back to sign in
            </Link>
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="w-full max-w-md rounded-3xl border border-white/[0.08] bg-[#0f1424]/80 p-1.5 shadow-sm">
      <div className="rounded-[calc(1.5rem-6px)] border border-white/[0.06] bg-gradient-to-br from-[#0f1424] to-[#0a0e1a] p-8">
        <div className="mb-6">
          <h2 className="text-2xl font-bold tracking-tight text-white">Forgot password</h2>
          <p className="mt-1 text-sm text-gray-400">
            Enter your email and we&apos;ll send you a reset link
          </p>
        </div>
        <form onSubmit={handleSubmit}>
          <FieldGroup>
            <Field>
              <FieldLabel htmlFor="email" className="text-gray-300">Email</FieldLabel>
              <Input
                id="email"
                type="email"
                placeholder="admin@clinic.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
                className="border-white/10 bg-white/5 text-white placeholder:text-gray-500 focus:border-blue-500"
              />
            </Field>
            <Field>
              <Button type="submit" className="w-full bg-blue-600 text-xs font-mono uppercase tracking-[0.14em] text-white hover:bg-blue-700" disabled={isLoading}>
                {isLoading ? "Sending..." : "Send reset link"}
              </Button>
            </Field>
            <p className="text-gray-500 text-xs text-center">
              <Link href="/login" className="text-blue-400 underline-offset-2 hover:underline">
                Back to sign in
              </Link>
            </p>
          </FieldGroup>
        </form>
      </div>
    </div>
  );
}
