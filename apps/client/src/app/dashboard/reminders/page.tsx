'use client';

import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader } from '@/components/ui/card';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { useGetRemindersQuery } from '@/features/reminders/remindersApi';

const statusColors: Record<string, string> = {
  sent: 'bg-green-500/10 text-green-600 dark:text-green-400',
  pending: 'bg-amber-500/10 text-amber-600 dark:text-amber-400',
  skipped: 'bg-muted text-muted-foreground',
  cancelled: 'bg-muted text-muted-foreground',
  failed: 'bg-red-500/10 text-red-600 dark:text-red-400',
};

function formatDateTime(value: string | null) {
  if (!value) return '—';
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? '—' : date.toLocaleString('en-GB');
}

function formatChannel(channel: string) {
  return channel === 'whatsapp' ? 'WhatsApp' : 'SMS';
}

export default function RemindersPage() {
  const { data, isLoading } = useGetRemindersQuery({ limit: 100 });
  const reminders = data?.data ?? [];

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h2 className="text-lg font-semibold">Appointment reminders</h2>
        <p className="text-sm text-muted-foreground">
          SMS and WhatsApp reminders scheduled for upcoming appointments. Read-only.
        </p>
      </div>

      <Card>
        <CardHeader />
        <CardContent>
          {isLoading ? (
            <p className="text-sm text-muted-foreground">Loading reminders…</p>
          ) : reminders.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              No reminders yet. Reminders are scheduled automatically when an appointment is booked
              and the patient has consented.
            </p>
          ) : (
            <div className="rounded-md border">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Patient</TableHead>
                    <TableHead>Channel</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Scheduled</TableHead>
                    <TableHead>Sent</TableHead>
                    <TableHead>Note</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {reminders.map((reminder) => (
                    <TableRow key={reminder.id}>
                      <TableCell className="font-medium">{reminder.patientName}</TableCell>
                      <TableCell>{formatChannel(reminder.channel)}</TableCell>
                      <TableCell>
                        <Badge variant="secondary" className={statusColors[reminder.status] ?? ''}>
                          {reminder.status}
                        </Badge>
                      </TableCell>
                      <TableCell>{formatDateTime(reminder.scheduledAt)}</TableCell>
                      <TableCell>{formatDateTime(reminder.sentAt)}</TableCell>
                      <TableCell className="text-muted-foreground">
                        {reminder.failureReason ?? '—'}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
