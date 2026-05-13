"use client";

import { Loader2, RefreshCw, Save, Settings } from "lucide-react";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { DashboardShell } from "@/components/dashboard-shell";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  useGetConfigQuery,
  useRunDataRetentionMutation,
  useSetConfigMutation,
} from "@/features/admin/adminApi";
import { API_BASE_URL } from "@/lib/api";

function ConfigRow({
  configKey,
  label,
  description,
}: {
  configKey: string;
  label: string;
  description?: string;
}) {
  const { data, isLoading } = useGetConfigQuery(configKey);
  const [setConfig, { isLoading: isSaving }] = useSetConfigMutation();
  const [value, setValue] = useState("");
  const [dirty, setDirty] = useState(false);

  useEffect(() => {
    if (data?.value !== undefined) {
      setValue(data.value);
      setDirty(false);
    }
  }, [data?.value]);

  const handleSave = async () => {
    try {
      await setConfig({ key: configKey, value }).unwrap();
      toast.success(`${label} updated`);
      setDirty(false);
    } catch {
      toast.error(`Failed to update ${label}`);
    }
  };

  return (
    <div className="flex items-start justify-between gap-4 rounded-xl border border-border p-4">
      <div className="flex-1 min-w-0">
        <div className="text-sm font-medium">{label}</div>
        {description && (
          <p className="text-xs text-muted-foreground mt-0.5">{description}</p>
        )}
        <div className="mt-2">
          {isLoading ? (
            <div className="h-9 bg-muted rounded-lg animate-pulse w-full" />
          ) : (
            <input
              type="text"
              value={value}
              onChange={(e) => {
                setValue(e.target.value);
                setDirty(true);
              }}
              className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm font-mono focus:outline-none focus:ring-2 focus:ring-emerald-500/20 transition"
            />
          )}
        </div>
      </div>
      <Button
        size="sm"
        disabled={!dirty || isSaving}
        onClick={handleSave}
        className="shrink-0 mt-6 gap-1.5"
      >
        {isSaving ? (
          <Loader2 size={12} className="animate-spin" />
        ) : (
          <Save size={12} />
        )}
        Save
      </Button>
    </div>
  );
}

function DataRetentionCard() {
  const [runRetention, { isLoading }] = useRunDataRetentionMutation();

  const handleRun = async () => {
    try {
      const result = await runRetention().unwrap();
      toast.success(
        `Data retention completed — ${(result as { deleted?: number }).deleted ?? 0} records cleaned.`,
      );
    } catch {
      toast.error("Data retention failed");
    }
  };

  return (
    <div className="flex items-center justify-between rounded-xl border border-border p-4">
      <div>
        <div className="text-sm font-medium">Run data retention</div>
        <p className="text-xs text-muted-foreground mt-0.5">
          Deletes expired sessions and reset tokens per retention policy.
        </p>
      </div>
      <AlertDialog>
        <AlertDialogTrigger asChild>
          <Button variant="outline" size="sm" className="gap-1.5 shrink-0">
            <RefreshCw size={12} />
            Run now
          </Button>
        </AlertDialogTrigger>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Run data retention?</AlertDialogTitle>
            <AlertDialogDescription>
              This will delete expired sessions, reset tokens, and old OTP
              challenges. The operation cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={handleRun} disabled={isLoading}>
              {isLoading ? (
                <Loader2 size={14} className="animate-spin mr-1" />
              ) : null}
              Run retention
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

export default function SettingsPage() {
  return (
    <DashboardShell>
      <div className="space-y-6">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Settings</h1>
          <p className="text-sm text-muted-foreground">
            Platform-level configuration
          </p>
        </div>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-sm font-semibold">
              <Settings size={14} className="text-muted-foreground" />
              Environment
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3 text-sm">
            <div className="flex items-center justify-between rounded-xl border border-border p-3">
              <span className="text-muted-foreground">API Base URL</span>
              <code className="text-xs font-mono">{API_BASE_URL}</code>
            </div>
            <p className="text-xs text-muted-foreground">
              Set{" "}
              <code className="text-xs bg-muted px-1 py-0.5 rounded">
                NEXT_PUBLIC_API_URL
              </code>{" "}
              to point this portal at a different API environment.
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Platform Config</CardTitle>
            <CardDescription>
              Live key/value settings stored in the database
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            <ConfigRow
              configKey="ai.default_provider"
              label="Default AI provider"
              description="Fallback LLM provider when no tenant preference is set."
            />
            <ConfigRow
              configKey="telephony.max_call_duration"
              label="Max call duration (seconds)"
              description="Calls exceeding this duration will be ended automatically."
            />
            <ConfigRow
              configKey="platform.maintenance_mode"
              label="Maintenance mode"
              description='Set to "true" to show a maintenance banner to all tenants.'
            />
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Data Governance</CardTitle>
            <CardDescription>
              Compliance and retention operations
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            <DataRetentionCard />
          </CardContent>
        </Card>
      </div>
    </DashboardShell>
  );
}
