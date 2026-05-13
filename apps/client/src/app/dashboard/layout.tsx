'use client';

import { AppShell } from '@/components/app-shell';
import { ProtectedRoute } from '@/components/auth/protected-route';
import { ErrorBoundary } from '@/components/error-boundary';
import { DashboardKBarProvider } from '@/components/kbar/provider';

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  return (
    <ErrorBoundary>
      <ProtectedRoute requireOnboardingComplete>
        <DashboardKBarProvider>
          <AppShell>{children}</AppShell>
        </DashboardKBarProvider>
      </ProtectedRoute>
    </ErrorBoundary>
  );
}
