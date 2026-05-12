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
    <Sidebar
      variant="inset"
      {...props}
      className="border-r border-black/[0.07] bg-white"
    >
      <SidebarHeader className="px-5 py-5">
        <div className="flex items-center gap-3">
          <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-emerald-500 text-white shadow-[0_2px_8px_rgba(16,185,129,0.35)]">
            <Activity size={18} />
          </div>
          <div>
            <div className="text-sm font-bold tracking-tight text-zinc-900">
              Dentora
            </div>
            <div className="text-[10px] font-semibold uppercase tracking-widest text-zinc-400">
              Admin
            </div>
          </div>
        </div>
      </SidebarHeader>

      <SidebarContent className="px-3">
        <SidebarMenu className="space-y-0.5">
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
                      ? "bg-zinc-900 text-white hover:bg-zinc-900 hover:text-white rounded-xl font-semibold"
                      : "text-zinc-500 hover:text-zinc-900 hover:bg-black/[0.04] rounded-xl font-medium"
                  }
                >
                  <item.icon size={16} />
                  <span>{item.title}</span>
                </SidebarMenuButton>
              </SidebarMenuItem>
            );
          })}
        </SidebarMenu>
      </SidebarContent>

      <SidebarFooter className="px-3 pb-4">
        <div className="h-px bg-black/[0.06] mb-3" />
        <SidebarMenu>
          <SidebarMenuItem>
            <SidebarMenuButton
              tooltip="Logout"
              onClick={handleLogout}
              className="text-zinc-400 hover:text-rose-500 hover:bg-rose-50 rounded-xl font-medium"
            >
              <LogOut size={16} />
              <span>Logout</span>
            </SidebarMenuButton>
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarFooter>
    </Sidebar>
  );
}
