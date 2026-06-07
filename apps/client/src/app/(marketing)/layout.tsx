'use client';

import { MarketingGuard } from '@/components/auth/marketing-guard';
import { ErrorBoundary } from '@/components/error-boundary';
import { SiteFooter, SiteHeader } from '@/components/marketing/site-chrome';

export default function MarketingLayout({ children }: { children: React.ReactNode }) {
  return (
    <MarketingGuard>
      <div
        data-mk-scope
        className="mk-scope mk-bg relative flex min-h-svh flex-col mk-body antialiased"
      >
        <SiteHeader />
        <main className="flex-1">
          <ErrorBoundary>{children}</ErrorBoundary>
        </main>
        <SiteFooter />
      </div>
    </MarketingGuard>
  );
}
