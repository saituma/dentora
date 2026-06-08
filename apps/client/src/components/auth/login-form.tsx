'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { useAppDispatch } from '@/store/hooks';
import { setCredentials } from '@/features/auth/authSlice';
import {
  useLazyGetGoogleStartUrlQuery,
  useLoginMutation,
  useSendEmailOtpMutation,
  useVerifyEmailOtpMutation,
} from '@/features/auth/authApi';
import type { OnboardingStep } from '@/features/auth/types';
import { toast } from 'sonner';
import { getUserFriendlyApiError } from '@/lib/api-error';
import { API_BASE_URL, fetchCsrfToken } from '@/lib/api';
import { Button } from '@/components/ui/button';
import { Field, FieldGroup, FieldLabel } from '@/components/ui/field';
import { Input } from '@/components/ui/input';

function extractRetryAfterSeconds(err: unknown): number | null {
  if (!err || typeof err !== 'object') return null;
  const data = (err as Record<string, unknown>).data;
  if (!data || typeof data !== 'object') return null;
  const error = (data as Record<string, unknown>).error;
  if (!error || typeof error !== 'object') return null;
  const details = (error as Record<string, unknown>).details;
  if (!details || typeof details !== 'object') return null;
  const seconds = (details as Record<string, unknown>).retryAfterSeconds;
  return typeof seconds === 'number' ? seconds : null;
}

const mapServerStepToClientStep = (step?: string): OnboardingStep => {
  if (!step) return 'clinic-profile';

  if (step === 'clinic-profile') return 'clinic-profile';
  if (step === 'services' || step === 'knowledge-base') return 'knowledge-base';
  if (step === 'voice') return 'voice';
  if (step === 'phone-number') return 'phone-number';
  if (step === 'booking-rules' || step === 'policies' || step === 'rules') {
    return 'rules';
  }
  if (step === 'integrations') return 'integrations';
  if (step === 'schedule') return 'schedule';
  if (step === 'review') return 'ai-chat';
  if (step === 'test-call') return 'test-call';
  if (step === 'complete') return 'complete';

  return 'clinic-profile';
};

const getLoginDestination = (step: OnboardingStep): string => {
  if (step === 'complete') return '/dashboard';
  return `/onboarding/${step}`;
};

