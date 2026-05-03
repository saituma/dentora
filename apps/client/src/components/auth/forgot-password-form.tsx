"use client";

import { useState } from "react";
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
      <Card className="w-full max-w-md border border-foreground/[0.12] bg-card/95 shadow-sm">
        <CardHeader>
          <CardTitle className="text-2xl font-medium tracking-tight">Check your email</CardTitle>
          <CardDescription className="text-sm text-muted-foreground">
            We sent a password reset link to {email}
          </CardDescription>
        </CardHeader>
        <CardContent>
          <p className="text-muted-foreground text-xs">
            <Link
              href="/login"
              className="text-primary underline-offset-2 hover:underline"
            >
              Back to sign in
            </Link>
          </p>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="w-full max-w-md border border-foreground/[0.12] bg-card/95 shadow-sm">
      <CardHeader>
        <CardTitle className="text-2xl font-medium tracking-tight">Forgot password</CardTitle>
        <CardDescription className="text-sm text-muted-foreground">
          Enter your email and we&apos;ll send you a reset link
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
              <Button type="submit" className="w-full text-xs font-mono uppercase tracking-[0.14em]" disabled={isLoading}>
                {isLoading ? "Sending..." : "Send reset link"}
              </Button>
            </Field>
            <p className="text-muted-foreground text-xs text-center">
              <Link
                href="/login"
                className="text-primary underline-offset-2 hover:underline"
              >
                Back to sign in
              </Link>
            </p>
          </FieldGroup>
        </form>
      </CardContent>
    </Card>
  );
}
