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
        <h2 className="font-display text-2xl font-bold mk-body">Invalid link</h2>
        <p className="mt-2 text-sm mk-muted">This password reset link is invalid or has expired.</p>
        <p className="mt-6 text-sm">
          <Link href="/forgot-password" className="mk-accent underline-offset-2 hover:underline">
            Request a new reset link
          </Link>
        </p>
      </div>
    );
  }

  if (success) {
    return (
      <div className="w-full">
        <h2 className="font-display text-2xl font-bold mk-body">Password reset</h2>
        <p className="mt-2 text-sm mk-muted">
          Your password has been updated. You can now sign in.
        </p>
        <div className="mt-6">
          <Link href="/login">
            <Button className="w-full rounded-full mk-btn-primary text-[15px] font-medium">
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
        <h2 className="font-display text-2xl font-bold mk-body">Set new password</h2>
        <p className="mt-1 text-sm mk-muted">Enter your new password below</p>
      </div>
      <form onSubmit={handleSubmit}>
        <FieldGroup>
          <Field>
            <FieldLabel htmlFor="newPassword" className="text-sm font-medium mk-body">
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
              className="border-[var(--mk-hairline)] bg-[var(--mk-surface)] mk-body placeholder:text-[var(--mk-faint)] focus:border-[var(--mk-accent)]"
            />
          </Field>
          <Field>
            <FieldLabel htmlFor="confirmPassword" className="text-sm font-medium mk-body">
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
              className="border-[var(--mk-hairline)] bg-[var(--mk-surface)] mk-body placeholder:text-[var(--mk-faint)] focus:border-[var(--mk-accent)]"
            />
          </Field>
          <Field>
            <Button
              type="submit"
              className="w-full rounded-full mk-btn-primary text-[15px] font-medium"
              disabled={isLoading}
            >
              {isLoading ? 'Resetting...' : 'Reset password'}
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
