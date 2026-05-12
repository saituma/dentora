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
          <SidebarInset className="bg-[#F6F6F6]">
            <header className="flex h-12 shrink-0 items-center gap-3 px-5 bg-white border-b border-black/[0.07]">
              <SidebarTrigger className="-ml-1 text-zinc-500 hover:text-zinc-900" />
              <div className="h-4 w-px bg-black/10" />
              <div className="flex items-center gap-2">
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
                <span className="text-xs font-bold text-zinc-900 uppercase tracking-widest">
                  Admin
                </span>
              </div>
            </header>
            <main className="flex-1 p-6 md:p-8">{children}</main>
          </SidebarInset>
        </SidebarProvider>
      </TooltipProvider>
    </AuthGuard>
  );
}
