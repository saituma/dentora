"use client";

import { format } from "date-fns";
import { ArrowLeft, Clock, Mic, Phone, Zap } from "lucide-react";
import Link from "next/link";
import { useParams } from "next/navigation";
import type React from "react";
import { DashboardShell } from "@/components/dashboard-shell";
import { StatusBadge } from "@/components/status-badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { useGetCallQuery } from "@/features/admin/adminApi";

function fmtDuration(s?: number) {
  if (s == null) return "—";
  return `${Math.floor(s / 60)}m ${s % 60}s`;
}

function InfoItem({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div>
      <div className="text-[10px] uppercase tracking-wider font-medium text-muted-foreground mb-1">
        {label}
      </div>
      <div className="text-sm text-foreground">{value}</div>
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
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div>
              <h1 className="text-2xl font-bold tracking-tight">
                {isLoading ? "Loading…" : `Call ${id.slice(0, 8)}…`}
              </h1>
              <p className="text-sm text-muted-foreground">Call detail</p>
            </div>
            {call && <StatusBadge value={call.status} dot />}
          </div>
          <Link href="/calls">
            <Button variant="ghost" size="sm" className="gap-1.5">
              <ArrowLeft size={13} />
              Back
            </Button>
          </Link>
        </div>

        {isLoading ? (
          <div className="space-y-4">
            {Array.from({ length: 3 }).map((_, i) => (
              <Skeleton key={`sk-${i}`} className="h-40 w-full rounded-xl" />
            ))}
          </div>
        ) : !call ? (
          <Card>
            <CardContent className="pt-6">
              <p className="text-sm text-muted-foreground py-8 text-center">
                Call not found.
              </p>
            </CardContent>
          </Card>
        ) : (
          <div className="space-y-5">
            <div className="grid grid-cols-1 xl:grid-cols-12 gap-5">
              {/* Call overview */}
              <Card className="xl:col-span-8">
                <CardHeader>
                  <CardTitle className="flex items-center gap-2 text-sm font-semibold">
                    <Phone size={14} className="text-muted-foreground" />
                    Call Details
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
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
                    <InfoItem
                      label="End Reason"
                      value={call.endReason || "—"}
                    />
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
                        value={format(
                          new Date(call.endedAt),
                          "MMM d, HH:mm:ss",
                        )}
                      />
                    )}
                  </div>
                </CardContent>
              </Card>

              {/* Intent summary */}
              {call.intentSummary && (
                <Card className="xl:col-span-4">
                  <CardHeader>
                    <CardTitle className="flex items-center gap-2 text-sm font-semibold">
                      <Zap size={14} className="text-muted-foreground" />
                      Intent
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    <p className="text-sm text-muted-foreground leading-relaxed">
                      {call.intentSummary}
                    </p>
                  </CardContent>
                </Card>
              )}
            </div>

            {/* Event timeline */}
            {events.length > 0 && (
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2 text-sm font-semibold">
                    <Clock size={14} className="text-muted-foreground" />
                    Event Timeline
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="relative pl-6">
                    <div className="absolute left-1.5 top-1 bottom-1 w-px bg-border" />
                    <div className="space-y-4">
                      {events.map((event, i) => (
                        <div key={event.id ?? i} className="relative">
                          <div className="absolute -left-6 top-1 w-2.5 h-2.5 rounded-full bg-muted-foreground/30 ring-2 ring-background shrink-0" />
                          <div className="flex items-center gap-2 flex-wrap mb-0.5">
                            <span className="text-xs font-semibold">
                              {event.eventType}
                            </span>
                            {event.actor && (
                              <span className="text-[10px] text-muted-foreground">
                                by {event.actor}
                              </span>
                            )}
                            {event.latencyMs != null && (
                              <span className="text-[10px] font-mono text-muted-foreground">
                                {event.latencyMs}ms
                              </span>
                            )}
                            <span className="ml-auto text-[10px] text-muted-foreground">
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
                              <pre className="text-[10px] font-mono text-muted-foreground truncate max-w-full bg-muted/50 rounded px-2 py-1">
                                {JSON.stringify(event.payload)}
                              </pre>
                            )}
                        </div>
                      ))}
                    </div>
                  </div>
                </CardContent>
              </Card>
            )}

            {/* Transcripts */}
            {transcripts.map((transcript) => (
              <Card key={transcript.id}>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2 text-sm font-semibold">
                    <Mic size={14} className="text-muted-foreground" />
                    Transcript
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                  {transcript.summary && (
                    <div>
                      <div className="text-[10px] uppercase tracking-wider font-medium text-muted-foreground mb-1">
                        Summary
                      </div>
                      <p className="text-sm text-muted-foreground leading-relaxed">
                        {transcript.summary}
                      </p>
                    </div>
                  )}
                  <div className="flex gap-4 flex-wrap">
                    {transcript.sentiment && (
                      <div>
                        <div className="text-[10px] uppercase tracking-wider font-medium text-muted-foreground mb-1">
                          Sentiment
                        </div>
                        <StatusBadge value={transcript.sentiment} />
                      </div>
                    )}
                    {transcript.intentDetected && (
                      <div>
                        <div className="text-[10px] uppercase tracking-wider font-medium text-muted-foreground mb-1">
                          Intent
                        </div>
                        <code className="text-xs font-mono text-muted-foreground">
                          {transcript.intentDetected}
                        </code>
                      </div>
                    )}
                  </div>
                  {Array.isArray(transcript.fullTranscript) &&
                    transcript.fullTranscript.length > 0 && (
                      <div>
                        <div className="text-[10px] uppercase tracking-wider font-medium text-muted-foreground mb-2">
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
                                        ? "bg-muted text-foreground rounded-tl-sm"
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
                </CardContent>
              </Card>
            ))}
          </div>
        )}
      </div>
    </DashboardShell>
  );
}
