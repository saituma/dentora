"use client";

import { useKBar } from "kbar";
import { Search } from "lucide-react";
import { usePathname } from "next/navigation";
import { AppSidebar } from "@/components/app-sidebar";
import { AuthGuard } from "@/components/auth-guard";
import { ThemeToggle } from "@/components/theme-toggle";
import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator,
} from "@/components/ui/breadcrumb";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import {
  SidebarInset,
  SidebarProvider,
  SidebarTrigger,
} from "@/components/ui/sidebar";

const segmentLabel: Record<string, string> = {
  tenants: "Clinics",
  calls: "Calls",
  users: "Users",
  audit: "Audit Log",
  logs: "Live Logs",
  providers: "Providers",
  settings: "Settings",
  system: "System Health",
  analytics: "Analytics",
  cost: "Cost",
  "phone-pool": "Phone Pool",
  "demo-requests": "Demo Requests",
};

function HeaderBreadcrumb() {
  const pathname = usePathname();
  const segments = pathname.split("/").filter(Boolean);

  if (segments.length === 0) {
    return (
      <Breadcrumb>
        <BreadcrumbList>
          <BreadcrumbItem>
            <BreadcrumbPage>Dashboard</BreadcrumbPage>
          </BreadcrumbItem>
        </BreadcrumbList>
      </Breadcrumb>
    );
  }

  return (
    <Breadcrumb>
      <BreadcrumbList>
        <BreadcrumbItem className="hidden md:block">
          <BreadcrumbLink href="/">Dashboard</BreadcrumbLink>
        </BreadcrumbItem>
        {segments.map((seg, i) => {
          const isLast = i === segments.length - 1;
          const label =
            segmentLabel[seg] ?? seg.charAt(0).toUpperCase() + seg.slice(1);
          return (
            <span key={seg} className="contents">
              <BreadcrumbSeparator className="hidden md:block" />
              <BreadcrumbItem>
                {isLast ? (
                  <BreadcrumbPage>{label}</BreadcrumbPage>
                ) : (
                  <BreadcrumbLink
                    href={`/${segments.slice(0, i + 1).join("/")}`}
                  >
                    {label}
                  </BreadcrumbLink>
                )}
              </BreadcrumbItem>
            </span>
          );
        })}
      </BreadcrumbList>
    </Breadcrumb>
  );
}

function SearchButton() {
  const { query } = useKBar();
  return (
    <Button
      variant="outline"
      size="sm"
      onClick={query.toggle}
      className="hidden h-8 gap-2 text-muted-foreground md:flex"
    >
      <Search className="size-3.5" />
      <span className="text-xs">Search…</span>
      <kbd className="pointer-events-none ml-1 flex h-5 items-center gap-0.5 rounded border border-border bg-muted px-1 text-[10px] font-medium">
        <span>⌘</span>K
      </kbd>
    </Button>
  );
}

export function DashboardShell({ children }: { children: React.ReactNode }) {
  return (
    <AuthGuard>
      <div data-mk-scope className="mk-scope relative">
        {/* Ambient premium depth behind the app */}
        <div className="pointer-events-none fixed inset-0 z-0 overflow-hidden">
          <div className="mk-glow mk-glow-primary absolute -top-40 left-1/3 size-[560px] opacity-40" />
          <div className="mk-glow mk-glow-secondary absolute bottom-0 right-0 size-[420px] opacity-30" />
        </div>
        <div className="relative z-10">
          <SidebarProvider>
            <AppSidebar />
            <SidebarInset>
              <header className="flex h-16 shrink-0 items-center gap-2 transition-[width,height] ease-linear group-has-[[data-collapsible=icon]]/sidebar-wrapper:h-12">
                <div className="flex flex-1 items-center gap-2 px-4">
                  <SidebarTrigger className="-ml-1" />
                  <Separator orientation="vertical" className="mr-2 h-4" />
                  <HeaderBreadcrumb />
                  <div className="ml-auto flex items-center gap-2">
                    <SearchButton />
                    <ThemeToggle />
                  </div>
                </div>
              </header>
              <div className="flex flex-1 flex-col gap-4 p-4 pt-0">
                {children}
              </div>
            </SidebarInset>
          </SidebarProvider>
        </div>
      </div>
    </AuthGuard>
  );
}
