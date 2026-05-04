"use client";

import {
  Activity,
  Building2,
  LayoutDashboard,
  LogOut,
  Phone,
  ScrollText,
  Settings,
  ShieldCheck,
  Users,
} from "lucide-react";
import { usePathname, useRouter } from "next/navigation";
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
} from "@/components/ui/sidebar";
import { logout } from "@/features/auth/authSlice";
import { clearTokens } from "@/lib/api";
import { useAppDispatch } from "@/store/hooks";

const navItems = [
  { title: "Dashboard", href: "/", icon: LayoutDashboard },
  { title: "Clinics", href: "/tenants", icon: Building2 },
  { title: "Calls", href: "/calls", icon: Phone },
  { title: "Users", href: "/users", icon: Users },
  { title: "Audit Log", href: "/audit", icon: ScrollText },
  { title: "Live Logs", href: "/logs", icon: Activity },
  { title: "Providers", href: "/providers", icon: ShieldCheck },
  { title: "Settings", href: "/settings", icon: Settings },
];

export function AppSidebar(props: React.ComponentProps<typeof Sidebar>) {
  const pathname = usePathname();
  const router = useRouter();
  const dispatch = useAppDispatch();

  const handleLogout = () => {
    clearTokens();
    dispatch(logout());
    router.push("/login");
  };

  return (
    <Sidebar variant="inset" {...props} className="border-none bg-transparent">
      <SidebarHeader className="p-6">
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-2xl bg-emerald-500 shadow-[0_0_20px_rgba(16,185,129,0.4)] text-white">
            <Activity size={24} />
          </div>
          <div className="flex flex-col gap-0.5">
            <span className="font-bold tracking-tight text-zinc-900 dark:text-zinc-50">
              Dentora
            </span>
            <span className="text-[10px] uppercase tracking-widest font-bold text-emerald-500">
              Admin Portal
            </span>
          </div>
        </div>
      </SidebarHeader>
      <SidebarContent className="px-4">
        <SidebarMenu>
          {navItems.map((item) => {
            const isActive =
              item.href === "/"
                ? pathname === "/"
                : pathname.startsWith(item.href);
            return (
              <SidebarMenuItem key={item.title}>
                <SidebarMenuButton
                  tooltip={item.title}
                  isActive={isActive}
                  onClick={() => router.push(item.href)}
                  className={
                    isActive
                      ? "bg-emerald-500/10 text-emerald-500 hover:bg-emerald-500/15"
                      : ""
                  }
                >
                  <span className="flex items-center gap-3 font-medium">
                    <item.icon size={20} />
                    <span>{item.title}</span>
                  </span>
                </SidebarMenuButton>
              </SidebarMenuItem>
            );
          })}
        </SidebarMenu>
      </SidebarContent>
      <SidebarFooter className="p-4 mt-auto">
        <SidebarMenu>
          <SidebarMenuItem>
            <SidebarMenuButton
              tooltip="Logout"
              onClick={handleLogout}
              className="flex items-center gap-3 font-medium text-zinc-500 dark:text-zinc-400 hover:text-rose-500 cursor-pointer"
            >
              <LogOut size={20} />
              <span>Logout</span>
            </SidebarMenuButton>
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarFooter>
    </Sidebar>
  );
}
