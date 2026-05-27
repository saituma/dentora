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
        <h2 className="font-display text-2xl font-bold text-[#c7d0d9]">Check your email</h2>
        <p className="mt-2 text-sm text-[#c7d0d9]/60">We sent a password reset link to {email}</p>
        <p className="mt-6 text-sm">
          <Link href="/login" className="text-[#4fc3f7] underline-offset-2 hover:underline">
            Back to sign in
          </Link>
        </p>
      </div>
    );
  }

  return (
    <div className="w-full">
      <div className="mb-7">
        <h2 className="font-display text-2xl font-bold text-[#c7d0d9]">Forgot password</h2>
        <p className="mt-1 text-sm text-[#c7d0d9]/60">
          Enter your email and we&apos;ll send you a reset link
        </p>
      </div>
      <form onSubmit={handleSubmit}>
        <FieldGroup>
          <Field>
            <FieldLabel htmlFor="email" className="text-sm font-medium text-[#c7d0d9]/80">
              Email
            </FieldLabel>
            <Input
              id="email"
              type="email"
              placeholder="admin@clinic.com"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
              className="border-white/10 bg-[#111827] text-[#c7d0d9] placeholder:text-[#c7d0d9]/50 focus:border-[#4fc3f7]"
            />
          </Field>
          <Field>
            <Button
              type="submit"
              className="w-full rounded-full bg-[#4fc3f7] text-[15px] font-medium text-white hover:bg-[#38b2f0]"
              disabled={isLoading}
            >
              {isLoading ? 'Sending...' : 'Send reset link'}
            </Button>
          </Field>
          <p className="text-[#c7d0d9]/60 text-sm text-center">
            <Link href="/login" className="text-[#4fc3f7] underline-offset-2 hover:underline">
              Back to sign in
            </Link>
          </p>
        </FieldGroup>
      </form>
    </div>
  );
}
