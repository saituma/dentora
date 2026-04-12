"use client";

import { DashboardSidebar } from "@/components/dashboard-sidebar";
import { DashboardHeader } from "@/components/dashboard-header";
import { SidebarInset, SidebarProvider } from "@/components/ui/sidebar";

interface AppShellProps {
  children: React.ReactNode;
}

export function AppShell({ children }: AppShellProps) {
  return (
    <SidebarProvider
      style={
        {
          "--sidebar-width": "calc(var(--spacing) * 72)",
          "--header-height": "calc(var(--spacing) * 14)",
        } as React.CSSProperties
      }
    >
      <DashboardSidebar />
      <SidebarInset>
        <DashboardHeader />
        <div className="flex flex-1 flex-col overflow-auto [--border:#c7def0] [--card:#E3F2FD] [--popover:#E3F2FD] dark:[--border:color-mix(in_srgb,var(--brand-bg)_70%,var(--brand-text))] dark:[--card:color-mix(in_srgb,var(--brand-bg)_88%,var(--brand-highlight))] dark:[--popover:color-mix(in_srgb,var(--brand-bg)_86%,var(--brand-highlight))]">
          <div className="flex flex-1 flex-col gap-4 p-4 lg:gap-6 lg:p-6">
            {children}
          </div>
        </div>
      </SidebarInset>
    </SidebarProvider>
  );
}
