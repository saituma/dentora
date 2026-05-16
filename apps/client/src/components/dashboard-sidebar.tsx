'use client';

import { useCallback } from 'react';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { useAppSelector, useAppDispatch } from '@/store/hooks';
import { logout } from '@/features/auth/authSlice';
import { useLogoutMutation } from '@/features/auth/authApi';
import { useGetClinicQuery } from '@/features/clinic/clinicApi';
import { clinicApi } from '@/features/clinic/clinicApi';
import { callsApi } from '@/features/calls/callsApi';
import { analyticsApi } from '@/features/analytics/analyticsApi';
import { patientsApi } from '@/features/patients/patientsApi';
import { appointmentsApi } from '@/features/appointments/appointmentsApi';
import { integrationsApi } from '@/features/integrations/integrationsApi';
import { aiConfigApi } from '@/features/aiConfig/aiConfigApi';
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarRail,
} from '@/components/ui/sidebar';
import { NavUser } from '@/components/nav-user';
import NextImage from 'next/image';
import {
  LayoutDashboardIcon,
  BotIcon,
  PhoneIcon,
  BarChart3Icon,
  PlugIcon,
  SettingsIcon,
  CalendarIcon,
  UsersIcon,
  StethoscopeIcon,
  ActivityIcon,
  ClipboardCheckIcon,
  PoundSterlingIcon,
  BuildingIcon,
  HelpCircleIcon,
  PhoneMissedIcon,
  MessageSquareIcon,
  CreditCardIcon,
} from 'lucide-react';

const navMain = [
  { title: 'Overview', url: '/dashboard', icon: LayoutDashboardIcon },
  { title: 'AI Receptionist', url: '/dashboard/ai-receptionist', icon: BotIcon },
  { title: 'Dentora Agent', url: '/dashboard/elevenlabs-agent', icon: BotIcon },
  { title: 'Appointments', url: '/dashboard/appointments', icon: CalendarIcon },
  { title: 'Patients', url: '/dashboard/patients', icon: UsersIcon },
  { title: 'Staff', url: '/dashboard/staff', icon: StethoscopeIcon },
  { title: 'Staff Review', url: '/dashboard/staff-review', icon: ClipboardCheckIcon },
  { title: 'Prices', url: '/dashboard/prices', icon: PoundSterlingIcon },
  { title: 'FAQs', url: '/dashboard/faqs', icon: HelpCircleIcon },
  { title: 'Calls', url: '/dashboard/calls', icon: PhoneIcon },
  { title: 'Missed Calls', url: '/dashboard/missed-calls', icon: PhoneMissedIcon },
  { title: 'Analytics', url: '/dashboard/analytics', icon: BarChart3Icon },
];

const navSecondary = [
  { title: 'Clinic Details', url: '/dashboard/clinic', icon: BuildingIcon },
  { title: 'Messages', url: '/dashboard/messages', icon: MessageSquareIcon },
  { title: 'Integrations', url: '/dashboard/integrations', icon: PlugIcon },
  { title: 'Billing', url: '/dashboard/billing', icon: CreditCardIcon },
  { title: 'Settings', url: '/dashboard/settings', icon: SettingsIcon },
];

