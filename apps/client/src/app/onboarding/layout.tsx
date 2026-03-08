'use client';

import { useAppSelector } from '@/store/hooks';
import { useEffect } from 'react';
import { useRouter } from 'next/navigation';

const ONBOARDING_STEPS = [
  'clinic-profile',
  'plan',
  'knowledge-base',
  'voice',
  'rules',
  'integrations',
  'schedule',
  'ai-chat',
  'test-call',
  'complete',
] as const;

export default function OnboardingLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const { isAuthenticated, isHydrated } = useAppSelector((state) => state.auth);
  const router = useRouter();

  useEffect(() => {
    if (!isHydrated) return;

    if (!isAuthenticated) {
      router.replace('/login');
    }
  }, [isAuthenticated, isHydrated, router]);

  if (!isHydrated) {
    return null;
  }

  return (
    <div className="relative flex min-h-svh flex-col items-center justify-center overflow-hidden bg-muted/20 p-4 sm:p-6">
      <div className="pointer-events-none absolute inset-x-0 -top-28 h-72 bg-primary/10 blur-3xl" />
      <div className="relative w-full max-w-4xl">
        <div className="mb-4 flex items-center justify-center">
          <div className="inline-flex items-center rounded-full border bg-background/80 px-3 py-1 text-xs font-medium text-muted-foreground backdrop-blur">
            DentalFlow AI · Onboarding
          </div>
        </div>
        {children}
      </div>
    </div>
  );
}
