"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useAppSelector, useAppDispatch } from "@/store/hooks";
import { logout } from "@/features/auth/authSlice";
import { useLogoutMutation } from "@/features/auth/authApi";
import { useGetClinicQuery } from "@/features/clinic/clinicApi";
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
} from "@/components/ui/sidebar";
import { NavUser } from "@/components/nav-user";
import {
  LayoutDashboardIcon,
  BotIcon,
  PhoneIcon,
  BarChart3Icon,
  PlugIcon,
  SettingsIcon,
  CreditCardIcon,
  CalendarIcon,
  Building2Icon,
  ChevronsUpDownIcon,
  UsersIcon,
  StethoscopeIcon,
} from "lucide-react";

const navItems = [
  { title: "Overview", url: "/dashboard", icon: <LayoutDashboardIcon /> },
  {
    title: "AI Receptionist",
    url: "/dashboard/ai-receptionist",
    icon: <BotIcon />,
  },
  {
    title: "Dentora Agent",
    url: "/dashboard/elevenlabs-agent",
    icon: <BotIcon />,
  },
  {
    title: "Browser Call",
    url: "/dashboard/browser-call",
    icon: <PhoneIcon />,
  },
  {
    title: "Appointments",
    url: "/dashboard/appointments",
    icon: <CalendarIcon />,
  },
  {
    title: "Patients",
    url: "/dashboard/patients",
    icon: <UsersIcon />,
  },
  {
    title: "Staff",
    url: "/dashboard/staff",
    icon: <StethoscopeIcon />,
  },
  { title: "Calls", url: "/dashboard/calls", icon: <PhoneIcon /> },
  {
    title: "Analytics",
    url: "/dashboard/analytics",
    icon: <BarChart3Icon />,
  },
  {
    title: "Integrations",
    url: "/dashboard/integrations",
    icon: <PlugIcon />,
  },
  { title: "Settings", url: "/dashboard/settings", icon: <SettingsIcon /> },
  { title: "Billing", url: "/dashboard/billing", icon: <CreditCardIcon /> },
];

export function DashboardSidebar() {
  const pathname = usePathname();
  const router = useRouter();
  const dispatch = useAppDispatch();
  const { user } = useAppSelector((state) => state.auth);
  const { data: clinic } = useGetClinicQuery();
  const [logoutApi] = useLogoutMutation();

  const handleLogout = async () => {
    try {
      const refreshToken =
        typeof window !== "undefined"
          ? localStorage.getItem("refresh_token")
          : null;
      if (refreshToken) {
        await logoutApi({ refreshToken }).unwrap();
      }
    } catch {
      // proceed with local logout even if API call fails
    }
    dispatch(logout());
    if (typeof window !== "undefined") {
      localStorage.removeItem("auth_token");
      localStorage.removeItem("refresh_token");
    }
    router.push("/login");
  };

  return (
    <Sidebar collapsible="offcanvas">
      <SidebarHeader>
        <SidebarMenu>
          <SidebarMenuItem>
            <SidebarMenuButton
              className="data-[slot=sidebar-menu-button]:h-auto data-[slot=sidebar-menu-button]:p-2!"
              render={<Link href="/dashboard" />}
            >
              <div className="bg-primary/10 text-primary flex size-8 items-center justify-center rounded-md">
                <Building2Icon className="size-4" />
              </div>
              <div className="min-w-0 flex-1 text-left leading-tight">
                <span className="block truncate text-sm font-semibold">
                  {clinic?.clinicName ?? "Your Clinic"}
                </span>
                <span className="text-muted-foreground block truncate text-xs">
                  {clinic?.phone ??
                    clinic?.email ??
                    user?.email ??
                    "Dental clinic"}
                </span>
              </div>
              <ChevronsUpDownIcon className="text-muted-foreground ml-auto size-4" />
            </SidebarMenuButton>
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarHeader>
      <SidebarContent className="px-2 pb-2">
        <SidebarMenu>
          {navItems.map((item) => (
            <SidebarMenuItem key={item.title}>
              <SidebarMenuButton
                tooltip={item.title}
                isActive={pathname === item.url}
                render={<Link href={item.url} />}
              >
                {item.icon}
                <span>{item.title}</span>
              </SidebarMenuButton>
            </SidebarMenuItem>
          ))}
        </SidebarMenu>
      </SidebarContent>
      <SidebarFooter>
        <NavUser
          user={{
            name: user?.displayName ?? "Clinic Admin",
            email: user?.email ?? "admin@clinic.com",
            avatar: "",
          }}
          onLogout={handleLogout}
        />
      </SidebarFooter>
    </Sidebar>
  );
}
