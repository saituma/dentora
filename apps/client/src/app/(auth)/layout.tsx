'use client';

import { motion } from 'framer-motion';
import { ErrorBoundary } from '@/components/error-boundary';
import { ShatteredToothBg } from '@/components/shattered-tooth-bg';

export default function AuthLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="dark relative min-h-svh overflow-hidden bg-[#0a0e1a]">
      <ShatteredToothBg />
      <div className="relative z-10 grid min-h-svh grid-cols-1 lg:grid-cols-[46vw_54vw]">
        <motion.aside
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.45, ease: 'easeOut' }}
          className="relative w-full border-b border-white/[0.06] px-6 py-10 sm:px-10 lg:h-svh lg:border-b-0 lg:border-r lg:px-14 lg:py-14"
        >
          <div className="pointer-events-none absolute inset-0">
            <div className="absolute -left-20 top-14 h-56 w-56 rounded-full bg-blue-500/10 blur-3xl" />
          </div>
          <div className="relative flex h-full max-w-2xl flex-col justify-between">
            <p className="text-[11px] uppercase tracking-[0.24em] text-gray-500">Dentora Auth</p>
            <div className="space-y-6">
              <h1 className="text-4xl leading-tight font-medium text-white sm:text-5xl lg:text-6xl">
                Secure access for your clinic team
              </h1>
              <p className="max-w-xl text-base leading-relaxed text-gray-400 sm:text-lg">
                Continue with Google, password, or email code. Your account setup and onboarding stay in sync.
              </p>
            </div>
            <p className="text-[10px] font-mono uppercase tracking-[0.22em] text-gray-500">Protected by enterprise-grade authentication</p>
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
