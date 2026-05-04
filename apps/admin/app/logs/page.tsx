"use client";

import { Activity } from "lucide-react";
import { useEffect, useState } from "react";
import { BentoCard } from "@/components/bento-card";
import { DashboardShell } from "@/components/dashboard-shell";
import { API_BASE_URL, ensureFreshToken } from "@/lib/api";

interface LogEntry {
  level?: number;
  time?: string;
  msg?: string;
  [key: string]: unknown;
}

function formatLevel(level?: number): string {
  if (!level) return "info";
  if (level >= 50) return "error";
  if (level >= 40) return "warn";
  if (level >= 30) return "info";
  return "debug";
}

export default function LogsPage() {
  const [logs, setLogs] = useState<LogEntry[]>([]);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const controller = new AbortController();
    let active = true;

    const connect = async () => {
      const token = await ensureFreshToken();
      if (!token) {
        setError("Missing auth token");
        return;
      }

      const response = await fetch(`${API_BASE_URL}/admin/live-logs`, {
        method: "GET",
        credentials: "include",
        headers: {
          Authorization: `Bearer ${token}`,
          Accept: "text/event-stream",
        },
        signal: controller.signal,
      });

      if (!response.ok || !response.body) {
        throw new Error("Failed to connect to live logs");
      }

      const decoder = new TextDecoder();
      const reader = response.body.getReader();
      let buffer = "";

      while (active) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        let boundaryIndex = buffer.indexOf("\n\n");
        while (boundaryIndex !== -1) {
          const packet = buffer.slice(0, boundaryIndex);
          buffer = buffer.slice(boundaryIndex + 2);
          boundaryIndex = buffer.indexOf("\n\n");

          const dataLine = packet
            .split("\n")
            .find((line) => line.startsWith("data: "));
          if (!dataLine) continue;

          const payload = dataLine.slice(6);
          try {
            const entry = JSON.parse(payload) as LogEntry;
            setLogs((prev) => [entry, ...prev].slice(0, 200));
          } catch {
            // ignore malformed entries
          }
        }
      }
    };

    connect().catch((err) => {
      setError(err instanceof Error ? err.message : "Connection failed");
    });

    return () => {
      active = false;
      controller.abort();
    };
  }, []);

  return (
    <DashboardShell>
      <div className="space-y-6">
        <div>
          <h1 className="text-2xl font-bold tracking-tighter text-zinc-900 dark:text-zinc-50">
            Live Logs
          </h1>
          <p className="text-sm text-zinc-500">
            Streaming application logs from the API in real time
          </p>
        </div>

        <BentoCard title="Log Stream" icon={<Activity size={14} />}>
          {error ? (
            <p className="text-sm text-rose-500">{error}</p>
          ) : logs.length === 0 ? (
            <p className="text-sm text-zinc-500">Waiting for log events...</p>
          ) : (
            <div className="space-y-2 max-h-[70vh] overflow-y-auto">
              {logs.map((entry, index) => {
                const key = `${entry.time ?? "no-time"}-${entry.msg ?? "no-msg"}-${index}`;
                return (
                  <div
                    key={key}
                    className="rounded-xl border border-zinc-200 dark:border-zinc-800/60 p-3 bg-zinc-50/60 dark:bg-zinc-900/40"
                  >
                    <div className="flex items-center gap-2 text-[10px] uppercase tracking-widest text-zinc-500">
                      <span>{formatLevel(entry.level)}</span>
                      <span>•</span>
                      <span>
                        {entry.time
                          ? new Date(entry.time).toLocaleTimeString()
                          : "-"}
                      </span>
                    </div>
                    <p className="mt-1 text-xs text-zinc-800 dark:text-zinc-200 font-mono break-all">
                      {entry.msg || "(no message)"}
                    </p>
                  </div>
                );
              })}
            </div>
          )}
        </BentoCard>
      </div>
    </DashboardShell>
  );
}
