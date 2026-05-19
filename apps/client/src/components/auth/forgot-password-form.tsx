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
        <h2 className="font-display text-2xl font-bold text-black">Check your email</h2>
        <p className="mt-2 text-sm text-gray-500">We sent a password reset link to {email}</p>
        <p className="mt-6 text-sm">
          <Link href="/login" className="text-[#b275ff] underline-offset-2 hover:underline">
            Back to sign in
          </Link>
        </p>
      </div>
    );
  }

  return (
    <div className="w-full">
      <div className="mb-7">
        <h2 className="font-display text-2xl font-bold text-black">Forgot password</h2>
        <p className="mt-1 text-sm text-gray-500">
          Enter your email and we&apos;ll send you a reset link
        </p>
      </div>
      <form onSubmit={handleSubmit}>
        <FieldGroup>
          <Field>
            <FieldLabel htmlFor="email" className="text-sm font-medium text-gray-700">
              Email
            </FieldLabel>
            <Input
              id="email"
              type="email"
              placeholder="admin@clinic.com"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
              className="border-black/10 bg-white text-black placeholder:text-gray-400 focus:border-[#b275ff]"
            />
          </Field>
          <Field>
            <Button
              type="submit"
              className="w-full rounded-full bg-[#b275ff] text-[15px] font-medium text-white hover:bg-[#a060f0]"
              disabled={isLoading}
            >
              {isLoading ? 'Sending...' : 'Send reset link'}
            </Button>
          </Field>
          <p className="text-gray-500 text-sm text-center">
            <Link href="/login" className="text-[#b275ff] underline-offset-2 hover:underline">
              Back to sign in
            </Link>
          </p>
        </FieldGroup>
      </form>
    </div>
  );
}
