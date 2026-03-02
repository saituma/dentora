"use client";

import {
  Card,
  CardAction,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { TrendingUpIcon, TrendingDownIcon } from "lucide-react";
import { cn } from "@/lib/utils";

interface StatsCardProps {
  title: string;
  value: string | number;
  description?: string;
  trend?: {
    value: number;
    label: string;
    positive?: boolean;
  };
  className?: string;
}

export function StatsCard({
  title,
  value,
  description,
  trend,
  className,
}: StatsCardProps) {
  return (
    <Card className={cn("@container/card", className)}>
      <CardHeader>
        <CardDescription>{title}</CardDescription>
        <CardTitle className="text-2xl font-semibold tabular-nums @[250px]/card:text-3xl">
          {value}
        </CardTitle>
        {trend && (
          <CardAction>
            <Badge
              variant="outline"
              className={cn(
                trend.positive === false && "text-destructive"
              )}
            >
              {trend.positive === false ? (
                <TrendingDownIcon />
              ) : (
                <TrendingUpIcon />
              )}
              {trend.value > 0 ? "+" : ""}
              {trend.value}%
            </Badge>
          </CardAction>
        )}
      </CardHeader>
      {(description || trend?.label) && (
        <CardFooter className="flex-col items-start gap-1.5 text-sm">
          {trend?.label && (
            <div className="line-clamp-1 flex gap-2 font-medium">
              {trend.label}{" "}
              {trend.positive === false ? (
                <TrendingDownIcon className="size-4" />
              ) : (
                <TrendingUpIcon className="size-4" />
              )}
            </div>
          )}
          {description && (
            <div className="text-muted-foreground">{description}</div>
          )}
        </CardFooter>
      )}
    </Card>
  );
}
