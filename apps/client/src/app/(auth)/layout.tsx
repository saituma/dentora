'use client';

import { ErrorBoundary } from '@/components/error-boundary';
import { SiteHeader } from '@/components/marketing/site-chrome';

export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <div
      data-mk-scope
      className="mk-scope mk-bg relative flex min-h-svh flex-col mk-body antialiased"
    >
      <SiteHeader />
      <main className="relative isolate flex flex-1 items-center justify-center px-5 py-12 sm:px-6">
        {/* Ambient depth */}
        <div className="pointer-events-none absolute inset-0 -z-10 overflow-hidden">
          <div className="mk-grid mk-fade-edges absolute inset-0" />
          <div className="mk-glow mk-glow-primary mk-animate-breathe left-1/2 top-[-8%] size-[520px] -translate-x-1/2" />
          <div className="mk-glow mk-glow-secondary absolute bottom-[6%] right-[12%] size-[320px]" />
        </div>

        <div className="w-full max-w-md">
          <div className="mk-panel rounded-3xl p-7 sm:p-8">
            <ErrorBoundary>{children}</ErrorBoundary>
          </div>
          <p className="mt-6 text-center text-xs mk-faint">
            UK GDPR compliant · End-to-end encrypted · Trusted by UK & Ireland clinics
          </p>
        </div>
      </main>
    </div>
  );
}
