import Link from 'next/link';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Separator } from '@/components/ui/separator';
import {
  WifiIcon,
  ShieldCheckIcon,
  ZapIcon,
  UsersIcon,
  TrendingUpIcon,
  ClockIcon,
  PhoneIcon,
} from 'lucide-react';
import { cn } from '@/lib/utils';

interface IntegrationStatus {
  name: string;
  type: string;
  status: string;
  healthStatus?: string | null;
  lastSyncAt?: string | Date | null;
}

interface ActiveNumber {
  phoneNumber: string;
}

interface Props {
  activeNumber: ActiveNumber | undefined;
  integrationStatuses: IntegrationStatus[];
}

export function DashboardSystemRow({ activeNumber, integrationStatuses }: Props) {
  return (
    <div className="grid gap-6 lg:grid-cols-2">
      {/* Integration Health */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <WifiIcon className="size-4 text-primary" />
            Integrations
          </CardTitle>
          <CardDescription>Connected services</CardDescription>
        </CardHeader>
        <CardContent>
          {integrationStatuses.length === 0 && !activeNumber ? (
            <div className="flex flex-col items-center gap-3 py-6 text-center">
              <WifiIcon className="size-8 text-muted-foreground/50" />
              <div>
                <p className="text-sm font-medium">No integrations</p>
                <p className="text-xs text-muted-foreground">Connect your tools to get started</p>
              </div>
              <Button variant="outline" size="sm" render={<Link href="/dashboard/integrations" />}>
                Set up
              </Button>
            </div>
          ) : (
            <div className="space-y-3">
              {activeNumber && (
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2.5">
                    <div className="size-2 rounded-full bg-success" />
                    <div>
                      <p className="text-sm font-medium">{activeNumber.phoneNumber}</p>
                      <p className="text-xs text-muted-foreground">AI receptionist number</p>
                    </div>
                  </div>
                  <PhoneIcon className="size-3.5 text-muted-foreground" />
                </div>
              )}
              {integrationStatuses.map((int, i) => (
                <div key={i} className="flex items-center justify-between">
                  <div className="flex items-center gap-2.5">
                    <div
                      className={cn(
                        'size-2 rounded-full',
                        int.status === 'active'
                          ? 'bg-success'
                          : int.status === 'error'
                            ? 'bg-destructive'
                            : 'bg-muted-foreground',
                      )}
                    />
                    <div>
                      <p className="text-sm font-medium">{int.name}</p>
                      <p className="text-xs capitalize text-muted-foreground">{int.type}</p>
                    </div>
                  </div>
                  {int.lastSyncAt && (
                    <span className="text-xs text-muted-foreground">
                      {new Date(int.lastSyncAt).toLocaleString('en-US', {
                        month: 'short',
                        day: 'numeric',
                        hour: 'numeric',
                        minute: '2-digit',
                      })}
                    </span>
                  )}
                </div>
              ))}
              <Separator />
              <Button
                variant="ghost"
                className="w-full"
                size="sm"
                render={<Link href="/dashboard/integrations" />}
              >
                Manage integrations
              </Button>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Quick Actions */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <ShieldCheckIcon className="size-4 text-primary" />
            Quick actions
          </CardTitle>
          <CardDescription>Common tasks</CardDescription>
        </CardHeader>
        <CardContent className="space-y-2">
          <Button
            variant="outline"
            className="w-full justify-start gap-2"
            size="sm"
            render={<Link href="/dashboard/ai-receptionist" />}
          >
            <ZapIcon className="size-3.5" /> Configure AI receptionist
          </Button>
          <Button
            variant="outline"
            className="w-full justify-start gap-2"
            size="sm"
            render={<Link href="/dashboard/patients" />}
          >
            <UsersIcon className="size-3.5" /> View patients
          </Button>
          <Button
            variant="outline"
            className="w-full justify-start gap-2"
            size="sm"
            render={<Link href="/dashboard/analytics" />}
          >
            <TrendingUpIcon className="size-3.5" /> View analytics
          </Button>
          <Button
            variant="outline"
            className="w-full justify-start gap-2"
            size="sm"
            render={<Link href="/dashboard/settings" />}
          >
            <ClockIcon className="size-3.5" /> Clinic settings
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}
