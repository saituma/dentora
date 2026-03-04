'use client';

import { useState, useMemo } from 'react';
import {
  Card,
  CardContent,
  CardHeader,
} from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from '@/components/ui/sheet';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { EmptyState } from '@/components/empty-state';
import { PhoneIcon, Loader2Icon } from 'lucide-react';
import { useGetCallsQuery, useGetCallEventsQuery } from '@/features/calls/callsApi';
import type { CallSession } from '@/features/calls/types';

const statusColors: Record<string, string> = {
  completed: 'bg-green-500/10 text-green-600 dark:text-green-400',
  'in-progress': 'bg-blue-500/10 text-blue-600 dark:text-blue-400',
  ringing: 'bg-amber-500/10 text-amber-600 dark:text-amber-400',
  failed: 'bg-red-500/10 text-red-600 dark:text-red-400',
  voicemail: 'bg-gray-500/10 text-gray-600 dark:text-gray-400',
};

function formatDuration(seconds?: number) {
  if (!seconds) return '—';
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return `${m}m ${s}s`;
}

function formatDate(iso: string) {
  return new Date(iso).toLocaleString('en-US', {
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  });
}

export default function CallsPage() {
  const [selectedCallId, setSelectedCallId] = useState<string | null>(null);
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [search, setSearch] = useState('');

  const { data: callsData, isLoading } = useGetCallsQuery({ limit: 100 });
  const calls = callsData?.data ?? [];

  const filteredCalls = useMemo(() => {
    return calls.filter((call) => {
      const matchStatus = statusFilter === 'all' || call.status === statusFilter;
      const matchSearch =
        !search || call.callerNumber.toLowerCase().includes(search.toLowerCase());
      return matchStatus && matchSearch;
    });
  }, [calls, statusFilter, search]);

  const selectedCall = calls.find((c) => c.id === selectedCallId) ?? null;

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h2 className="text-lg font-semibold">Call history</h2>
          <p className="text-sm text-muted-foreground">
            View call sessions and events
          </p>
        </div>
      </div>

      <Card>
        <CardHeader>
          <div className="flex flex-col gap-4 sm:flex-row sm:items-center">
            <Input
              placeholder="Search by caller number..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="max-w-xs"
            />
            <Select
              value={statusFilter}
              onValueChange={(value) => setStatusFilter(value ?? 'all')}
            >
              <SelectTrigger className="w-[180px]">
                <SelectValue placeholder="Status" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All statuses</SelectItem>
                <SelectItem value="completed">Completed</SelectItem>
                <SelectItem value="in-progress">In Progress</SelectItem>
                <SelectItem value="ringing">Ringing</SelectItem>
                <SelectItem value="failed">Failed</SelectItem>
                <SelectItem value="voicemail">Voicemail</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="space-y-3">
              {Array.from({ length: 5 }).map((_, i) => (
                <Skeleton key={i} className="h-12 w-full" />
              ))}
            </div>
          ) : filteredCalls.length === 0 ? (
            <EmptyState
              icon={PhoneIcon}
              title="No calls yet"
              description="Calls answered by your AI receptionist will appear here"
            />
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Date</TableHead>
                  <TableHead>Caller</TableHead>
                  <TableHead>Duration</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Cost</TableHead>
                  <TableHead></TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredCalls.map((call) => (
                  <TableRow key={call.id}>
                    <TableCell className="text-muted-foreground">
                      {formatDate(call.startedAt)}
                    </TableCell>
                    <TableCell>{call.callerNumber}</TableCell>
                    <TableCell>{formatDuration(call.durationSeconds)}</TableCell>
                    <TableCell>
                      <Badge
                        variant="secondary"
                        className={statusColors[call.status] ?? ''}
                      >
                        {call.status}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-muted-foreground">
                      {call.costEstimate ? `$${call.costEstimate}` : '—'}
                    </TableCell>
                    <TableCell>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => setSelectedCallId(call.id)}
                      >
                        View
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      <Sheet
        open={!!selectedCall}
        onOpenChange={(open) => !open && setSelectedCallId(null)}
      >
        <SheetContent className="sm:max-w-lg">
          <SheetHeader>
            <SheetTitle>Call details</SheetTitle>
            <SheetDescription>
              {selectedCall?.callerNumber} · {selectedCall ? formatDate(selectedCall.startedAt) : ''}
            </SheetDescription>
          </SheetHeader>
          {selectedCall && <CallDetailPanel call={selectedCall} />}
        </SheetContent>
      </Sheet>
    </div>
  );
}

function CallDetailPanel({ call }: { call: CallSession }) {
  const { data: eventsData, isLoading } = useGetCallEventsQuery(call.id);
  const events = eventsData?.data ?? [];

  return (
    <div className="mt-6 space-y-6">
      <div className="grid grid-cols-2 gap-4">
        <div>
          <p className="text-sm font-medium">Status</p>
          <Badge variant="secondary" className={statusColors[call.status] ?? ''}>
            {call.status}
          </Badge>
        </div>
        <div>
          <p className="text-sm font-medium">Duration</p>
          <p className="text-sm text-muted-foreground">{formatDuration(call.durationSeconds)}</p>
        </div>
        {call.aiProvider && (
          <div>
            <p className="text-sm font-medium">AI Provider</p>
            <p className="text-sm text-muted-foreground">{call.aiProvider} / {call.aiModel}</p>
          </div>
        )}
        {call.costEstimate && (
          <div>
            <p className="text-sm font-medium">Cost</p>
            <p className="text-sm text-muted-foreground">${call.costEstimate}</p>
          </div>
        )}
      </div>

      <div>
        <p className="mb-2 text-sm font-medium">Events</p>
        {isLoading ? (
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <Loader2Icon className="size-4 animate-spin" /> Loading events...
          </div>
        ) : events.length === 0 ? (
          <p className="text-sm text-muted-foreground">No events recorded</p>
        ) : (
          <div className="space-y-2 max-h-[400px] overflow-y-auto">
            {events.map((event) => (
              <div key={event.id} className="rounded-lg border p-3 text-sm">
                <div className="flex items-center justify-between">
                  <Badge variant="outline">{event.eventType}</Badge>
                  <span className="text-xs text-muted-foreground">
                    {new Date(event.timestamp).toLocaleTimeString()}
                  </span>
                </div>
                {event.actor && (
                  <p className="mt-1 text-xs text-muted-foreground">Actor: {event.actor}</p>
                )}
                {event.latencyMs != null && (
                  <p className="text-xs text-muted-foreground">Latency: {event.latencyMs}ms</p>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
