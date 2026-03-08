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
import { EmptyState } from '@/components/empty-state';
import { PhoneIcon } from 'lucide-react';

const statusColors: Record<string, string> = {
  completed: 'bg-green-500/10 text-green-600 dark:text-green-400',
  transferred: 'bg-blue-500/10 text-blue-600 dark:text-blue-400',
  ringing: 'bg-amber-500/10 text-amber-600 dark:text-amber-400',
  dropped: 'bg-red-500/10 text-red-600 dark:text-red-400',
  voicemail: 'bg-gray-500/10 text-gray-600 dark:text-gray-400',
};

type MockCallEvent = {
  id: string;
  eventType: string;
  timestamp: string;
  actor?: string;
  latencyMs?: number;
};

type MockCallSession = {
  id: string;
  callerNumber: string;
  startedAt: string;
  status: 'completed' | 'transferred' | 'ringing' | 'dropped' | 'voicemail';
  durationSeconds?: number;
  costEstimate?: string;
  aiProvider?: string;
  aiModel?: string;
};

const mockCalls: MockCallSession[] = [
  {
    id: 'call_9x1a',
    callerNumber: '(555) 210-8841',
    startedAt: '2026-03-08T08:14:00.000Z',
    status: 'completed',
    durationSeconds: 282,
    costEstimate: '0.68',
    aiProvider: 'OpenAI',
    aiModel: 'gpt-5.3-realtime',
  },
  {
    id: 'call_9w7m',
    callerNumber: '(555) 339-7710',
    startedAt: '2026-03-08T08:47:00.000Z',
    status: 'transferred',
    durationSeconds: 236,
    costEstimate: '0.57',
    aiProvider: 'OpenAI',
    aiModel: 'gpt-5.3-realtime',
  },
  {
    id: 'call_9v3q',
    callerNumber: '(555) 920-0445',
    startedAt: '2026-03-08T09:09:00.000Z',
    status: 'completed',
    durationSeconds: 194,
    costEstimate: '0.47',
    aiProvider: 'OpenAI',
    aiModel: 'gpt-5.3-realtime',
  },
  {
    id: 'call_9u8r',
    callerNumber: '(555) 117-0398',
    startedAt: '2026-03-08T10:22:00.000Z',
    status: 'voicemail',
    durationSeconds: 51,
    costEstimate: '0.11',
    aiProvider: 'OpenAI',
    aiModel: 'gpt-5.3-realtime',
  },
  {
    id: 'call_9t6d',
    callerNumber: '(555) 702-6604',
    startedAt: '2026-03-08T11:03:00.000Z',
    status: 'dropped',
    durationSeconds: 18,
    costEstimate: '0.03',
    aiProvider: 'OpenAI',
    aiModel: 'gpt-5.3-realtime',
  },
  {
    id: 'call_9s0k',
    callerNumber: '(555) 774-2008',
    startedAt: '2026-03-08T11:46:00.000Z',
    status: 'completed',
    durationSeconds: 325,
    costEstimate: '0.76',
    aiProvider: 'OpenAI',
    aiModel: 'gpt-5.3-realtime',
  },
];

const mockEventsByCallId: Record<string, MockCallEvent[]> = {
  call_9x1a: [
    { id: 'e1', eventType: 'call_started', timestamp: '2026-03-08T08:14:00.000Z', actor: 'system' },
    { id: 'e2', eventType: 'intent_detected_emergency', timestamp: '2026-03-08T08:14:12.000Z', actor: 'ai', latencyMs: 602 },
    { id: 'e3', eventType: 'appointment_slot_offered', timestamp: '2026-03-08T08:15:24.000Z', actor: 'ai', latencyMs: 584 },
    { id: 'e4', eventType: 'appointment_confirmed', timestamp: '2026-03-08T08:17:56.000Z', actor: 'ai', latencyMs: 640 },
  ],
  call_9w7m: [
    { id: 'e5', eventType: 'call_started', timestamp: '2026-03-08T08:47:00.000Z', actor: 'system' },
    { id: 'e6', eventType: 'insurance_question_detected', timestamp: '2026-03-08T08:47:30.000Z', actor: 'ai', latencyMs: 688 },
    { id: 'e7', eventType: 'transferred_to_front_desk', timestamp: '2026-03-08T08:50:22.000Z', actor: 'ai', latencyMs: 701 },
  ],
  call_9v3q: [
    { id: 'e8', eventType: 'call_started', timestamp: '2026-03-08T09:09:00.000Z', actor: 'system' },
    { id: 'e9', eventType: 'new_patient_intake', timestamp: '2026-03-08T09:09:45.000Z', actor: 'ai', latencyMs: 611 },
    { id: 'e10', eventType: 'consultation_booked', timestamp: '2026-03-08T09:11:54.000Z', actor: 'ai', latencyMs: 632 },
  ],
  call_9u8r: [
    { id: 'e11', eventType: 'voicemail_left', timestamp: '2026-03-08T10:22:51.000Z', actor: 'caller' },
  ],
  call_9t6d: [
    { id: 'e12', eventType: 'call_dropped', timestamp: '2026-03-08T11:03:18.000Z', actor: 'system' },
  ],
  call_9s0k: [
    { id: 'e13', eventType: 'call_started', timestamp: '2026-03-08T11:46:00.000Z', actor: 'system' },
    { id: 'e14', eventType: 'reschedule_request', timestamp: '2026-03-08T11:46:33.000Z', actor: 'ai', latencyMs: 606 },
    { id: 'e15', eventType: 'calendar_updated', timestamp: '2026-03-08T11:50:42.000Z', actor: 'ai', latencyMs: 619 },
  ],
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
  const calls = mockCalls;

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
            Mock operational feed for AI receptionist call handling
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
                <SelectItem value="transferred">Transferred</SelectItem>
                <SelectItem value="ringing">Ringing</SelectItem>
                <SelectItem value="dropped">Dropped</SelectItem>
                <SelectItem value="voicemail">Voicemail</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </CardHeader>
        <CardContent>
          {filteredCalls.length === 0 ? (
            <EmptyState
              icon={PhoneIcon}
              title="No calls found"
              description="Try adjusting filters or search terms"
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

function CallDetailPanel({ call }: { call: MockCallSession }) {
  const events = mockEventsByCallId[call.id] ?? [];

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
        {events.length === 0 ? (
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
