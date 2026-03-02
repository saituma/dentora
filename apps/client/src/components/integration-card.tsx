"use client";

import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";

interface IntegrationCardProps {
  title: string;
  description: string;
  icon: React.ReactNode;
  status: "connected" | "disconnected" | "error";
  lastSync?: string;
  onConnect?: () => void;
  onDisconnect?: () => void;
}

export function IntegrationCard({
  title,
  description,
  icon,
  status,
  lastSync,
  onConnect,
  onDisconnect,
}: IntegrationCardProps) {
  return (
    <Card>
      <CardHeader className="flex flex-row items-start justify-between">
        <div className="flex items-center gap-3">
          <div className="flex size-10 items-center justify-center rounded-lg bg-muted">
            {icon}
          </div>
          <div>
            <CardTitle className="text-base">{title}</CardTitle>
            <CardDescription>{description}</CardDescription>
          </div>
        </div>
        <Badge
          variant={status === "connected" ? "default" : "secondary"}
          className={cn(
            status === "error" && "bg-destructive/10 text-destructive"
          )}
        >
          {status}
        </Badge>
      </CardHeader>
      <CardContent>
        {lastSync && (
          <p className="mb-4 text-xs text-muted-foreground">
            Last synced: {lastSync}
          </p>
        )}
        {status === "connected" ? (
          <Button variant="outline" size="sm" onClick={onDisconnect}>
            Disconnect
          </Button>
        ) : (
          <Button size="sm" onClick={onConnect}>
            Connect
          </Button>
        )}
      </CardContent>
    </Card>
  );
}
