import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { Progress } from '@/components/ui/progress';
import {
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
  type ChartConfig,
} from '@/components/ui/chart';
import { Bar, BarChart, CartesianGrid, XAxis, YAxis } from 'recharts';
import { SmileIcon, FrownIcon, MinusIcon, PhoneForwardedIcon } from 'lucide-react';

const intentChartConfig = {
  count: { label: 'Requests', color: 'var(--primary)' },
} satisfies ChartConfig;

function SentimentIcon({ sentiment }: { sentiment: string }) {
  if (sentiment === 'positive') return <SmileIcon className="size-3.5 text-success-foreground" />;
  if (sentiment === 'negative') return <FrownIcon className="size-3.5 text-destructive" />;
  return <MinusIcon className="size-3.5 text-muted-foreground" />;
}

interface Props {
  statsLoading: boolean;
  sentimentBreakdown: Record<string, number>;
  totalSentiment: number;
  intentBreakdown: Array<{ intent: string; count: number }>;
}

export function DashboardSentimentRow({
  statsLoading,
  sentimentBreakdown,
  totalSentiment,
  intentBreakdown,
}: Props) {
  return (
    <div className="grid gap-6 lg:grid-cols-3">
      {/* Sentiment */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <SmileIcon className="size-4 text-primary" />
            Caller sentiment
          </CardTitle>
          <CardDescription>AI-detected caller mood</CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          {statsLoading ? (
            <div className="space-y-3">
              <Skeleton className="h-6 w-full" />
              <Skeleton className="h-6 w-full" />
              <Skeleton className="h-6 w-full" />
            </div>
          ) : totalSentiment === 0 ? (
            <div className="flex h-24 items-center justify-center text-sm text-muted-foreground">
              No sentiment data yet
            </div>
          ) : (
            ['positive', 'neutral', 'negative'].map((key) => {
              const count = sentimentBreakdown[key] ?? 0;
              const pct = totalSentiment > 0 ? (count / totalSentiment) * 100 : 0;
              return (
                <div key={key} className="space-y-1">
                  <div className="flex items-center justify-between text-sm">
                    <div className="flex items-center gap-2">
                      <SentimentIcon sentiment={key} />
                      <span className="capitalize">{key}</span>
                    </div>
                    <span className="font-medium tabular-nums">
                      {count} ({pct.toFixed(0)}%)
                    </span>
                  </div>
                  <Progress value={pct} className="h-1.5" />
                </div>
              );
            })
          )}
        </CardContent>
      </Card>

      {/* Top Intents */}
      <Card className="lg:col-span-2">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <PhoneForwardedIcon className="size-4 text-primary" />
            Top caller intents
          </CardTitle>
          <CardDescription>What patients are calling about</CardDescription>
        </CardHeader>
        <CardContent>
          {statsLoading ? (
            <Skeleton className="h-[220px] w-full" />
          ) : intentBreakdown.length === 0 ? (
            <div className="flex h-[220px] items-center justify-center text-sm text-muted-foreground">
              No intent data yet
            </div>
          ) : (
            <ChartContainer config={intentChartConfig} className="h-[220px] w-full">
              <BarChart data={intentBreakdown} layout="vertical" margin={{ left: 8, right: 12 }}>
                <CartesianGrid horizontal={false} strokeDasharray="3 3" />
                <XAxis type="number" hide />
                <YAxis
                  type="category"
                  dataKey="intent"
                  tickLine={false}
                  axisLine={false}
                  width={120}
                  tick={{ fontSize: 12 }}
                />
                <ChartTooltip content={<ChartTooltipContent />} />
                <Bar dataKey="count" fill="var(--color-count)" radius={[0, 6, 6, 0]} />
              </BarChart>
            </ChartContainer>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
