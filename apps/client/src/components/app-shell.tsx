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
    <div className="relative bg-background">
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
