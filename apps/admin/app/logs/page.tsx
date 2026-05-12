"use client";

import { Activity, Circle, Pause, Play, Search, Trash2 } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import { BentoCard } from "@/components/bento-card";
import { DashboardShell } from "@/components/dashboard-shell";
import { PageHeader } from "@/components/page-header";
import { Button } from "@/components/ui/button";
import { API_BASE_URL, ensureFreshToken } from "@/lib/api";
import { cn } from "@/lib/utils";

interface LogEntry {
  level?: number;
  time?: string | number;
  msg?: string;
  [key: string]: unknown;
}

type Level = "all" | "debug" | "info" | "warn" | "error";

function parseLevel(level?: number): "debug" | "info" | "warn" | "error" {
  if (!level) return "info";
  if (level >= 50) return "error";
  if (level >= 40) return "warn";
  if (level >= 30) return "info";
  return "debug";
}

const levelColor: Record<string, string> = {
  error: "text-rose-500",
  warn: "text-amber-500",
  info: "text-blue-400",
  debug: "text-zinc-500",
};

const levelDot: Record<string, string> = {
  error: "bg-rose-500",
  warn: "bg-amber-500",
  info: "bg-blue-400",
  debug: "bg-zinc-500",
};

const LEVELS: Level[] = ["all", "debug", "info", "warn", "error"];

