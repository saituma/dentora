'use client';

import { usePathname } from 'next/navigation';
import { DashboardSidebar } from '@/components/dashboard-sidebar';
import { DashboardHeader } from '@/components/dashboard-header';
import { DentoraAiChat } from '@/components/dentora-ai-chat';
import { SidebarInset, SidebarProvider } from '@/components/ui/sidebar';

interface AppShellProps {
  children: React.ReactNode;
}

export function AppShell({ children }: AppShellProps) {
  const pathname = usePathname();
  return (
    <div data-mk-scope className="mk-scope relative bg-transparent">
      {/* Ambient premium depth behind the app (z-0, sits above body bg, below content) */}
      <div className="pointer-events-none fixed inset-0 z-0 overflow-hidden">
        <div className="mk-glow mk-glow-primary absolute -top-40 left-1/3 size-[560px] opacity-40" />
        <div className="mk-glow mk-glow-secondary absolute bottom-0 right-0 size-[420px] opacity-30" />
      </div>
      <DentoraAiChat />
      <div className="relative z-10">
        <SidebarProvider
          style={
            {
              '--sidebar-width': 'calc(var(--spacing) * 72)',
              '--header-height': 'calc(var(--spacing) * 14)',
            } as React.CSSProperties
          }
        >
          <DashboardSidebar />
          <SidebarInset>
            <DashboardHeader />
            <div className="flex flex-1 flex-col overflow-auto">
              <div
                key={pathname}
                className="flex flex-1 flex-col gap-4 p-4 animate-fade-up lg:gap-6 lg:p-6"
              >
                {children}
              </div>
            </div>
          </SidebarInset>
        </SidebarProvider>
      </div>
    </div>
  );
}
