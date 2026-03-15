'use client';

import { useMemo, useState } from 'react';
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
import {
  useGetCallsQuery,
  useGetCallByIdQuery,
  useGetCallEventsQuery,
  useGetCallTranscriptQuery,
  useGetCallCostsQuery,
} from '@/features/calls/callsApi';
import type { CallSession } from '@/features/calls/types';

const statusColors: Record<string, string> = {
  completed: 'bg-green-500/10 text-green-600 dark:text-green-400',
  escalated: 'bg-blue-500/10 text-blue-600 dark:text-blue-400',
  started: 'bg-amber-500/10 text-amber-600 dark:text-amber-400',
  in_progress: 'bg-amber-500/10 text-amber-600 dark:text-amber-400',
  failed: 'bg-red-500/10 text-red-600 dark:text-red-400',
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

function formatMoney(value?: string | number | null) {
  if (value == null) return '—';
  const numberValue = typeof value === 'string' ? Number.parseFloat(value) : value;
  if (!Number.isFinite(numberValue)) return '—';
  return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(numberValue);
}

function formatStatusLabel(status?: string | null) {
  if (!status) return 'Unknown';
  return status.replace(/_/g, ' ');
}

export default function CallsPage() {
  const [selectedCallId, setSelectedCallId] = useState<string | null>(null);
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [search, setSearch] = useState('');
  const { data: callsData, isLoading: callsLoading } = useGetCallsQuery({ limit: 50 });
  const calls = callsData?.data ?? [];

  const filteredCalls = useMemo(() => {
    return calls.filter((call) => {
      const matchStatus = statusFilter === 'all' || call.status === statusFilter;
      const matchSearch =
        !search || (call.callerNumber ?? '').toLowerCase().includes(search.toLowerCase());
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
            Real-time view of your AI receptionist call activity
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
                <SelectItem value="started">Started</SelectItem>
                <SelectItem value="in_progress">In progress</SelectItem>
                <SelectItem value="completed">Completed</SelectItem>
                <SelectItem value="escalated">Escalated</SelectItem>
                <SelectItem value="failed">Failed</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </CardHeader>
        <CardContent>
          {callsLoading ? (
            <div className="text-sm text-muted-foreground">Loading calls…</div>
          ) : filteredCalls.length === 0 ? (
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
                    <TableCell>{call.callerNumber ?? 'Unknown'}</TableCell>
                    <TableCell>{formatDuration(call.durationSeconds)}</TableCell>
                    <TableCell>
                      <Badge
                        variant="secondary"
                        className={statusColors[call.status] ?? ''}
                      >
                        {formatStatusLabel(call.status)}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-muted-foreground">
                      {formatMoney(call.costEstimate)}
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
              {(selectedCall?.callerNumber ?? 'Unknown')} · {selectedCall ? formatDate(selectedCall.startedAt) : ''}
          </SheetDescription>
          </SheetHeader>
          {selectedCall && <CallDetailPanel call={selectedCall} />}
        </SheetContent>
      </Sheet>
    </div>
  );
}

function CallDetailPanel({ call }: { call: CallSession }) {
  const { data: callDetails } = useGetCallByIdQuery(call.id);
  const { data: eventsData, isLoading: eventsLoading } = useGetCallEventsQuery(call.id);
  const { data: transcriptData, isLoading: transcriptLoading } = useGetCallTranscriptQuery(call.id);
  const { data: costData, isLoading: costLoading } = useGetCallCostsQuery(call.id);

  const events = eventsData?.data ?? [];
  const transcript = transcriptData?.data ?? null;
  const costs = costData?.data ?? null;
  const derivedTurns = events
    .filter((event) => event.eventType === 'conversation.turn')
    .flatMap((event) => {
      const payload = (event.payload ?? {}) as Record<string, unknown>;
      const userText = typeof payload.userText === 'string' ? payload.userText : '';
      const aiText = typeof payload.aiText === 'string' ? payload.aiText : '';
      const turns = [];
      if (userText) {
        turns.push({
          role: 'user',
          content: userText,
          timestamp: event.timestamp,
        });
      }
      if (aiText) {
        turns.push({
          role: 'assistant',
          content: aiText,
          timestamp: event.timestamp,
        });
      }
      return turns;
    });
  const transcriptTurns =
    transcript?.fullTranscript?.length ? transcript.fullTranscript : derivedTurns;

  return (
    <div className="mt-6 space-y-6">
      <div className="grid grid-cols-2 gap-4">
        <div>
          <p className="text-sm font-medium">Status</p>
          <Badge variant="secondary" className={statusColors[call.status] ?? ''}>
            {formatStatusLabel(call.status)}
          </Badge>
        </div>
        <div>
          <p className="text-sm font-medium">Duration</p>
          <p className="text-sm text-muted-foreground">{formatDuration(call.durationSeconds)}</p>
        </div>
        {callDetails?.aiProvider && (
          <div>
            <p className="text-sm font-medium">AI Provider</p>
            <p className="text-sm text-muted-foreground">{callDetails.aiProvider} / {callDetails.aiModel}</p>
          </div>
        )}
        {callDetails?.twilioCallSid && (
          <div>
            <p className="text-sm font-medium">Twilio SID</p>
            <p className="text-sm text-muted-foreground">{callDetails.twilioCallSid}</p>
          </div>
        )}
        {callDetails?.endReason && (
          <div>
            <p className="text-sm font-medium">End reason</p>
            <p className="text-sm text-muted-foreground">{callDetails.endReason}</p>
          </div>
        )}
        {callDetails?.intentSummary && (
          <div>
            <p className="text-sm font-medium">Intent summary</p>
            <p className="text-sm text-muted-foreground">{callDetails.intentSummary}</p>
          </div>
        )}
        {call.costEstimate && (
          <div>
            <p className="text-sm font-medium">Cost</p>
            <p className="text-sm text-muted-foreground">{formatMoney(call.costEstimate)}</p>
          </div>
        )}
      </div>

      <div>
        <p className="mb-2 text-sm font-medium">Events</p>
        {eventsLoading ? (
          <p className="text-sm text-muted-foreground">Loading events…</p>
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
                {event.eventType === 'conversation.turn' ? (
                  <div className="mt-2 space-y-1 text-xs text-muted-foreground">
                    {typeof event.payload?.userText === 'string' && event.payload.userText ? (
                      <p>
                        <span className="font-medium text-foreground">User:</span> {event.payload.userText}
                      </p>
                    ) : null}
                    {typeof event.payload?.aiText === 'string' && event.payload.aiText ? (
                      <p>
                        <span className="font-medium text-foreground">AI:</span> {event.payload.aiText}
                      </p>
                    ) : null}
                    {!event.payload?.userText && !event.payload?.aiText ? (
                      <p>No conversation text recorded for this turn.</p>
                    ) : null}
                  </div>
                ) : null}
              </div>
            ))}
          </div>
        )}
      </div>

      <div>
        <p className="mb-2 text-sm font-medium">Transcript</p>
        {transcriptLoading ? (
          <p className="text-sm text-muted-foreground">Loading transcript…</p>
        ) : !transcriptTurns.length ? (
          <p className="text-sm text-muted-foreground">No transcript available.</p>
        ) : (
          <div className="space-y-3">
            {(transcript.summary || transcript.intentDetected || transcript.sentiment) && (
              <div className="rounded-lg border p-3 text-sm space-y-1">
                {transcript.summary && (
                  <p className="text-sm text-muted-foreground">Summary: {transcript.summary}</p>
                )}
                {transcript.intentDetected && (
                  <p className="text-sm text-muted-foreground">Intent: {transcript.intentDetected}</p>
                )}
                {transcript.sentiment && (
                  <p className="text-sm text-muted-foreground">Sentiment: {transcript.sentiment}</p>
                )}
              </div>
            )}
            {transcriptTurns.length ? (
              <div className="space-y-2 max-h-[360px] overflow-y-auto">
                {transcriptTurns.map((turn, index) => (
                  <div key={`${turn.timestamp ?? 't'}-${index}`} className="rounded-lg border p-3 text-sm">
                    <div className="flex items-center justify-between">
                      <Badge variant="outline">{turn.role ?? 'unknown'}</Badge>
                      {turn.timestamp ? (
                        <span className="text-xs text-muted-foreground">
                          {new Date(turn.timestamp).toLocaleTimeString()}
                        </span>
                      ) : null}
                    </div>
                    <p className="mt-2 text-sm text-muted-foreground">
                      {turn.content ?? turn.text ?? ''}
                    </p>
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-sm text-muted-foreground">Transcript is empty.</p>
            )}
          </div>
        )}
      </div>

      <div>
        <p className="mb-2 text-sm font-medium">Cost breakdown</p>
        {costLoading ? (
          <p className="text-sm text-muted-foreground">Loading costs…</p>
        ) : !costs ? (
          <p className="text-sm text-muted-foreground">No cost data recorded.</p>
        ) : (
          <div className="space-y-2">
            <div className="rounded-lg border p-3 text-sm flex items-center justify-between">
              <span className="text-muted-foreground">Total</span>
              <span className="font-medium">{formatMoney(costs.totalCost)}</span>
            </div>
            {costs.lineItems.length > 0 ? (
              <div className="space-y-2 max-h-[260px] overflow-y-auto">
                {costs.lineItems.map((item) => (
                  <div key={item.id} className="rounded-lg border p-3 text-sm">
                    <div className="flex items-center justify-between">
                      <Badge variant="outline">{item.service}</Badge>
                      <span className="text-xs text-muted-foreground">{formatMoney(item.totalCost)}</span>
                    </div>
                    <p className="mt-1 text-xs text-muted-foreground">
                      {item.provider} · {item.units} units @ {formatMoney(item.unitCost)}
                    </p>
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-sm text-muted-foreground">No line items recorded.</p>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
