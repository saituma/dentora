'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { usePathname, useRouter } from 'next/navigation';
import { useTheme } from 'next-themes';
import { useAppSelector, useAppDispatch } from '@/store/hooks';
import { logout } from '@/features/auth/authSlice';
import {
  markAllNotificationsRead,
  markNotificationRead,
} from '@/features/ui/uiSlice';
import { Separator } from '@/components/ui/separator';
import { SidebarTrigger } from '@/components/ui/sidebar';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import {
  UserIcon,
  CreditCardIcon,
  SettingsIcon,
  BellIcon,
  LogOutIcon,
  MoonIcon,
  SunIcon,
} from 'lucide-react';

const TITLES: Record<string, string> = {
  '/dashboard': 'Overview',
  '/dashboard/ai-receptionist': 'AI Receptionist',
  '/dashboard/elevenlabs-agent': 'ElevenLabs Agent',
  '/dashboard/appointments': 'Appointments',
  '/dashboard/patients': 'Patients',
  '/dashboard/staff': 'Staff',
  '/dashboard/calls': 'Call History',
  '/dashboard/analytics': 'Analytics',
  '/dashboard/integrations': 'Integrations',
  '/dashboard/settings': 'Settings',
  '/dashboard/billing': 'Billing',
};

export function DashboardHeader() {
  const pathname = usePathname();
  const dispatch = useAppDispatch();
  const router = useRouter();
  const { theme, setTheme } = useTheme();
  const [mounted, setMounted] = useState(false);
  const { user } = useAppSelector((state) => state.auth);
  const notifications = useAppSelector((state) => state.ui.notifications);
  const title = TITLES[pathname ?? ''] ?? 'Dashboard';
  const unreadCount = notifications.filter(
    (notification) => !notification.read
  ).length;

  useEffect(() => {
    setMounted(true);
  }, []);

  const handleLogout = () => {
    dispatch(logout());
    if (typeof window !== 'undefined') {
      localStorage.removeItem('auth_token');
      localStorage.removeItem('refresh_token');
    }
    router.push('/login');
  };

  const displayName = user?.displayName ?? user?.email?.split('@')[0] ?? 'User';

  const getRelativeTime = (iso: string) => {
    const diff = Date.now() - new Date(iso).getTime();
    const minute = 60 * 1000;
    const hour = 60 * minute;

    if (diff < hour) {
      const minutes = Math.max(1, Math.floor(diff / minute));
      return `${minutes}m ago`;
    }

    const hours = Math.floor(diff / hour);
    return `${hours}h ago`;
  };

  return (
    <header className="flex h-14 shrink-0 items-center gap-2 border-b px-4 transition-[width,height] ease-linear lg:px-6">
      <SidebarTrigger className="-ms-1" />
      <Separator orientation="vertical" className="mx-2 h-4" />
      <h1 className="text-base font-medium">{title}</h1>
      <div className="ml-auto flex items-center gap-2">
        <Button
          variant="ghost"
          size="icon"
          onClick={() => setTheme(theme === 'dark' ? 'light' : 'dark')}
          aria-label="Toggle theme"
        >
          {mounted && theme === 'dark' ? (
            <SunIcon className="size-4" />
          ) : (
            <MoonIcon className="size-4" />
          )}
        </Button>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="ghost" size="icon" className="relative">
              <BellIcon className="size-4" />
              {unreadCount > 0 && (
                <span className="bg-primary absolute end-1.5 top-1.5 size-2 rounded-full" />
              )}
              <span className="sr-only">Notifications</span>
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-80">
            <DropdownMenuGroup>
              <DropdownMenuLabel className="flex items-center justify-between">
                <span>Notifications</span>
                {unreadCount > 0 && (
                  <button
                    type="button"
                    className="text-primary text-xs font-medium"
                    onClick={() => dispatch(markAllNotificationsRead())}
                  >
                    Mark all read
                  </button>
                )}
              </DropdownMenuLabel>
            </DropdownMenuGroup>
            <DropdownMenuSeparator />
            {notifications.length === 0 ? (
              <div className="p-4 text-center text-sm text-muted-foreground">
                No new notifications
              </div>
            ) : (
              <DropdownMenuGroup>
                {notifications.slice(0, 6).map((notification) => (
                  <DropdownMenuItem
                    key={notification.id}
                    className="items-start"
                    onClick={() =>
                      dispatch(markNotificationRead(notification.id))
                    }
                  >
                    <div className="flex w-full items-start gap-3">
                      <span
                        className={`mt-1.5 size-2 shrink-0 rounded-full ${
                          notification.read
                            ? 'bg-muted-foreground/40'
                            : 'bg-primary'
                        }`}
                      />
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-sm font-medium">
                          {notification.title}
                        </p>
                        <p className="text-muted-foreground line-clamp-2 text-xs">
                          {notification.message}
                        </p>
                        <p className="text-muted-foreground mt-1 text-[11px]">
                          {getRelativeTime(notification.createdAt)}
                        </p>
                      </div>
                    </div>
                  </DropdownMenuItem>
                ))}
              </DropdownMenuGroup>
            )}
          </DropdownMenuContent>
        </DropdownMenu>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="ghost" className="relative h-9 w-9 rounded-full">
              <Avatar className="size-8">
                <AvatarFallback>{displayName.charAt(0).toUpperCase()}</AvatarFallback>
              </Avatar>
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-56">
            <DropdownMenuGroup>
              <DropdownMenuLabel>
                <div className="flex flex-col">
                  <span>{displayName}</span>
                  <span className="text-xs font-normal text-muted-foreground">
                    {user?.email}
                  </span>
                </div>
              </DropdownMenuLabel>
            </DropdownMenuGroup>
            <DropdownMenuSeparator />
            <DropdownMenuGroup>
              <DropdownMenuItem asChild>
                <Link href="/dashboard/settings">
                  <UserIcon />
                  Profile
                </Link>
              </DropdownMenuItem>
              <DropdownMenuItem asChild>
                <Link href="/dashboard/settings">
                  <SettingsIcon />
                  Settings
                </Link>
              </DropdownMenuItem>
              <DropdownMenuItem asChild>
                <Link href="/dashboard/billing">
                  <CreditCardIcon />
                  Billing
                </Link>
              </DropdownMenuItem>
            </DropdownMenuGroup>
            <DropdownMenuSeparator />
            <DropdownMenuItem variant="destructive" onClick={handleLogout}>
              <LogOutIcon />
              Log out
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </header>
  );
}
