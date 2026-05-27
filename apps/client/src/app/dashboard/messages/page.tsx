'use client';

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { MessageSquare, Zap, Inbox } from 'lucide-react';
import { PageHeader } from '@/components/page-header';

export default function MessagesPage() {
  return (
    <div className="flex flex-col gap-6">
      <PageHeader title="Messages" subtitle="SMS confirmations sent to patients." />

      <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
        <Card>
          <CardHeader className="flex flex-row items-center gap-3 space-y-0 pb-2">
            <MessageSquare className="h-5 w-5 text-muted-foreground" />
            <CardTitle className="text-base">SMS Confirmation Logs</CardTitle>
          </CardHeader>
          <CardContent>
            <CardDescription>
              Appointment confirmation texts sent to patients will appear here once the feature is
              live.
            </CardDescription>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center gap-3 space-y-0 pb-2">
            <Zap className="h-5 w-5 text-muted-foreground" />
            <CardTitle className="text-base">How it works</CardTitle>
          </CardHeader>
          <CardContent>
            <CardDescription>
              When the AI books an appointment, it automatically sends an SMS confirmation to the
              patient&apos;s number. Message history will be available here.
            </CardDescription>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardContent className="flex flex-col items-center gap-4 py-16 text-center">
          <Inbox className="h-12 w-12 text-muted-foreground/50" />
          <div className="space-y-1">
            <p className="font-medium text-muted-foreground">No messages yet</p>
            <p className="text-sm text-muted-foreground">
              SMS confirmations will appear here once your AI receptionist starts booking
              appointments.
            </p>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
