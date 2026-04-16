"use client";

import { AppShell } from "@/components/app-shell";
import { ProtectedRoute } from "@/components/auth/protected-route";
import { ErrorBoundary } from "@/components/error-boundary";

export default function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <ErrorBoundary>
      <ProtectedRoute requireOnboardingComplete>
        <AppShell>{children}</AppShell>
      </ProtectedRoute>
    </ErrorBoundary>
  );
}
