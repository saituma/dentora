'use client';

import { motion } from 'framer-motion';
import { ErrorBoundary } from '@/components/error-boundary';
import { ShatteredToothBg } from '@/components/shattered-tooth-bg';
import { Shield, Lock, Zap } from 'lucide-react';

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
            <div className="absolute bottom-20 right-10 h-40 w-40 rounded-full bg-blue-600/5 blur-3xl" />
          </div>

          <div className="relative flex h-full max-w-2xl flex-col justify-between">
            <div />

            <div className="space-y-6">
              <h1 className="text-4xl leading-tight font-bold text-white sm:text-5xl lg:text-6xl">
                Secure access for your clinic team
              </h1>
              <p className="max-w-xl text-base leading-relaxed text-gray-400 sm:text-lg">
                Continue with Google, password, or email code. Your account setup and onboarding stay in sync.
              </p>

              <div className="flex flex-wrap gap-4 pt-2">
                {[
                  { icon: Shield, label: 'HIPAA Compliant' },
                  { icon: Lock, label: 'End-to-end Encrypted' },
                  { icon: Zap, label: 'Instant Setup' },
                ].map((item) => (
                  <div key={item.label} className="flex items-center gap-2">
                    <div className="flex size-8 items-center justify-center rounded-lg bg-blue-500/10">
                      <item.icon className="size-4 text-blue-400" />
                    </div>
                    <span className="text-xs font-medium text-gray-400">{item.label}</span>
                  </div>
                ))}
              </div>
            </div>

            <p className="text-[10px] font-mono uppercase tracking-[0.22em] text-gray-600">Protected by enterprise-grade authentication</p>
          </div>
        </motion.aside>

        <motion.main
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5, ease: 'easeOut', delay: 0.08 }}
          className="flex w-full items-center justify-center px-4 py-8 sm:px-8 lg:px-12"
        >
          <div className="w-full max-w-2xl"><ErrorBoundary>{children}</ErrorBoundary></div>
        </motion.main>
      </div>
    </div>
  );
}
