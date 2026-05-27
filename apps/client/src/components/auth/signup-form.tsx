'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useAppDispatch } from '@/store/hooks';
import { setCredentials } from '@/features/auth/authSlice';
import {
  useLazyGetGoogleStartUrlQuery,
  useSendEmailOtpMutation,
  useVerifyEmailOtpMutation,
} from '@/features/auth/authApi';
import { toast } from 'sonner';
import { getUserFriendlyApiError } from '@/lib/api-error';
import { Button } from '@/components/ui/button';
import { Field, FieldGroup, FieldLabel } from '@/components/ui/field';
import { Input } from '@/components/ui/input';

export function SignupForm() {
  const dispatch = useAppDispatch();
  const router = useRouter();
  const [sendEmailOtp, { isLoading: sendingOtp }] = useSendEmailOtpMutation();
  const [verifyEmailOtp, { isLoading: verifyingOtp }] = useVerifyEmailOtpMutation();
  const [getGoogleStartUrl, { isFetching: googleLoading }] = useLazyGetGoogleStartUrlQuery();

  const [clinicName, setClinicName] = useState('');
  const [email, setEmail] = useState('');
  const [code, setCode] = useState('');
  const [otpSent, setOtpSent] = useState(false);
  const [resendCooldown, setResendCooldown] = useState(0);
  const codeInputId = 'signup-otp-code';

  const startCooldown = () => {
    setResendCooldown(30);
    const interval = setInterval(() => {
      setResendCooldown((prev) => {
        if (prev <= 1) {
          clearInterval(interval);
          return 0;
        }
        return prev - 1;
      });
    }, 1000);
  };

  const handleResendOtp = async () => {
    try {
      await sendEmailOtp({ email }).unwrap();
      toast.success(`New code sent to ${email}.`);
      startCooldown();
    } catch (err: unknown) {
      toast.error(getUserFriendlyApiError(err));
    }
  };

  const handleSendOtp = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      await sendEmailOtp({ email }).unwrap();
      setOtpSent(true);
      startCooldown();
      toast.success(`Code sent to ${email} — check your inbox and spam folder.`);
    } catch (err: unknown) {
      toast.error(getUserFriendlyApiError(err));
    }
  };

  const handleVerifyAndCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      const result = await verifyEmailOtp({
        email,
        code,
        clinicName,
        displayName: clinicName,
      }).unwrap();
      localStorage.setItem('auth_token', result.accessToken);
      localStorage.removeItem('refresh_token');
      dispatch(
        setCredentials({
          user: result.user,
          tenantId: result.tenantId,
          onboardingStatus: 'clinic-profile',
        }),
      );
      toast.success('Account created. Complete your setup.');
      router.push('/onboarding/clinic-profile');
    } catch (err: unknown) {
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

  return (
    <div className="w-full">
      <div className="mb-7">
        <h2 className="font-display text-2xl font-bold text-[#c7d0d9]">Create your account</h2>
        <p className="mt-1 text-sm text-[#c7d0d9]/60">
          Start your 14-day free trial with email verification.
        </p>
      </div>
      <form onSubmit={otpSent ? handleVerifyAndCreate : handleSendOtp} aria-label="Sign up form">
        <FieldGroup>
          <Field>
            <FieldLabel htmlFor="clinicName" className="text-sm font-medium text-[#c7d0d9]/80">
              Clinic name
            </FieldLabel>
            <Input
              id="clinicName"
              placeholder="Smile Dental"
              value={clinicName}
              onChange={(e) => setClinicName(e.target.value)}
              autoComplete="organization"
              aria-label="Clinic name"
              required
              className="border-white/10 bg-[#111827] text-[#c7d0d9] placeholder:text-[#c7d0d9]/50 focus:border-[#4fc3f7]"
            />
          </Field>
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
              autoComplete="email"
              inputMode="email"
              aria-label="Email address"
              required
              className="border-white/10 bg-[#111827] text-[#c7d0d9] placeholder:text-[#c7d0d9]/50 focus:border-[#4fc3f7]"
            />
          </Field>
          {otpSent && (
            <Field>
              <FieldLabel htmlFor={codeInputId} className="text-sm font-medium text-[#c7d0d9]/80">
                Verification code
              </FieldLabel>
              <Input
                id={codeInputId}
                placeholder="123456"
                value={code}
                onChange={(e) => setCode(e.target.value.replace(/\D/g, '').slice(0, 6))}
                autoComplete="one-time-code"
                inputMode="numeric"
                pattern="[0-9]*"
                aria-label="Verification code"
                required
                className="border-white/10 bg-[#111827] text-[#c7d0d9] placeholder:text-[#c7d0d9]/50 focus:border-[#4fc3f7]"
              />
              <p className="mt-2 text-xs text-[#c7d0d9]/60">
                Code sent to <span className="font-medium text-[#c7d0d9]/80">{email}</span>. Check
                spam.{' '}
                <button
                  type="button"
                  className="text-[#4fc3f7] hover:underline disabled:opacity-40"
                  onClick={handleResendOtp}
                  disabled={resendCooldown > 0 || sendingOtp}
                >
                  {resendCooldown > 0 ? `Resend in ${resendCooldown}s` : 'Resend code'}
                </button>
                {' · '}
                <button
                  type="button"
                  className="text-[#4fc3f7] hover:underline"
                  onClick={() => {
                    setOtpSent(false);
                    setCode('');
                  }}
                >
                  Wrong email?
                </button>
              </p>
            </Field>
          )}
          <Field>
            <Button
              type="submit"
              className="w-full rounded-full bg-[#4fc3f7] text-[15px] font-medium text-white hover:bg-[#38b2f0]"
              disabled={sendingOtp || verifyingOtp}
            >
              {otpSent
                ? verifyingOtp
                  ? 'Verifying...'
                  : 'Verify and create account'
                : sendingOtp
                  ? 'Sending code...'
                  : 'Send verification code'}
            </Button>
          </Field>

          <div className="relative my-1">
            <div className="absolute inset-0 flex items-center">
              <div className="w-full border-t border-white/10" />
            </div>
            <div className="relative flex justify-center text-xs">
              <span className="bg-[#0b0f1a] px-3 text-[#c7d0d9]/50">or continue with</span>
            </div>
          </div>

          <Field>
            <Button
              type="button"
              variant="outline"
              className="w-full rounded-full border-white/10 bg-[#111827] text-[15px] font-medium text-[#c7d0d9]/80 hover:bg-white/5"
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
          <p className="text-[#c7d0d9]/60 text-sm text-center">
            Already have an account?{' '}
            <Link href="/login" className="text-[#4fc3f7] underline-offset-2 hover:underline">
              Sign in
            </Link>
          </p>
        </FieldGroup>
      </form>
    </div>
  );
}
