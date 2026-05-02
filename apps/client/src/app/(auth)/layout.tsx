'use client';

import { motion } from 'framer-motion';
import { ErrorBoundary } from '@/components/error-boundary';

export default function AuthLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="relative min-h-svh overflow-hidden bg-background">
      <div className="pointer-events-none absolute inset-0 bg-grid-small text-foreground/[0.05]" />
      <div className="relative grid min-h-svh grid-cols-1 lg:grid-cols-[46vw_54vw]">
        <motion.aside
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.45, ease: 'easeOut' }}
          className="relative w-full border-b border-foreground/[0.08] px-6 py-10 sm:px-10 lg:h-svh lg:border-b-0 lg:border-r lg:px-14 lg:py-14"
        >
          <div className="pointer-events-none absolute inset-0">
            <div className="absolute inset-0 bg-noise-pattern opacity-[0.035]" />
            <div className="absolute -left-20 top-14 h-56 w-56 rounded-full bg-primary/15 blur-3xl" />
          </div>
          <div className="relative flex h-full max-w-2xl flex-col justify-between">
            <p className="text-[11px] uppercase tracking-[0.24em] text-muted-foreground">Dentora Auth</p>
            <div className="space-y-6">
              <h1 className="text-4xl leading-tight font-medium text-foreground sm:text-5xl lg:text-6xl">
                Secure access for your clinic team
              </h1>
              <p className="max-w-xl text-base leading-relaxed text-muted-foreground sm:text-lg">
                Continue with Google, password, or email code. Your account setup and onboarding stay in sync.
              </p>
            </div>
            <p className="text-[10px] font-mono uppercase tracking-[0.22em] text-muted-foreground">Protected by enterprise-grade authentication</p>
          </div>
        </motion.aside>

        <motion.main
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5, ease: 'easeOut', delay: 0.08 }}
          className="flex w-full items-center px-4 py-8 sm:px-8 lg:px-12"
        >
          <div className="w-full"><ErrorBoundary>{children}</ErrorBoundary></div>
        </motion.main>
      </div>
    </div>
  );
}
