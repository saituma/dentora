"use client";

import type { LucideIcon } from "lucide-react";
import {
  Area,
  AreaChart,
  PolarAngleAxis,
  RadialBar,
  RadialBarChart,
  ResponsiveContainer,
} from "recharts";
import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";

interface StatCardProps {
  label: string;
  value: string | number | undefined;
  icon: LucideIcon;
  isLoading?: boolean;
  subtitle?: string;
  /** Real numeric series → renders a tiny cyan sparkline. */
  sparkline?: number[];
  /** 0–100 → renders a radial progress ring instead of a sparkline. */
  ring?: number;
}

export function StatCard({
  label,
  value,
  icon: Icon,
  isLoading = false,
  subtitle,
  sparkline,
  ring,
}: StatCardProps) {
  const sparkData = (sparkline ?? []).map((v, i) => ({ i, v }));
  const gradientId = `spark-${label.replace(/\s+/g, "-").toLowerCase()}`;

  return (
    <Card className="card-interactive overflow-hidden">
      <CardContent className="p-5">
        <div className="flex items-start justify-between">
          <div className="min-w-0">
            <div className="flex items-center gap-1.5 text-xs font-medium text-muted-foreground">
              <Icon className="size-3.5" />
              <span className="truncate">{label}</span>
            </div>
            {isLoading ? (
              <Skeleton className="mt-2 h-8 w-24" />
            ) : (
              <div className="mt-2 text-3xl font-bold tabular-nums glow-primary">
                {value ?? "—"}
              </div>
            )}
            {subtitle && !isLoading && (
              <p className="mt-1 text-xs text-muted-foreground">{subtitle}</p>
            )}
          </div>

          {ring != null && !isLoading && (
            <div className="relative size-16 shrink-0">
              <ResponsiveContainer width="100%" height="100%">
                <RadialBarChart
                  innerRadius="72%"
                  outerRadius="100%"
                  data={[{ value: Math.max(0, Math.min(100, ring)) }]}
                  startAngle={90}
                  endAngle={-270}
                >
                  <PolarAngleAxis
                    type="number"
                    domain={[0, 100]}
                    tick={false}
                  />
                  <RadialBar
                    dataKey="value"
                    background={{ fill: "var(--muted)" }}
                    cornerRadius={8}
                    fill="var(--primary)"
                  />
                </RadialBarChart>
              </ResponsiveContainer>
              <span className="absolute inset-0 flex items-center justify-center text-[11px] font-semibold tabular-nums">
                {Math.round(ring)}%
              </span>
            </div>
          )}
        </div>

        {sparkData.length > 1 && !isLoading && (
          <div className="-mb-1 mt-3 h-10">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart
                data={sparkData}
                margin={{ top: 2, right: 0, left: 0, bottom: 0 }}
              >
                <defs>
                  <linearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
                    <stop
                      offset="0%"
                      stopColor="var(--primary)"
                      stopOpacity={0.35}
                    />
                    <stop
                      offset="100%"
                      stopColor="var(--primary)"
                      stopOpacity={0}
                    />
                  </linearGradient>
                </defs>
                <Area
                  type="monotone"
                  dataKey="v"
                  stroke="var(--primary)"
                  strokeWidth={1.75}
                  fill={`url(#${gradientId})`}
                  dot={false}
                  isAnimationActive={false}
                />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
