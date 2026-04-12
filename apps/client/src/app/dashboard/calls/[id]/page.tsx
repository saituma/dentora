'use client';

import Link from 'next/link';
import { useParams } from 'next/navigation';
import { Card, CardContent } from '@/components/ui/card';
import { useGetCallByIdQuery } from '@/features/calls/callsApi';
import { CallDetailPanel } from '../call-detail-panel';
import { formatDate } from '../call-utils';

export default function CallDetailPage() {
  const params = useParams<{ id: string }>();
  const callId = params?.id;

  const { data: call, isLoading } = useGetCallByIdQuery(callId ?? '', {
    skip: !callId,
  });

  if (!callId) {
    return (
      <div className="flex flex-col gap-4">
        <p className="text-sm text-muted-foreground">Call not found.</p>
        <Link href="/dashboard/calls" className="text-sm text-muted-foreground hover:text-foreground">
          Back to call history
        </Link>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-2">
        <Link href="/dashboard/calls" className="text-sm text-muted-foreground hover:text-foreground">
          Back to call history
        </Link>
        <div>
          <h2 className="text-lg font-semibold">Call details</h2>
          <p className="text-sm text-muted-foreground">
            {isLoading ? 'Loading call…' : `${call?.callerNumber ?? 'Unknown'} · ${call ? formatDate(call.startedAt) : ''}`}
          </p>
        </div>
      </div>

      <Card>
        <CardContent>
          {isLoading ? (
            <p className="text-sm text-muted-foreground">Loading call details…</p>
          ) : call ? (
            <CallDetailPanel call={call} />
          ) : (
            <p className="text-sm text-muted-foreground">Call not found.</p>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