export function LoginForm() {
  const dispatch = useAppDispatch();
  const router = useRouter();
  const searchParams = useSearchParams();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [otpCode, setOtpCode] = useState('');
  const [otpSent, setOtpSent] = useState(false);
  const otpInputId = 'login-otp-code';
  const isOAuthCallback = searchParams.get('oauth') === 'google';
  const [oauthLoading, setOauthLoading] = useState(isOAuthCallback);

  const [rateLimitCountdown, setRateLimitCountdown] = useState(0);

  useEffect(() => {
    if (rateLimitCountdown <= 0) return;
    const timer = setTimeout(() => setRateLimitCountdown((c) => c - 1), 1000);
    return () => clearTimeout(timer);
  }, [rateLimitCountdown]);

  const handleRateLimitError = useCallback((err: unknown) => {
    const seconds = extractRetryAfterSeconds(err);
    if (seconds && seconds > 0) setRateLimitCountdown(seconds);
  }, []);

  const [login, { isLoading }] = useLoginMutation();
  const [sendEmailOtp, { isLoading: sendingOtp }] = useSendEmailOtpMutation();
  const [verifyEmailOtp, { isLoading: verifyingOtp }] = useVerifyEmailOtpMutation();
  const [getGoogleStartUrl, { isFetching: googleLoading }] = useLazyGetGoogleStartUrlQuery();

  const fetchOnboardingStep = async (accessToken: string): Promise<OnboardingStep> => {
    try {
      const response = await fetch(`${API_BASE_URL}/onboarding/status`, {
        headers: {
          Authorization: `Bearer ${accessToken}`,
        },
      });

      if (!response.ok) {
        return 'clinic-profile';
      }

      const data = (await response.json()) as { currentStep?: string };
      return mapServerStepToClientStep(data.currentStep);
    } catch {
      return 'clinic-profile';
    }
  };

  const finalizeLogin = async (result: {
    accessToken: string;
    user: { id: string; email: string; displayName: string | null; role: string };
    tenantId: string | null;
  }) => {
    if (typeof window !== 'undefined') {
      localStorage.setItem('auth_token', result.accessToken);
      localStorage.removeItem('refresh_token');
    }

    const onboardingStatus = await fetchOnboardingStep(result.accessToken);

    dispatch(
      setCredentials({
        user: result.user,
        tenantId: result.tenantId,
        onboardingStatus,
      }),
    );
    toast.success('Welcome back!');
    router.push(getLoginDestination(onboardingStatus));
  };

  useEffect(() => {
    const oauth = searchParams.get('oauth');

    if (oauth !== 'google') {
      return;
    }

    const exchangeOauthCode = async () => {
      try {
        const code = searchParams.get('code');
        if (!code) throw new Error('Missing OAuth exchange code');

        const csrf = await fetchCsrfToken();
        const headers: Record<string, string> = { 'Content-Type': 'application/json' };
        if (csrf) headers['x-csrf-token'] = csrf;

        const res = await fetch(`${API_BASE_URL}/auth/google/exchange`, {
          method: 'POST',
          headers,
          credentials: 'include',
          body: JSON.stringify({ code }),
        });
        if (!res.ok) {
          const err = await res.json().catch(() => ({ message: 'OAuth login failed' }));
          throw new Error((err as { message?: string }).message || 'OAuth login failed');
        }
        const result = await res.json();
        await finalizeLogin(result);
      } catch (err) {
        setOauthLoading(false);
        toast.error(err instanceof Error ? err.message : 'Google login failed');
      }
    };

    void exchangeOauthCode();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchParams]);

  const handlePasswordLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      const result = await login({ email, password }).unwrap();
      await finalizeLogin(result);
    } catch (err: unknown) {
      handleRateLimitError(err);
      toast.error(getUserFriendlyApiError(err, { operation: 'login' }));
    }
  };

  const handleSendOtp = async () => {
    try {
      await sendEmailOtp({ email }).unwrap();
      setOtpSent(true);
      toast.success('Verification code sent.');
    } catch (err: unknown) {
      handleRateLimitError(err);
      toast.error(getUserFriendlyApiError(err));
    }
  };

  const handleOtpLogin = async () => {
    try {
      const result = await verifyEmailOtp({ email, code: otpCode }).unwrap();
      await finalizeLogin(result);
    } catch (err: unknown) {
      handleRateLimitError(err);
      toast.error(getUserFriendlyApiError(err));
    }
  };

  const startGoogle = async () => {
    try {
      const result = await getGoogleStartUrl({ returnTo: window.location.origin }).unwrap();
      window.location.assign(result.authUrl);
    } catch (err: unknown) {
      toast.error(getUserFriendlyApiError(err));
    }
  };

  if (oauthLoading) {
    return (
      <div className="flex min-h-[320px] w-full flex-col items-center justify-center gap-4">
        <div className="h-10 w-10 animate-spin rounded-full border-2 border-[var(--mk-hairline)] border-t-[var(--mk-accent)]" />
        <p className="text-sm mk-faint">Signing you in…</p>
      </div>
    );
  }

  return (
    <div className="w-full">
      <div className="mb-7">
        <h2 className="font-display text-2xl font-bold mk-body">Welcome back</h2>
        <p className="mt-1 text-sm mk-muted">Sign in with password, email code, or Google.</p>
      </div>
      <form onSubmit={handlePasswordLogin} aria-label="Login form">
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
              autoComplete="email"
              inputMode="email"
              aria-label="Email address"
              required
              className="border-[var(--mk-hairline)] bg-[var(--mk-surface)] mk-body placeholder:text-[var(--mk-faint)] focus:border-[var(--mk-accent)]"
            />
          </Field>
          <Field>
            <div className="flex items-center justify-between">
              <FieldLabel htmlFor="password" className="text-sm font-medium mk-body">
                Password
              </FieldLabel>
              <Link
                href="/forgot-password"
                className="text-sm mk-accent underline-offset-2 hover:underline"
              >
                Forgot password?
              </Link>
            </div>
            <Input
              id="password"
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              autoComplete="current-password"
              aria-label="Password"
              required
              className="border-[var(--mk-hairline)] bg-[var(--mk-surface)] mk-body placeholder:text-[var(--mk-faint)] focus:border-[var(--mk-accent)]"
            />
          </Field>
          <Field>
            <Button
              type="submit"
              className="w-full rounded-full mk-btn-primary text-[15px] font-medium"
              disabled={isLoading || rateLimitCountdown > 0}
            >
              {isLoading
                ? 'Signing in...'
                : rateLimitCountdown > 0
                  ? `Try again in ${rateLimitCountdown}s`
                  : 'Sign in'}
            </Button>
          </Field>

          <div className="relative my-1">
            <div className="absolute inset-0 flex items-center">
              <div className="w-full border-t border-[var(--mk-hairline)]" />
            </div>
            <div className="relative flex justify-center text-xs">
              <span className="bg-[var(--mk-surface)] px-3 mk-faint">or continue with</span>
            </div>
          </div>

          <Field>
            <Button
              type="button"
              variant="outline"
              className="w-full rounded-full border-[var(--mk-hairline)] bg-[var(--mk-surface)] text-[15px] font-medium mk-body hover:bg-[var(--mk-inset-bg)]"
              onClick={startGoogle}
              disabled={googleLoading}
              aria-label="Continue with Google"
            >
              <svg className="mr-2 size-4" viewBox="0 0 24 24">
                <path
                  d="M12.48 10.92v3.28h7.84c-.24 1.84-.853 3.187-1.787 4.133-1.147 1.147-2.933 2.4-6.053 2.4-4.827 0-8.6-3.893-8.6-8.72s3.773-8.72 8.6-8.72c2.6 0 4.507 1.027 5.907 2.347l2.307-2.307C18.747 1.44 16.133 0 12.48 0 5.867 0 .307 5.387.307 12s5.56 12 12.173 12c3.573 0 6.267-1.173 8.373-3.36 2.16-2.16 2.84-5.213 2.84-7.667 0-.76-.053-1.467-.173-2.053H12.48z"
                  fill="currentColor"
                />
              </svg>
              {googleLoading ? 'Redirecting...' : 'Continue with Google'}
            </Button>
          </Field>
          <Field>
            {!otpSent ? (
              <Button
                type="button"
                variant="outline"
                className="w-full rounded-full border-[var(--mk-hairline)] bg-[var(--mk-surface)] text-[15px] font-medium mk-body hover:bg-[var(--mk-inset-bg)]"
                onClick={handleSendOtp}
                disabled={sendingOtp || !email || rateLimitCountdown > 0}
                aria-label="Send sign in code to email"
              >
                {sendingOtp
                  ? 'Sending code...'
                  : rateLimitCountdown > 0
                    ? `Try again in ${rateLimitCountdown}s`
                    : 'Send email code'}
              </Button>
            ) : (
              <div className="space-y-2">
                <FieldLabel htmlFor={otpInputId} className="sr-only">
                  Email verification code
                </FieldLabel>
                <Input
                  id={otpInputId}
                  placeholder="Enter 6-digit code"
                  value={otpCode}
                  onChange={(e) => setOtpCode(e.target.value.replace(/\D/g, '').slice(0, 6))}
                  autoComplete="one-time-code"
                  inputMode="numeric"
                  pattern="[0-9]*"
                  aria-label="Email verification code"
                  className="border-[var(--mk-hairline)] bg-[var(--mk-surface)] mk-body placeholder:text-[var(--mk-faint)] focus:border-[var(--mk-accent)]"
                />
                <Button
                  type="button"
                  variant="outline"
                  className="w-full rounded-full border-[var(--mk-hairline)] bg-[var(--mk-surface)] text-[15px] font-medium mk-body hover:bg-[var(--mk-inset-bg)]"
                  onClick={handleOtpLogin}
                  disabled={verifyingOtp || otpCode.length !== 6 || rateLimitCountdown > 0}
                >
                  {verifyingOtp
                    ? 'Verifying...'
                    : rateLimitCountdown > 0
                      ? `Try again in ${rateLimitCountdown}s`
                      : 'Sign in with email code'}
                </Button>
              </div>
            )}
          </Field>
          <p className="text-center text-sm mk-body">
            Don&apos;t have an account?{' '}
            <Link
              href="/signup"
              className="font-bold mk-accent underline decoration-2 underline-offset-2 hover:opacity-80"
            >
              Sign up free
            </Link>
          </p>
        </FieldGroup>
      </form>
    </div>
  );
}
