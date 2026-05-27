'use client';

import { useState, useMemo } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { PhoneMissed, CheckCircle2 } from 'lucide-react';
import { toast } from 'sonner';
import { PageHeader } from '@/components/page-header';
import { useGetCallsQuery } from '@/features/calls/callsApi';
import type { CallSession } from '@/features/calls/types';

function isMissedCall(call: CallSession): boolean {
  if (call.status === 'failed') return true;
  const endReason = call.endReason ?? '';
  // caller hung up mid-conversation (short = no time to complete)
  if (endReason === 'caller_hangup' && (call.durationSeconds ?? 0) < 120) return true;
  return false;
}

function formatDuration(seconds?: number): string {
  if (seconds == null) return '—';
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return m > 0 ? `${m}m ${s}s` : `${s}s`;
}

function formatDateTime(iso: string): string {
  return new Date(iso).toLocaleString('en-GB', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

export default function MissedCallsPage() {
  const { data, isLoading } = useGetCallsQuery({ limit: 100 });
  const [resolvedIds, setResolvedIds] = useState<Set<string>>(new Set());

  const missedCalls = useMemo(() => {
    const calls = data?.data ?? [];
    return calls.filter((c) => isMissedCall(c));
  }, [data]);

  const visibleCalls = missedCalls.filter((c) => !resolvedIds.has(c.id));

  function handleResolve(call: CallSession) {
    setResolvedIds((prev) => new Set([...prev, call.id]));
    toast.success('Call marked as resolved', {
      description: `Caller ${call.callerNumber} removed from the list.`,
    });
  }

  const count = visibleCalls.length;

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title="Missed Calls"
        subtitle={
          isLoading
            ? 'Loading calls…'
            : count === 0
              ? 'No calls need follow-up right now.'
              : `${count} call${count === 1 ? '' : 's'} that may need a follow-up from your team.`
        }
        actions={!isLoading && count > 0 ? <Badge variant="destructive">{count}</Badge> : undefined}
      />

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <PhoneMissed className="h-4 w-4 text-destructive" />
            Calls needing follow-up
          </CardTitle>
          <CardDescription>
            Callers who hung up within 2 minutes, or calls that failed. These may need a callback.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="space-y-3">
              {Array.from({ length: 5 }).map((_, i) => (
                <Skeleton key={i} className="h-12 w-full" />
              ))}
            </div>
          ) : visibleCalls.length === 0 ? (
            <div className="flex flex-col items-center gap-3 py-10 text-center">
              <CheckCircle2 className="h-10 w-10 text-emerald-500" />
              <p className="text-sm text-muted-foreground">No calls need follow-up right now.</p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b text-left text-muted-foreground">
                    <th className="pb-2 pr-4 font-medium">Caller</th>
                    <th className="pb-2 pr-4 font-medium">Date / Time</th>
                    <th className="pb-2 pr-4 font-medium">Duration</th>
                    <th className="pb-2 pr-4 font-medium">Summary</th>
                    <th className="pb-2 font-medium">Action</th>
                  </tr>
                </thead>
                <tbody>
                  {visibleCalls.map((call) => (
                    <tr key={call.id} className="border-b last:border-0">
                      <td className="py-3 pr-4 font-mono text-xs">{call.callerNumber}</td>
                      <td className="py-3 pr-4 whitespace-nowrap">
                        {formatDateTime(call.startedAt)}
                      </td>
                      <td className="py-3 pr-4 tabular-nums">
                        {formatDuration(call.durationSeconds)}
                      </td>
                      <td className="py-3 pr-4 max-w-xs truncate text-muted-foreground">
                        {call.intentSummary ?? '—'}
                      </td>
                      <td className="py-3">
                        <Button size="sm" variant="outline" onClick={() => handleResolve(call)}>
                          Mark resolved
                        </Button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