export function DashboardSidebar() {
  const pathname = usePathname();
  const router = useRouter();
  const dispatch = useAppDispatch();
  const { user } = useAppSelector((state) => state.auth);
  const { data: clinic } = useGetClinicQuery();
  const [logoutApi] = useLogoutMutation();

  const handlePrefetch = useCallback(
    (url: string) => {
      const opts = { ifOlderThan: 60 } as const;
      switch (url) {
        case '/dashboard/calls':
          dispatch(callsApi.util.prefetch('getCalls', { limit: 50 }, opts));
          break;
        case '/dashboard/analytics': {
          const params = {
            startDate: new Date(Date.now() - 30 * 86_400_000).toISOString(),
            endDate: new Date().toISOString(),
          };
          dispatch(analyticsApi.util.prefetch('getDashboardStats', params, opts));
          dispatch(analyticsApi.util.prefetch('getHourlyVolume', params, opts));
          break;
        }
        case '/dashboard/patients':
          dispatch(patientsApi.util.prefetch('getPatients', undefined, opts));
          break;
        case '/dashboard/appointments':
          dispatch(appointmentsApi.util.prefetch('getUpcomingAppointments', undefined, opts));
          break;
        case '/dashboard/integrations':
          dispatch(integrationsApi.util.prefetch('getIntegrations', undefined, opts));
          break;
        case '/dashboard/ai-receptionist':
          dispatch(aiConfigApi.util.prefetch('getVoiceProfile', undefined, opts));
          dispatch(aiConfigApi.util.prefetch('getServices', undefined, opts));
          dispatch(aiConfigApi.util.prefetch('getBookingRules', undefined, opts));
          break;
        case '/dashboard/settings':
        case '/dashboard/staff':
          dispatch(clinicApi.util.prefetch('getClinic', undefined, opts));
          break;
        default:
          break;
      }
    },
    [dispatch],
  );

  const handleLogout = async () => {
    try {
      await logoutApi().unwrap();
    } catch {
      // proceed with local logout even if API call fails
    }
    dispatch(logout());
    if (typeof window !== 'undefined') {
      localStorage.removeItem('auth_token');
      localStorage.removeItem('refresh_token');
    }
    router.push('/login');
  };

  const clinicName = clinic?.clinicName ?? 'Your Clinic';
  const clinicSub = clinic?.phone ?? clinic?.email ?? user?.email ?? 'Dental clinic';

  return (
    <Sidebar collapsible="icon">
      <SidebarHeader>
        <SidebarMenu>
          <SidebarMenuItem>
            <SidebarMenuButton
              size="lg"
              tooltip={clinicName}
              render={<Link href="/dashboard" />}
              className="data-[slot=sidebar-menu-button]:h-auto data-[slot=sidebar-menu-button]:p-2!"
            >
              <div className="relative flex size-8 shrink-0 items-center justify-center overflow-hidden rounded-lg bg-primary/10 text-primary">
                {clinic?.logo ? (
                  <NextImage
                    src={clinic.logo}
                    alt={clinicName}
                    fill
                    className="object-cover"
                    unoptimized
                  />
                ) : (
                  <ActivityIcon className="size-4" />
                )}
              </div>
              <div className="grid flex-1 text-left text-sm leading-tight">
                <span className="truncate font-semibold">{clinicName}</span>
                <span className="truncate text-xs text-muted-foreground">{clinicSub}</span>
              </div>
            </SidebarMenuButton>
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarHeader>

      <SidebarContent>
        <SidebarGroup>
          <SidebarGroupLabel>Platform</SidebarGroupLabel>
          <SidebarGroupContent>
            <SidebarMenu>
              {navMain.map((item) => (
                <SidebarMenuItem key={item.title} onMouseEnter={() => handlePrefetch(item.url)}>
                  <SidebarMenuButton
                    tooltip={item.title}
                    isActive={pathname === item.url}
                    render={<Link href={item.url} />}
                    className={pathname === item.url ? 'nav-active-accent' : ''}
                  >
                    <item.icon />
                    <span>{item.title}</span>
                  </SidebarMenuButton>
                </SidebarMenuItem>
              ))}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>

        <SidebarGroup>
          <SidebarGroupLabel>System</SidebarGroupLabel>
          <SidebarGroupContent>
            <SidebarMenu>
              {navSecondary.map((item) => (
                <SidebarMenuItem key={item.title} onMouseEnter={() => handlePrefetch(item.url)}>
                  <SidebarMenuButton
                    tooltip={item.title}
                    isActive={pathname === item.url}
                    render={<Link href={item.url} />}
                    className={pathname === item.url ? 'nav-active-accent' : ''}
                  >
                    <item.icon />
                    <span>{item.title}</span>
                  </SidebarMenuButton>
                </SidebarMenuItem>
              ))}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>
      </SidebarContent>

      <SidebarFooter>
        <NavUser
          user={{
            name: user?.displayName ?? 'Clinic Admin',
            email: user?.email ?? 'admin@clinic.com',
            avatar: '',
          }}
          onLogout={handleLogout}
        />
      </SidebarFooter>
      <SidebarRail />
    </Sidebar>
  );
}
