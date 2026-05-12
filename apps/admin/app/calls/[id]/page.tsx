"use client";

import { format } from "date-fns";
import { ArrowLeft, Clock, Mic, Phone, Zap } from "lucide-react";
import Link from "next/link";
import { useParams } from "next/navigation";
import type React from "react";
import { BentoCard } from "@/components/bento-card";
import { DashboardShell } from "@/components/dashboard-shell";
import { PageHeader } from "@/components/page-header";
import { StatusBadge } from "@/components/status-badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { useGetCallQuery } from "@/features/admin/adminApi";

function fmtDuration(s?: number) {
  if (s == null) return "—";
  return `${Math.floor(s / 60)}m ${s % 60}s`;
}

function InfoItem({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div>
      <div className="text-[10px] uppercase tracking-wider font-medium text-zinc-400 mb-1">
        {label}
      </div>
      <div className="text-sm text-zinc-900 dark:text-zinc-100">{value}</div>
    </div>
  );
}

type TranscriptTurn = { role?: string; content?: string; text?: string };

export default function CallDetailPage() {
  const { id } = useParams<{ id: string }>();
  const { data, isLoading } = useGetCallQuery(id);

  const call = data?.data;
  const events = call?.events ?? [];
  const transcripts = call?.transcripts ?? [];

  return (
    <DashboardShell>
      <div className="space-y-6">
        <PageHeader
          title={isLoading ? "Loading…" : `Call ${id.slice(0, 8)}…`}
          breadcrumbs={[
            { label: "Calls", href: "/calls" },
            { label: `${id.slice(0, 8)}…` },
          ]}
          badge={call ? <StatusBadge value={call.status} dot /> : undefined}
          actions={
            <Link href="/calls">
              <Button variant="ghost" size="sm" className="gap-1.5">
                <ArrowLeft size={13} />
                Back
              </Button>
            </Link>
          }
        />

        {isLoading ? (
          <div className="space-y-4">
            {Array.from({ length: 3 }).map((_, i) => (
              <Skeleton
                key={`sk-${i}`}
                className="h-40 w-full rounded-[2rem]"
              />
            ))}
          </div>
        ) : !call ? (
          <BentoCard>
            <p className="text-sm text-zinc-500 py-8 text-center">
              Call not found.
            </p>
          </BentoCard>
        ) : (
          <div className="space-y-5">
            <div className="grid grid-cols-1 xl:grid-cols-12 gap-5">
              {/* Call overview */}
              <BentoCard
                className="xl:col-span-8"
                title="Call Details"
                icon={<Phone size={14} />}
              >
                <div className="mt-2 grid grid-cols-2 md:grid-cols-3 gap-4">
                  <InfoItem
                    label="Status"
                    value={<StatusBadge value={call.status} dot />}
                  />
                  <InfoItem
                    label="Duration"
                    value={fmtDuration(call.durationSeconds)}
                  />
                  <InfoItem
                    label="Caller"
                    value={
                      <code className="text-xs font-mono">
                        {call.callerNumber || "—"}
                      </code>
                    }
                  />
                  <InfoItem
                    label="Clinic Number"
                    value={
                      <code className="text-xs font-mono">
                        {call.clinicNumber || "—"}
                      </code>
                    }
                  />
                  <InfoItem
                    label="Clinic"
                    value={
                      call.tenantId ? (
                        <Link
                          href={`/tenants/${call.tenantId}`}
                          className="text-emerald-500 hover:underline"
                        >
                          {call.clinicName || call.tenantId.slice(0, 8)}
                        </Link>
                      ) : (
                        "—"
                      )
                    }
                  />
                  <InfoItem label="End Reason" value={call.endReason || "—"} />
                  {call.aiProvider && (
                    <InfoItem label="AI Provider" value={call.aiProvider} />
                  )}
                  {call.aiModel && (
                    <InfoItem
                      label="AI Model"
                      value={
                        <code className="text-xs font-mono">
                          {call.aiModel}
                        </code>
                      }
                    />
                  )}
                  {call.costEstimate && (
                    <InfoItem
                      label="Estimated Cost"
                      value={call.costEstimate}
                    />
                  )}
                  {call.startedAt && (
                    <InfoItem
                      label="Started"
                      value={format(
                        new Date(call.startedAt),
                        "MMM d, HH:mm:ss",
                      )}
                    />
                  )}
                  {call.endedAt && (
                    <InfoItem
                      label="Ended"
                      value={format(new Date(call.endedAt), "MMM d, HH:mm:ss")}
                    />
                  )}
                </div>
              </BentoCard>

              {/* Intent summary */}
              {call.intentSummary && (
                <BentoCard
                  className="xl:col-span-4"
                  title="Intent"
                  icon={<Zap size={14} />}
                >
                  <p className="mt-2 text-sm text-zinc-600 dark:text-zinc-300 leading-relaxed">
                    {call.intentSummary}
                  </p>
                </BentoCard>
              )}
            </div>

            {/* Event timeline */}
            {events.length > 0 && (
              <BentoCard title="Event Timeline" icon={<Clock size={14} />}>
                <div className="mt-3 relative pl-6">
                  <div className="absolute left-1.5 top-1 bottom-1 w-px bg-zinc-200 dark:bg-zinc-800" />
                  <div className="space-y-4">
                    {events.map((event, i) => (
                      <div key={event.id ?? i} className="relative">
                        <div className="absolute -left-6 top-1 w-2.5 h-2.5 rounded-full bg-zinc-300 dark:bg-zinc-700 ring-2 ring-white dark:ring-zinc-950 shrink-0" />
                        <div className="flex items-center gap-2 flex-wrap mb-0.5">
                          <span className="text-xs font-semibold text-zinc-900 dark:text-zinc-100">
                            {event.eventType}
                          </span>
                          {event.actor && (
                            <span className="text-[10px] text-zinc-400">
                              by {event.actor}
                            </span>
                          )}
                          {event.latencyMs != null && (
                            <span className="text-[10px] font-mono text-zinc-400">
                              {event.latencyMs}ms
                            </span>
                          )}
                          <span className="ml-auto text-[10px] text-zinc-400">
                            {event.timestamp
                              ? format(
                                  new Date(event.timestamp),
                                  "HH:mm:ss.SSS",
                                )
                              : "—"}
                          </span>
                        </div>
                        {event.payload &&
                          Object.keys(event.payload).length > 0 && (
                            <pre className="text-[10px] font-mono text-zinc-500 truncate max-w-full bg-zinc-50 dark:bg-zinc-900/50 rounded px-2 py-1">
                              {JSON.stringify(event.payload)}
                            </pre>
                          )}
                      </div>
                    ))}
                  </div>
                </div>
              </BentoCard>
            )}

            {/* Transcripts */}
            {transcripts.map((transcript) => (
              <BentoCard
                key={transcript.id}
                title="Transcript"
                icon={<Mic size={14} />}
              >
                <div className="mt-2 space-y-4">
                  {transcript.summary && (
                    <div>
                      <div className="text-[10px] uppercase tracking-wider font-medium text-zinc-400 mb-1">
                        Summary
                      </div>
                      <p className="text-sm text-zinc-600 dark:text-zinc-300 leading-relaxed">
                        {transcript.summary}
                      </p>
                    </div>
                  )}
                  <div className="flex gap-4 flex-wrap">
                    {transcript.sentiment && (
                      <div>
                        <div className="text-[10px] uppercase tracking-wider font-medium text-zinc-400 mb-1">
                          Sentiment
                        </div>
                        <StatusBadge value={transcript.sentiment} />
                      </div>
                    )}
                    {transcript.intentDetected && (
                      <div>
                        <div className="text-[10px] uppercase tracking-wider font-medium text-zinc-400 mb-1">
                          Intent
                        </div>
                        <code className="text-xs font-mono text-zinc-600 dark:text-zinc-300">
                          {transcript.intentDetected}
                        </code>
                      </div>
                    )}
                  </div>
                  {Array.isArray(transcript.fullTranscript) &&
                    transcript.fullTranscript.length > 0 && (
                      <div>
                        <div className="text-[10px] uppercase tracking-wider font-medium text-zinc-400 mb-2">
                          Conversation
                        </div>
                        <div className="space-y-2 max-h-[480px] overflow-y-auto pr-1">
                          {(transcript.fullTranscript as TranscriptTurn[]).map(
                            (turn, i) => {
                              const role = turn.role ?? "unknown";
                              const text =
                                turn.content ??
                                turn.text ??
                                JSON.stringify(turn);
                              const isAssistant =
                                role === "assistant" || role === "ai";
                              return (
                                <div
                                  key={i}
                                  className={`flex ${isAssistant ? "justify-start" : "justify-end"}`}
                                >
                                  <div
                                    className={`max-w-[80%] rounded-2xl px-3 py-2 text-xs ${
                                      isAssistant
                                        ? "bg-zinc-100 dark:bg-zinc-800 text-zinc-700 dark:text-zinc-300 rounded-tl-sm"
                                        : "bg-emerald-500/10 text-emerald-700 dark:text-emerald-300 rounded-tr-sm"
                                    }`}
                                  >
                                    <div className="text-[9px] uppercase tracking-wider font-bold mb-0.5 opacity-50">
                                      {role}
                                    </div>
                                    {text}
                                  </div>
                                </div>
                              );
                            },
                          )}
                        </div>
                      </div>
                    )}
                </div>
              </BentoCard>
            ))}
          </div>
        )}
      </div>
    </DashboardShell>
  );
}
