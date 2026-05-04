"use client";

import { AppSidebar } from "@/components/app-sidebar";
import { AuthGuard } from "@/components/auth-guard";
import {
  SidebarInset,
  SidebarProvider,
  SidebarTrigger,
} from "@/components/ui/sidebar";
import { TooltipProvider } from "@/components/ui/tooltip";

export function DashboardShell({ children }: { children: React.ReactNode }) {
  return (
    <AuthGuard>
      <TooltipProvider>
        <SidebarProvider>
          <AppSidebar />
          <SidebarInset className="bg-[#fafafa] dark:bg-[#050505]">
            <header className="flex h-14 shrink-0 items-center gap-2 px-6 border-b border-zinc-200/50 dark:border-white/5">
              <SidebarTrigger className="-ml-1" />
              <div className="h-4 w-px bg-zinc-200 dark:bg-zinc-800 mx-2" />
              <div className="flex items-center gap-2">
                <span className="text-xs font-bold text-emerald-500 uppercase tracking-widest">
                  Admin
                </span>
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
              </div>
            </header>
            <main className="flex-1 p-6 md:p-8 lg:p-10">{children}</main>
          </SidebarInset>
        </SidebarProvider>
      </TooltipProvider>
    </AuthGuard>
  );
}
