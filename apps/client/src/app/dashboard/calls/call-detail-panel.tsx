'use client';

import { Badge } from '@/components/ui/badge';
import {
  ChartContainer,
  ChartLegend,
  ChartLegendContent,
  ChartTooltip,
  ChartTooltipContent,
  type ChartConfig,
} from '@/components/ui/chart';
import {
  useGetCallByIdQuery,
  useGetCallCostsQuery,
  useGetCallEventsQuery,
  useGetCallTranscriptQuery,
} from '@/features/calls/callsApi';
import type { CallSession } from '@/features/calls/types';
import {
  formatDuration,
  formatMoney,
  formatStatusLabel,
  statusColors,
} from './call-utils';
import { Bar, BarChart, CartesianGrid, Pie, PieChart, XAxis, YAxis } from 'recharts';

export function CallDetailPanel({ call }: { call: CallSession }) {
  const { data: callDetails } = useGetCallByIdQuery(call.id);
  const { data: eventsData, isLoading: eventsLoading } = useGetCallEventsQuery(call.id);
  const { data: transcriptData, isLoading: transcriptLoading } = useGetCallTranscriptQuery(call.id);
  const { data: costData, isLoading: costLoading } = useGetCallCostsQuery(call.id);

  const events = eventsData?.data ?? [];
  const transcript = transcriptData?.data ?? null;
  const costs = costData?.data ?? null;
  const transcriptTurns = transcript?.fullTranscript ?? [];
  const userTurns = transcriptTurns.filter((turn) => (turn.role ?? '').toString() === 'user');
  const assistantTurns = transcriptTurns.filter((turn) => (turn.role ?? '').toString() === 'assistant');
  const firstUserTurn = userTurns[0]?.content ?? userTurns[0]?.text ?? '';
  const lastAssistantTurn =
    [...assistantTurns].reverse().find((turn) => (turn.content ?? turn.text)?.toString().trim())?.content
    ?? [...assistantTurns].reverse().find((turn) => (turn.content ?? turn.text)?.toString().trim())?.text
    ?? '';

  const roleChartData = [
    { name: 'Caller', value: userTurns.length },
    { name: 'Receptionist', value: assistantTurns.length },
  ];
  const roleChartConfig = {
    value: { label: 'Turns' },
    Caller: { label: 'Caller', color: 'hsl(var(--chart-1))' },
    Receptionist: { label: 'Receptionist', color: 'hsl(var(--chart-2))' },
  } satisfies ChartConfig;

  const eventBuckets = events.reduce((acc, event) => {
    const ts = new Date(event.timestamp).getTime();
    const start = new Date(call.startedAt).getTime();
    const minute = Math.max(0, Math.floor((ts - start) / 60000));
    const key = Number.isFinite(minute) ? minute : 0;
    acc.set(key, (acc.get(key) ?? 0) + 1);
    return acc;
  }, new Map<number, number>());
  const timelineData = Array.from(eventBuckets.entries())
    .sort((a, b) => a[0] - b[0])
    .map(([minute, count]) => ({ minute: `${minute}m`, events: count }));
  const timelineChartConfig = {
    events: { label: 'Events', color: 'hsl(var(--chart-3))' },
  } satisfies ChartConfig;

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
        {transcript?.intentDetected && (
          <div>
            <p className="text-sm font-medium">Why the call</p>
            <p className="text-sm text-muted-foreground">{transcript.intentDetected}</p>
          </div>
        )}
        {firstUserTurn ? (
          <div className="col-span-2">
            <p className="text-sm font-medium">Caller request</p>
            <p className="text-sm text-muted-foreground">{firstUserTurn}</p>
          </div>
        ) : null}
        {lastAssistantTurn ? (
          <div className="col-span-2">
            <p className="text-sm font-medium">Outcome</p>
            <p className="text-sm text-muted-foreground">{lastAssistantTurn}</p>
          </div>
        ) : null}
        {call.costEstimate && (
          <div>
            <p className="text-sm font-medium">Cost</p>
            <p className="text-sm text-muted-foreground">{formatMoney(call.costEstimate)}</p>
          </div>
        )}
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <div className="rounded-lg border p-4">
          <p className="mb-2 text-sm font-medium">Speaker balance</p>
          {roleChartData.every((entry) => entry.value === 0) ? (
            <p className="text-sm text-muted-foreground">No turns recorded.</p>
          ) : (
            <ChartContainer config={roleChartConfig} className="h-[220px] w-full">
              <PieChart>
                <ChartTooltip content={<ChartTooltipContent nameKey="name" />} />
                <Pie data={roleChartData} dataKey="value" nameKey="name" innerRadius={55} outerRadius={85} />
                <ChartLegend content={<ChartLegendContent nameKey="name" />} />
              </PieChart>
            </ChartContainer>
          )}
        </div>

        <div className="rounded-lg border p-4">
          <p className="mb-2 text-sm font-medium">Event timeline</p>
          {timelineData.length === 0 ? (
            <p className="text-sm text-muted-foreground">No events recorded.</p>
          ) : (
            <ChartContainer config={timelineChartConfig} className="h-[220px] w-full">
              <BarChart data={timelineData}>
                <CartesianGrid vertical={false} />
                <XAxis dataKey="minute" tickLine={false} axisLine={false} />
                <YAxis allowDecimals={false} width={28} />
                <ChartTooltip content={<ChartTooltipContent />} />
                <Bar dataKey="events" fill="var(--color-events)" radius={[6, 6, 0, 0]} />
              </BarChart>
            </ChartContainer>
          )}
        </div>
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
        <p className="mb-2 text-sm font-medium">Call summary</p>
        {transcriptLoading ? (
          <p className="text-sm text-muted-foreground">Loading summary…</p>
        ) : transcript ? (
          <div className="rounded-lg border p-3 text-sm space-y-1">
            {transcript?.summary ? (
              <p className="text-sm text-muted-foreground">Summary: {transcript.summary}</p>
            ) : null}
            {transcript?.intentDetected ? (
              <p className="text-sm text-muted-foreground">Intent: {transcript.intentDetected}</p>
            ) : null}
            {transcript?.sentiment ? (
              <p className="text-sm text-muted-foreground">Sentiment: {transcript.sentiment}</p>
            ) : null}
            {!transcript?.summary && !transcript?.intentDetected && !transcript?.sentiment ? (
              <p className="text-sm text-muted-foreground">No summary available.</p>
            ) : null}
          </div>
        ) : (
          <p className="text-sm text-muted-foreground">No summary available.</p>
        )}
      </div>

      <div>
        <p className="mb-2 text-sm font-medium">Call transcription</p>
        {transcriptLoading ? (
          <p className="text-sm text-muted-foreground">Loading transcription…</p>
        ) : !transcriptTurns.length ? (
          <p className="text-sm text-muted-foreground">No transcription available.</p>
        ) : (
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
