"use client";

import { useState } from "react";
import { toast } from "sonner";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Field, FieldGroup, FieldLabel } from "@/components/ui/field";
import { IntegrationCard } from "@/components/integration-card";
import {
  CalendarIcon,
  DatabaseIcon,
  PhoneIcon,
  KeyIcon,
  CopyIcon,
  CheckIcon,
} from "lucide-react";

export default function IntegrationsPage() {
  const [calendarConnected, setCalendarConnected] = useState(false);
  const [copiedKey, setCopiedKey] = useState<string | null>(null);

  const handleCopyKey = (key: string) => {
    navigator.clipboard.writeText(key);
    setCopiedKey(key);
    toast.success("API key copied");
    setTimeout(() => setCopiedKey(null), 2000);
  };

  return (
    <div className="flex flex-col gap-8">
      <div>
        <h2 className="text-lg font-semibold">Integrations</h2>
        <p className="text-sm text-muted-foreground">
          Connect your calendar, PMS, and manage API access
        </p>
      </div>

      <div className="space-y-6">
        <h3 className="text-sm font-medium">Calendar & scheduling</h3>
        <div className="grid gap-4 md:grid-cols-2">
          <IntegrationCard
            title="Google Calendar"
            description="Sync availability and create appointments"
            icon={<CalendarIcon className="size-5" />}
            status={calendarConnected ? "connected" : "disconnected"}
            lastSync={calendarConnected ? "2 min ago" : undefined}
            onConnect={() => {
              setCalendarConnected(true);
              toast.success("Google Calendar connected");
            }}
            onDisconnect={() => {
              setCalendarConnected(false);
              toast.success("Disconnected");
            }}
          />
          <IntegrationCard
            title="Outlook Calendar"
            description="Sync with Microsoft 365"
            icon={<CalendarIcon className="size-5" />}
            status="disconnected"
            onConnect={() => toast.info("OAuth flow would start here")}
          />
        </div>
      </div>

      <div className="space-y-6">
        <h3 className="text-sm font-medium">Practice management</h3>
        <IntegrationCard
          title="PMS / Dentally"
          description="Connect your practice management system"
          icon={<DatabaseIcon className="size-5" />}
          status="disconnected"
          onConnect={() => toast.info("PMS integration setup would start")}
        />
      </div>

      <div className="space-y-6">
        <h3 className="text-sm font-medium">Phone</h3>
        <IntegrationCard
          title="Phone number"
          description="Your AI receptionist number"
          icon={<PhoneIcon className="size-5" />}
          status="connected"
          lastSync="Active"
          onDisconnect={() => toast.info("Number management")}
        />
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <KeyIcon className="size-5" />
            API keys
          </CardTitle>
          <CardDescription>
            Use API keys to integrate with external systems
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          <FieldGroup>
            <Field>
              <FieldLabel>Create new key</FieldLabel>
              <div className="flex gap-2">
                <Input placeholder="Key name (e.g. Production)" />
                <Button>Create</Button>
              </div>
            </Field>
          </FieldGroup>
          <div>
            <p className="mb-2 text-sm font-medium">Existing keys</p>
            <div className="space-y-2">
              <div className="flex items-center justify-between rounded-lg border p-3">
                <span className="font-mono text-sm">df_live_••••••••••••abc1</span>
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={() => handleCopyKey("df_live_xxxx")}
                >
                  {copiedKey ? (
                    <CheckIcon className="size-4 text-green-500" />
                  ) : (
                    <CopyIcon className="size-4" />
                  )}
                </Button>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
