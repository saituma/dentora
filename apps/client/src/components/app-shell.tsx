'use client';

import { DashboardSidebar } from '@/components/dashboard-sidebar';
import { DashboardHeader } from '@/components/dashboard-header';
import { ShatteredToothBg } from '@/components/shattered-tooth-bg';
import { DentoraAiChat } from '@/components/dentora-ai-chat';
import { SidebarInset, SidebarProvider } from '@/components/ui/sidebar';

interface AppShellProps {
  children: React.ReactNode;
}

export function AppShell({ children }: AppShellProps) {
  return (
    <div className="dark relative bg-[#0a0e1a]">
      <ShatteredToothBg />
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
              <div className="flex flex-1 flex-col gap-4 p-4 animate-fade-up lg:gap-6 lg:p-6">
                {children}
              </div>
            </div>
          </SidebarInset>
        </SidebarProvider>
      </div>
    </div>
  );
}
