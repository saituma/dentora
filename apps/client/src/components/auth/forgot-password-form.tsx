'use client';

import { useState } from 'react';
import Link from 'next/link';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Field, FieldGroup, FieldLabel } from '@/components/ui/field';
import { Input } from '@/components/ui/input';
import { useForgotPasswordMutation } from '@/features/auth/authApi';

export function ForgotPasswordForm() {
  const [email, setEmail] = useState('');
  const [submitted, setSubmitted] = useState(false);
  const [forgotPassword, { isLoading }] = useForgotPasswordMutation();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      await forgotPassword({ email }).unwrap();
      setSubmitted(true);
      toast.success('Check your email for reset instructions');
    } catch {
      toast.error('Something went wrong. Please try again.');
    }
  };

  if (submitted) {
    return (
      <div className="w-full">
        <h2 className="font-display text-2xl font-bold mk-body">Check your email</h2>
        <p className="mt-2 text-sm mk-muted">We sent a password reset link to {email}</p>
        <p className="mt-6 text-sm">
          <Link href="/login" className="mk-accent underline-offset-2 hover:underline">
            Back to sign in
          </Link>
        </p>
      </div>
    );
  }

  return (
    <div className="w-full">
      <div className="mb-7">
        <h2 className="font-display text-2xl font-bold mk-body">Forgot password</h2>
        <p className="mt-1 text-sm mk-muted">
          Enter your email and we&apos;ll send you a reset link
        </p>
      </div>
      <form onSubmit={handleSubmit}>
        <FieldGroup>
          <Field>
            <FieldLabel htmlFor="email" className="text-sm font-medium mk-body">
              Email
            </FieldLabel>
            <Input
              id="email"
              type="email"
              placeholder="admin@clinic.com"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
              className="border-[var(--mk-hairline)] bg-[var(--mk-surface)] mk-body placeholder:text-[var(--mk-faint)] focus:border-[var(--mk-accent)]"
            />
          </Field>
          <Field>
            <Button
              type="submit"
              className="w-full rounded-full mk-btn-primary text-[15px] font-medium"
              disabled={isLoading}
            >
              {isLoading ? 'Sending...' : 'Send reset link'}
            </Button>
          </Field>
          <p className="mk-muted text-sm text-center">
            <Link href="/login" className="mk-accent underline-offset-2 hover:underline">
              Back to sign in
            </Link>
          </p>
        </FieldGroup>
      </form>
    </div>
  );
}
