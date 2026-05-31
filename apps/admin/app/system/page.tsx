"use client";

import type { ColumnDef } from "@tanstack/react-table";
import { Activity, BellOff, BellRing, RefreshCw } from "lucide-react";
import { toast } from "sonner";
import { ConfirmAction } from "@/components/confirm-action";
import { DashboardShell } from "@/components/dashboard-shell";
import { DataTable } from "@/components/data-table";
import { StatusBadge } from "@/components/status-badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  type CircuitBreakerState,
  type ProviderPerformance,
  type QueueDepth,
  useCleanQueueMutation,
  useGetAlertsMuteQuery,
  useGetOpsBreakersQuery,
  useGetOpsProvidersQuery,
  useGetOpsQueuesQuery,
  useMuteAlertsMutation,
  useResetBreakerMutation,
  useRetryQueueMutation,
} from "@/features/admin/adminApi";
import { cn } from "@/lib/utils";

const POLL = 15_000;

// Map a breaker state to a StatusBadge variant key (color).
const breakerVariant: Record<CircuitBreakerState, string> = {
  closed: "healthy",
  "half-open": "started",
  open: "down",
};

function BreakersTab() {
  const { data, isLoading, refetch, isFetching } = useGetOpsBreakersQuery(
    undefined,
    { pollingInterval: POLL },
  );
  const [resetBreaker] = useResetBreakerMutation();
  const entries = Object.entries(data?.breakers ?? {});

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <p className="text-sm text-muted-foreground">
          Cross-dyno circuit-breaker states. Open = provider calls are being
          short-circuited.
        </p>
        <Button
          size="sm"
          variant="ghost"
          className="h-7 px-2 text-xs"
          onClick={() => refetch()}
        >
          <RefreshCw className={cn("size-3.5", isFetching && "animate-spin")} />
        </Button>
      </div>
      {isLoading ? (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {Array.from({ length: 6 }).map((_, i) => (
            <Skeleton key={i} className="h-24 w-full" />
          ))}
        </div>
      ) : entries.length === 0 ? (
        <Card>
          <CardContent className="py-12 text-center text-sm text-muted-foreground">
            No breakers registered yet.
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {entries.map(([name, b]) => (
            <Card key={name} className="card-interactive">
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium truncate">
                  {name}
                </CardTitle>
                <StatusBadge value={breakerVariant[b.state]} label={b.state} />
              </CardHeader>
              <CardContent>
                <div className="flex items-baseline justify-between">
                  <span className="text-xs text-muted-foreground">
                    Failures
                  </span>
                  <span
                    className={cn(
                      "text-2xl font-bold tabular-nums",
                      b.failures > 0 && "text-rose-500",
                    )}
                  >
                    {b.failures}
                  </span>
                </div>
                {b.dyno && (
                  <p className="mt-1 text-[10px] text-muted-foreground font-mono">
                    {b.dyno}
                  </p>
                )}
                <ConfirmAction
                  trigger={
                    <Button
                      variant="outline"
                      size="sm"
                      className="mt-3 h-7 w-full text-xs"
                    >
                      Reset breaker
                    </Button>
                  }
                  title={`Reset "${name}"?`}
                  description="Forces the breaker back to closed across the fleet. Calls will resume immediately — only do this if you believe the provider has recovered."
                  confirmLabel="Reset"
                  successMessage="Breaker reset"
                  onConfirm={async () => {
                    await resetBreaker(name).unwrap();
                  }}
                />
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}

const queueColumns: ColumnDef<QueueDepth>[] = [
  {
    accessorKey: "name",
    header: "Queue",
    cell: ({ row }) => (
      <span className="font-mono text-xs font-medium">{row.original.name}</span>
    ),
  },
  {
    accessorKey: "waiting",
    header: "Waiting",
    cell: ({ row }) => (
      <span
        className={cn(
          "tabular-nums",
          row.original.waiting > 50 && "text-amber-500 font-semibold",
        )}
      >
        {row.original.waiting}
      </span>
    ),
    size: 90,
  },
  {
    accessorKey: "active",
    header: "Active",
    cell: ({ row }) => (
      <span className="tabular-nums">{row.original.active}</span>
    ),
    size: 80,
  },
  {
    accessorKey: "failed",
    header: "Failed",
    cell: ({ row }) => (
      <span
        className={cn(
          "tabular-nums",
          row.original.failed > 0 && "text-rose-500 font-semibold",
        )}
      >
        {row.original.failed}
      </span>
    ),
    size: 80,
  },
  {
    accessorKey: "delayed",
    header: "Delayed",
    cell: ({ row }) => (
      <span className="tabular-nums">{row.original.delayed}</span>
    ),
    size: 90,
  },
  {
    accessorKey: "available",
    header: "State",
    cell: ({ row }) =>
      row.original.available ? (
        <StatusBadge value="healthy" label="online" />
      ) : (
        <StatusBadge value="down" label="unavailable" />
      ),
    size: 110,
  },
  {
    id: "actions",
    enableHiding: false,
    size: 160,
    cell: ({ row }) => <QueueActions queue={row.original} />,
  },
];

function QueueActions({ queue }: { queue: QueueDepth }) {
  const [retry] = useRetryQueueMutation();
  const [clean] = useCleanQueueMutation();
  return (
    <div className="flex gap-1.5">
      <ConfirmAction
        trigger={
          <Button
            variant="outline"
            size="sm"
            className="h-7 px-2 text-xs"
            disabled={queue.failed === 0}
          >
            Retry
          </Button>
        }
        title={`Retry failed jobs in "${queue.name}"?`}
        description={`Re-enqueues up to 100 failed jobs. They will run again — make sure the underlying cause is fixed, since retrying can repeat side effects.`}
        confirmLabel="Retry failed"
        successMessage="Failed jobs re-enqueued"
        onConfirm={async () => {
          await retry({ name: queue.name }).unwrap();
        }}
      />
      <ConfirmAction
        trigger={
          <Button
            variant="ghost"
            size="sm"
            className="h-7 px-2 text-xs text-rose-500"
            disabled={queue.failed === 0}
          >
            Clean
          </Button>
        }
        title={`Clear failed jobs in "${queue.name}"?`}
        description="Permanently removes failed jobs from this queue. They cannot be retried afterwards."
        confirmLabel="Clear failed"
        destructive
        successMessage="Failed jobs cleared"
        onConfirm={async () => {
          await clean({ name: queue.name, status: "failed" }).unwrap();
        }}
      />
    </div>
  );
}

function QueuesTab() {
  const { data, isLoading, isFetching } = useGetOpsQueuesQuery(undefined, {
    pollingInterval: POLL,
  });
  return (
    <div className="space-y-4">
      <p className="text-sm text-muted-foreground">
        BullMQ queue depths. The <code className="font-mono">dead-letter</code>{" "}
        queue holds jobs that exhausted all retries.
      </p>
      <Card>
        <CardContent className="p-0 pb-2">
          <DataTable
            columns={queueColumns}
            data={data?.queues ?? []}
            isLoading={isLoading || isFetching}
            emptyMessage="No queues reporting."
          />
        </CardContent>
      </Card>
    </div>
  );
}

const providerColumns: ColumnDef<ProviderPerformance>[] = [
  {
    accessorKey: "provider",
    header: "Provider",
    cell: ({ row }) => (
      <span className="font-medium capitalize">{row.original.provider}</span>
    ),
  },
  {
    accessorKey: "avgLatencyMs",
    header: "Avg latency",
    cell: ({ row }) => (
      <span className="tabular-nums">
        {(row.original.avgLatencyMs ?? 0).toLocaleString()} ms
      </span>
    ),
    size: 130,
  },
  {
    accessorKey: "totalCalls",
    header: "Calls (7d)",
    cell: ({ row }) => (
      <span className="tabular-nums">
        {(row.original.totalCalls ?? 0).toLocaleString()}
      </span>
    ),
    size: 110,
  },
  {
    accessorKey: "failureRate",
    header: "Failure rate",
    cell: ({ row }) => (
      <span
        className={cn(
          "tabular-nums",
          row.original.failureRate > 0.1 && "text-rose-500 font-semibold",
        )}
      >
        {(row.original.failureRate * 100).toFixed(1)}%
      </span>
    ),
    size: 120,
  },
];

function ProvidersTab() {
  const { data, isLoading, isFetching } = useGetOpsProvidersQuery(undefined, {
    pollingInterval: POLL,
  });
  return (
    <div className="space-y-4">
      <p className="text-sm text-muted-foreground">
        AI provider latency and throughput over the last 7 days (from call
        events).
      </p>
      <Card>
        <CardContent className="p-0 pb-2">
          <DataTable
            columns={providerColumns}
            data={data?.providers ?? []}
            isLoading={isLoading || isFetching}
            emptyMessage="No provider activity recorded."
          />
        </CardContent>
      </Card>
    </div>
  );
}

function MuteControl() {
  const { data } = useGetAlertsMuteQuery(undefined, { pollingInterval: POLL });
  const [mute, { isLoading }] = useMuteAlertsMutation();
  const muted = data?.muted ?? false;

  const toggle = async () => {
    try {
      const res = await mute({ minutes: muted ? 0 : 60 }).unwrap();
      toast.success(res.message);
    } catch {
      toast.error("Failed to update alert mute");
    }
  };

  return (
    <Button
      variant="outline"
      size="sm"
      className={cn("gap-1.5", muted && "text-amber-500 border-amber-500/30")}
      onClick={toggle}
      disabled={isLoading}
    >
      {muted ? (
        <BellOff className="size-3.5" />
      ) : (
        <BellRing className="size-3.5" />
      )}
      {muted ? "Alerts muted" : "Mute alerts 60m"}
    </Button>
  );
}

export default function SystemPage() {
  return (
    <DashboardShell>
      <div className="space-y-6 animate-fade-up">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <Activity className="size-5 text-primary" />
            <div>
              <h1 className="text-xl font-bold tracking-tight">
                System Health
              </h1>
              <p className="text-sm text-muted-foreground">
                Circuit breakers, job queues, and provider performance —
                auto-refreshing.
              </p>
            </div>
          </div>
          <MuteControl />
        </div>

        <Tabs defaultValue="breakers">
          <TabsList>
            <TabsTrigger value="breakers">Breakers</TabsTrigger>
            <TabsTrigger value="queues">Queues</TabsTrigger>
            <TabsTrigger value="providers">Providers</TabsTrigger>
          </TabsList>
          <TabsContent value="breakers" className="mt-4">
            <BreakersTab />
          </TabsContent>
          <TabsContent value="queues" className="mt-4">
            <QueuesTab />
          </TabsContent>
          <TabsContent value="providers" className="mt-4">
            <ProvidersTab />
          </TabsContent>
        </Tabs>
      </div>
    </DashboardShell>
  );
}