export default function LogsPage() {
  const [logs, setLogs] = useState<LogEntry[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [paused, setPaused] = useState(false);
  const [levelFilter, setLevelFilter] = useState<Level>("all");
  const [search, setSearch] = useState("");
  const [connected, setConnected] = useState(false);
  const pausedRef = useRef(false);
  const bufferRef = useRef<LogEntry[]>([]);
  const bottomRef = useRef<HTMLDivElement | null>(null);

  const addLog = useCallback((entry: LogEntry) => {
    if (pausedRef.current) {
      bufferRef.current = [...bufferRef.current, entry].slice(-200);
      return;
    }
    setLogs((prev) => [entry, ...prev].slice(0, 500));
  }, []);

  const handlePauseToggle = () => {
    const next = !paused;
    setPaused(next);
    pausedRef.current = next;
    if (!next && bufferRef.current.length > 0) {
      setLogs((prev) =>
        [...bufferRef.current.reverse(), ...prev].slice(0, 500),
      );
      bufferRef.current = [];
    }
  };

  useEffect(() => {
    const controller = new AbortController();
    let active = true;

    const connect = async () => {
      setConnected(false);
      const token = await ensureFreshToken();
      if (!token) {
        setError("Missing auth token");
        return;
      }

      const res = await fetch(`${API_BASE_URL}/admin/live-logs`, {
        credentials: "include",
        headers: {
          Authorization: `Bearer ${token}`,
          Accept: "text/event-stream",
        },
        signal: controller.signal,
      });

      if (!res.ok || !res.body)
        throw new Error("Failed to connect to live logs");
      setConnected(true);
      setError(null);

      const decoder = new TextDecoder();
      const reader = res.body.getReader();
      let buffer = "";

      while (active) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        let idx = buffer.indexOf("\n\n");
        while (idx !== -1) {
          const packet = buffer.slice(0, idx);
          buffer = buffer.slice(idx + 2);
          idx = buffer.indexOf("\n\n");
          const dataLine = packet
            .split("\n")
            .find((l) => l.startsWith("data: "));
          if (!dataLine) continue;
          try {
            const entry = JSON.parse(dataLine.slice(6)) as LogEntry;
            addLog(entry);
          } catch {
            // ignore malformed
          }
        }
      }
    };

    connect().catch((err) => {
      if (err instanceof DOMException && err.name === "AbortError") return;
      setError(err instanceof Error ? err.message : "Connection failed");
      setConnected(false);
    });

    return () => {
      active = false;
      controller.abort();
    };
  }, [addLog]);

  const filtered = logs.filter((entry) => {
    const lvl = parseLevel(entry.level);
    if (levelFilter !== "all" && lvl !== levelFilter) return false;
    if (search) {
      const haystack =
        `${entry.msg ?? ""} ${JSON.stringify(entry)}`.toLowerCase();
      if (!haystack.includes(search.toLowerCase())) return false;
    }
    return true;
  });

  return (
    <DashboardShell>
      <div className="space-y-6">
        <PageHeader
          title="Live Logs"
          description="Streaming server logs in real time"
          badge={
            <span
              className={cn(
                "inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider",
                connected
                  ? "bg-emerald-500/10 text-emerald-500"
                  : "bg-zinc-500/10 text-zinc-500",
              )}
            >
              <span
                className={cn(
                  "w-1.5 h-1.5 rounded-full",
                  connected ? "bg-emerald-500 animate-pulse" : "bg-zinc-500",
                )}
              />
              {connected ? "live" : "connecting"}
            </span>
          }
          actions={
            <div className="flex items-center gap-2">
              {/* Level filter */}
              <div className="flex gap-1">
                {LEVELS.map((l) => (
                  <button
                    key={l}
                    type="button"
                    onClick={() => setLevelFilter(l)}
                    className={cn(
                      "px-2.5 py-1 rounded-lg text-xs font-medium transition capitalize",
                      levelFilter === l
                        ? "bg-zinc-900 dark:bg-zinc-100 text-white dark:text-zinc-900"
                        : "bg-zinc-100 dark:bg-zinc-800 text-zinc-500 hover:bg-zinc-200 dark:hover:bg-zinc-700",
                    )}
                  >
                    {l}
                  </button>
                ))}
              </div>
              {/* Search */}
              <div className="relative">
                <Search
                  size={14}
                  className="absolute left-3 top-1/2 -translate-y-1/2 text-zinc-400"
                />
                <input
                  type="text"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  placeholder="Search logs…"
                  className="pl-9 pr-4 py-2 rounded-xl bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-white/10 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500/20 w-44 transition"
                />
              </div>
              {/* Pause / Clear */}
              <Button
                variant="outline"
                size="sm"
                onClick={handlePauseToggle}
                className="gap-1.5"
              >
                {paused ? <Play size={13} /> : <Pause size={13} />}
                {paused ? "Resume" : "Pause"}
                {paused && bufferRef.current.length > 0 && (
                  <span className="ml-1 bg-amber-500 text-white text-[10px] rounded-full px-1.5 py-0.5 font-bold">
                    {bufferRef.current.length}
                  </span>
                )}
              </Button>
              <Button
                variant="ghost"
                size="icon"
                className="h-8 w-8 text-zinc-400 hover:text-rose-500"
                onClick={() => setLogs([])}
                aria-label="Clear logs"
              >
                <Trash2 size={14} />
              </Button>
            </div>
          }
        />

        <BentoCard>
          {error ? (
            <div className="flex items-center gap-2 text-rose-500 text-sm py-4">
              <Circle size={8} className="fill-rose-500" />
              {error}
            </div>
          ) : filtered.length === 0 && !paused ? (
            <div className="flex items-center gap-2 text-zinc-500 text-sm py-8">
              <Activity size={14} className="animate-pulse" />
              Waiting for log events…
            </div>
          ) : (
            <div className="space-y-1.5 max-h-[70vh] overflow-y-auto no-scrollbar pr-1">
              {filtered.map((entry, i) => {
                const lvl = parseLevel(entry.level);
                const ts = entry.time
                  ? new Date(
                      typeof entry.time === "number" ? entry.time : entry.time,
                    ).toLocaleTimeString()
                  : "—";
                const key = `${entry.time ?? ""}-${i}`;
                return (
                  <div
                    key={key}
                    className="rounded-xl border border-zinc-200 dark:border-zinc-800/60 px-3 py-2.5 bg-zinc-50/60 dark:bg-zinc-900/40 flex gap-3"
                  >
                    <div
                      className={cn(
                        "mt-1 w-1.5 h-1.5 rounded-full shrink-0",
                        levelDot[lvl],
                      )}
                    />
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-3 mb-0.5">
                        <span
                          className={cn(
                            "text-[10px] uppercase tracking-widest font-bold",
                            levelColor[lvl],
                          )}
                        >
                          {lvl}
                        </span>
                        <span className="text-[10px] text-zinc-400">{ts}</span>
                      </div>
                      <p className="text-xs text-zinc-800 dark:text-zinc-200 font-mono break-all">
                        {entry.msg || "(no message)"}
                      </p>
                    </div>
                  </div>
                );
              })}
              <div ref={bottomRef} />
            </div>
          )}
        </BentoCard>
      </div>
    </DashboardShell>
  );
}
