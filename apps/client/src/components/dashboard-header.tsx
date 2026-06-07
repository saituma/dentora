'use client';

import { useState } from 'react';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { useKBar } from 'kbar';
import { useAppSelector, useAppDispatch } from '@/store/hooks';
import { logout } from '@/features/auth/authSlice';
import { useLogoutMutation } from '@/features/auth/authApi';
import { markAllNotificationsRead, markNotificationRead } from '@/features/ui/uiSlice';
import { Separator } from '@/components/ui/separator';
import { SidebarTrigger } from '@/components/ui/sidebar';
import { Button } from '@/components/ui/button';
import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator,
} from '@/components/ui/breadcrumb';
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
import { ThemeToggle } from '@/components/theme-toggle';
import { UserIcon, SettingsIcon, BellIcon, LogOutIcon, SearchIcon } from 'lucide-react';

const SEGMENT_LABELS: Record<string, string> = {
  dashboard: 'Overview',
  'ai-receptionist': 'AI Receptionist',
  'elevenlabs-agent': 'Dentora Agent',
  appointments: 'Appointments',
  patients: 'Patients',
  staff: 'Staff',
  calls: 'Calls',
  analytics: 'Analytics',
  integrations: 'Integrations',
  settings: 'Settings',
  'test-ai-receptionist': 'Test AI',
};

function HeaderBreadcrumb() {
  const pathname = usePathname() ?? '/dashboard';
  const segments = pathname.split('/').filter(Boolean);

  return (
    <Breadcrumb>
      <BreadcrumbList>
        {segments.map((seg, i) => {
          const isLast = i === segments.length - 1;
          const href = '/' + segments.slice(0, i + 1).join('/');
          const label =
            SEGMENT_LABELS[seg] ?? seg.replace(/-/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
          return (
            <BreadcrumbItem key={href}>
              {isLast ? (
                <BreadcrumbPage>{label}</BreadcrumbPage>
              ) : (
                <>
                  <BreadcrumbLink render={<Link href={href} />}>{label}</BreadcrumbLink>
                  <BreadcrumbSeparator />
                </>
              )}
            </BreadcrumbItem>
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
      className="hidden h-8 gap-2 text-xs text-muted-foreground md:flex"
    >
      <SearchIcon className="size-3.5" />
      Search…
      <kbd className="ml-1 rounded border border-border bg-muted px-1 font-mono text-[10px]">
        ⌘K
      </kbd>
    </Button>
  );
}

export function DashboardHeader() {
  const dispatch = useAppDispatch();
  const router = useRouter();
  const { user } = useAppSelector((state) => state.auth);
  const [logoutApi] = useLogoutMutation();
  const notifications = useAppSelector((state) => state.ui.notifications);
  const unreadCount = notifications.filter((n) => !n.read).length;
  const [relativeTimeBase] = useState(() => Date.now());

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

  const displayName = user?.displayName ?? user?.email?.split('@')[0] ?? 'User';

  const getRelativeTime = (iso: string) => {
    const diff = relativeTimeBase - new Date(iso).getTime();
    const minute = 60 * 1000;
    const hour = 60 * minute;
    if (diff < hour) return `${Math.max(1, Math.floor(diff / minute))}m ago`;
    return `${Math.floor(diff / hour)}h ago`;
  };

  return (
    <header className="flex h-14 shrink-0 items-center gap-2 border-b border-border bg-background/80 px-4 backdrop-blur-xl transition-[width,height] ease-linear group-has-[[data-collapsible=icon]]/sidebar-wrapper:h-12 lg:px-6">
      <SidebarTrigger className="-ms-1 opacity-60 hover:opacity-100 transition-opacity" />
      <Separator orientation="vertical" className="mr-2 h-4 opacity-20" />
      <HeaderBreadcrumb />
      <div className="ml-auto flex items-center gap-2">
        <SearchButton />
        <ThemeToggle />

        {/* Notifications */}
        <DropdownMenu>
          <DropdownMenuTrigger
            render={
              <Button
                variant="ghost"
                size="icon"
                className="relative"
                aria-label="Open notifications"
              />
            }
          >
            <BellIcon className="size-4" />
            {unreadCount > 0 && (
              <span className="bg-primary animate-pulse-dot absolute end-1.5 top-1.5 size-2 rounded-full shadow-[0_0_6px_1px] shadow-primary/60" />
            )}
            <span className="sr-only">Notifications</span>
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
                    onClick={() => dispatch(markNotificationRead(notification.id))}
                  >
                    <div className="flex w-full items-start gap-3">
                      <span
                        className={`mt-1.5 size-2 shrink-0 rounded-full ${
                          notification.read ? 'bg-muted-foreground/40' : 'bg-primary'
                        }`}
                      />
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-sm font-medium">{notification.title}</p>
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

        {/* User menu */}
        <DropdownMenu>
          <DropdownMenuTrigger
            render={
              <Button
                variant="ghost"
                className="relative h-9 w-9 rounded-full"
                aria-label="Open account menu"
              />
            }
          >
            <Avatar className="size-8">
              <AvatarFallback>{displayName.charAt(0).toUpperCase()}</AvatarFallback>
            </Avatar>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-56">
            <DropdownMenuGroup>
              <DropdownMenuLabel>
                <div className="flex flex-col">
                  <span>{displayName}</span>
                  <span className="text-xs font-normal text-muted-foreground">{user?.email}</span>
                </div>
              </DropdownMenuLabel>
            </DropdownMenuGroup>
            <DropdownMenuSeparator />
            <DropdownMenuGroup>
              <DropdownMenuItem render={<Link href="/dashboard/settings" />}>
                <UserIcon />
                Profile
              </DropdownMenuItem>
              <DropdownMenuItem render={<Link href="/dashboard/settings" />}>
                <SettingsIcon />
                Settings
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
