'use client';

import { Suspense, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import Link from 'next/link';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Field, FieldGroup, FieldLabel } from '@/components/ui/field';
import { Input } from '@/components/ui/input';
import { useResetPasswordMutation } from '@/features/auth/authApi';

export default function ResetPasswordPage() {
  return (
    <Suspense>
      <ResetPasswordContent />
    </Suspense>
  );
}

function ResetPasswordContent() {
  const searchParams = useSearchParams();
  const token = searchParams.get('token') ?? '';
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [success, setSuccess] = useState(false);
  const [resetPassword, { isLoading }] = useResetPasswordMutation();

  if (!token) {
    return (
      <div className="w-full">
        <h2 className="font-display text-2xl font-bold text-[#c7d0d9]">Invalid link</h2>
        <p className="mt-2 text-sm text-[#c7d0d9]/60">
          This password reset link is invalid or has expired.
        </p>
        <p className="mt-6 text-sm">
          <Link
            href="/forgot-password"
            className="text-[#4fc3f7] underline-offset-2 hover:underline"
          >
            Request a new reset link
          </Link>
        </p>
      </div>
    );
  }

  if (success) {
    return (
      <div className="w-full">
        <h2 className="font-display text-2xl font-bold text-[#c7d0d9]">Password reset</h2>
        <p className="mt-2 text-sm text-[#c7d0d9]/60">
          Your password has been updated. You can now sign in.
        </p>
        <div className="mt-6">
          <Link href="/login">
            <Button className="w-full rounded-full bg-[#4fc3f7] text-[15px] font-medium text-white hover:bg-[#38b2f0]">
              Sign in
            </Button>
          </Link>
        </div>
      </div>
    );
  }

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (newPassword.length < 8) {
      toast.error('Password must be at least 8 characters');
      return;
    }
    if (newPassword !== confirmPassword) {
      toast.error('Passwords do not match');
      return;
    }
    try {
      await resetPassword({ token, newPassword }).unwrap();
      setSuccess(true);
      toast.success('Password has been reset');
    } catch {
      toast.error('This reset link is invalid or has expired');
    }
  };

  return (
    <div className="w-full">
      <div className="mb-7">
        <h2 className="font-display text-2xl font-bold text-[#c7d0d9]">Set new password</h2>
        <p className="mt-1 text-sm text-[#c7d0d9]/60">Enter your new password below</p>
      </div>
      <form onSubmit={handleSubmit}>
        <FieldGroup>
          <Field>
            <FieldLabel htmlFor="newPassword" className="text-sm font-medium text-[#c7d0d9]/80">
              New password
            </FieldLabel>
            <Input
              id="newPassword"
              type="password"
              placeholder="Minimum 8 characters"
              value={newPassword}
              onChange={(e) => setNewPassword(e.target.value)}
              minLength={8}
              required
              className="border-white/10 bg-[#111827] text-[#c7d0d9] placeholder:text-[#c7d0d9]/50 focus:border-[#4fc3f7]"
            />
          </Field>
          <Field>
            <FieldLabel htmlFor="confirmPassword" className="text-sm font-medium text-[#c7d0d9]/80">
              Confirm password
            </FieldLabel>
            <Input
              id="confirmPassword"
              type="password"
              placeholder="Re-enter your password"
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              minLength={8}
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
              {isLoading ? 'Resetting...' : 'Reset password'}
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
