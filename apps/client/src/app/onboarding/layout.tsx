'use client';

import { useAppSelector } from '@/store/hooks';
import { useEffect } from 'react';
import { usePathname, useRouter } from 'next/navigation';
import { motion } from 'framer-motion';
import { ErrorBoundary } from '@/components/error-boundary';
import { DentoraAiChat } from '@/components/dentora-ai-chat';
import { SiteHeader } from '@/components/marketing/site-chrome';

const ONBOARDING_STEPS = [
  { id: 'clinic-profile', label: 'Clinic Profile' },
  { id: 'knowledge-base', label: 'Knowledge Base' },
  { id: 'voice', label: 'Voice Setup' },
  { id: 'phone-number', label: 'Phone Number' },
  { id: 'integrations', label: 'Integrations' },
  { id: 'schedule', label: 'Clinic Schedule' },
  { id: 'clinic-history', label: 'Clinic History' },
  { id: 'ai-chat', label: 'AI Context' },
  { id: 'download', label: 'Export Data' },
  { id: 'test-call', label: 'Review & Publish' },
  { id: 'complete', label: 'Complete' },
] as const;

export default function OnboardingLayout({ children }: { children: React.ReactNode }) {
  const { isAuthenticated, isHydrated } = useAppSelector((state) => state.auth);
  const router = useRouter();
  const pathname = usePathname();
  const activeStepId = pathname?.split('/').filter(Boolean).at(-1) ?? 'clinic-profile';
  const activeStepIndex = Math.max(
    0,
    ONBOARDING_STEPS.findIndex((step) => step.id === activeStepId),
  );
  const activeStep = ONBOARDING_STEPS[activeStepIndex] ?? ONBOARDING_STEPS[0];
  const totalSteps = ONBOARDING_STEPS.length;

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
    <div
      data-mk-scope
      className="mk-scope mk-bg relative flex min-h-svh flex-col mk-body antialiased"
    >
      <SiteHeader />
      <DentoraAiChat />

      <div className="relative flex flex-1 flex-col lg:flex-row">
        {/* ── Left rail: progress ─────────────────────────────── */}
        <motion.aside
          initial={{ opacity: 0, y: 14 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5, ease: [0.25, 0.46, 0.45, 0.94] }}
          className="relative w-full border-b border-[var(--mk-hairline)] px-5 py-7 sm:px-7 lg:sticky lg:top-18 lg:h-[calc(100svh-4.5rem)] lg:w-[38%] lg:overflow-y-auto lg:border-b-0 lg:border-r lg:py-10"
        >
          <div className="pointer-events-none absolute inset-0 overflow-hidden">
            <div className="mk-glow mk-glow-primary mk-animate-breathe absolute -left-24 top-8 size-72" />
            <div className="mk-glow mk-glow-secondary absolute bottom-24 right-6 size-48" />
          </div>

          <div className="relative space-y-8">
            <div>
              <span className="mk-chip mb-3 inline-flex items-center rounded-full px-3 py-1 text-xs font-medium uppercase tracking-wider mk-accent">
                Onboarding
              </span>
              <h1 className="font-display text-3xl font-bold leading-[1.1] tracking-[-0.025em] mk-heading sm:text-[2rem]">
                Build your{' '}
                <span className="bg-gradient-to-r from-[#22a6e2] to-[#0a6aa3] bg-clip-text text-transparent">
                  AI front desk
                </span>
              </h1>
              <p className="mt-3 max-w-md text-sm leading-relaxed mk-muted">
                Set up your Dentora AI receptionist in a few simple steps — calls, scheduling, and
                patient communication on autopilot.
              </p>
            </div>

            <div className="mk-panel rounded-2xl p-4">
              <p className="text-xs mk-faint">
                Step {activeStepIndex + 1} of {totalSteps}
              </p>
              <p className="mt-1 text-sm font-semibold mk-heading">{activeStep.label}</p>
              <div className="mt-3 h-1.5 w-full overflow-hidden rounded-full bg-[var(--mk-inset-bg)]">
                <div
                  className="h-full rounded-full bg-gradient-to-r from-[#2bb0ef] to-[#0a84c9] transition-all duration-500"
                  style={{ width: `${((activeStepIndex + 1) / totalSteps) * 100}%` }}
                />
              </div>
            </div>

            <div className="space-y-1.5">
              {ONBOARDING_STEPS.map((step, index) => {
                const isActive = index === activeStepIndex;
                const isDone = index < activeStepIndex;
                return (
                  <div
                    key={step.id}
                    className={`flex items-center gap-3 rounded-xl border px-3 py-2 text-sm transition-colors ${
                      isActive
                        ? 'border-primary/35 bg-primary/[0.08] font-medium mk-heading'
                        : 'border-transparent mk-muted'
                    }`}
                  >
                    <span
                      className={`flex size-5 shrink-0 items-center justify-center rounded-full text-[10px] font-medium tabular-nums ${
                        isDone
                          ? 'bg-gradient-to-br from-[#2bb0ef] to-[#0a84c9] text-white'
                          : isActive
                            ? 'mk-icon-tile mk-accent'
                            : 'bg-[var(--mk-inset-bg)] mk-faint'
                      }`}
                    >
                      {isDone ? '✓' : String(index + 1)}
                    </span>
                    <span className="truncate">{step.label}</span>
                  </div>
                );
              })}
            </div>
          </div>
        </motion.aside>

        {/* ── Right: step content ─────────────────────────────── */}
        <div className="relative isolate w-full flex-1 lg:w-[62%]">
          <div className="pointer-events-none absolute inset-0 -z-10 overflow-hidden">
            <div className="mk-grid mk-fade-edges absolute inset-0" />
          </div>
          <motion.main
            initial={{ opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.55, ease: [0.25, 0.46, 0.45, 0.94], delay: 0.1 }}
            className="mx-auto w-full max-w-4xl px-4 py-8 sm:px-7 sm:py-10"
          >
            <ErrorBoundary>{children}</ErrorBoundary>
          </motion.main>
        </div>
      </div>
    </div>
  );
}
