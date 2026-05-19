'use client';

import { motion } from 'framer-motion';
import { ErrorBoundary } from '@/components/error-boundary';
import { Shield, Lock, Zap } from 'lucide-react';
import Link from 'next/link';
import Image from 'next/image';

export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="relative min-h-svh bg-[#f4f2ee]">
      <div className="grid min-h-svh grid-cols-1 lg:grid-cols-[46vw_54vw]">
        {/* Left panel — brand */}
        <motion.aside
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.45, ease: 'easeOut' }}
          className="relative hidden flex-col justify-between border-r border-black/[0.06] bg-[#f4f2ee] px-14 py-14 lg:flex"
        >
          <Link href="/">
            <Image
              src="/dentora.png"
              alt="Dentora"
              width={678}
              height={581}
              className="h-9 w-auto"
            />
          </Link>

          <div className="space-y-5">
            <h1 className="font-display text-5xl font-extrabold leading-tight text-black">
              Your clinic,
              <br />
              always available.
            </h1>
            <p className="max-w-sm text-lg leading-relaxed text-gray-500">
              Dentora handles every patient call 24/7, so your team can focus on what matters most.
            </p>

            <div className="flex flex-wrap gap-4 pt-2">
              {[
                { icon: Shield, label: 'UK GDPR Compliant' },
                { icon: Lock, label: 'End-to-end Encrypted' },
                { icon: Zap, label: 'Instant Setup' },
              ].map((item) => (
                <div key={item.label} className="flex items-center gap-2">
                  <div className="flex size-8 items-center justify-center rounded-lg bg-[#b275ff]/10">
                    <item.icon className="size-4 text-[#b275ff]" />
                  </div>
                  <span className="text-sm text-gray-600">{item.label}</span>
                </div>
              ))}
            </div>
          </div>

          <p className="text-xs text-gray-400">
            © {new Date().getFullYear()} Dentora AI. All rights reserved.
          </p>
        </motion.aside>

        {/* Right panel — form */}
        <motion.main
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5, ease: 'easeOut', delay: 0.08 }}
          className="flex w-full items-center justify-center bg-white px-6 py-10 sm:px-10 lg:px-16"
        >
          <div className="w-full max-w-md">
            {/* Mobile logo */}
            <div className="mb-8 flex justify-center lg:hidden">
              <Link href="/">
                <Image
                  src="/dentora.png"
                  alt="Dentora"
                  width={678}
                  height={581}
                  className="h-8 w-auto"
                />
              </Link>
            </div>
            <ErrorBoundary>{children}</ErrorBoundary>
          </div>
        </motion.main>
      </div>
    </div>
  );
}
