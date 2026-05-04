"use client";

import { Settings } from "lucide-react";
import { BentoCard } from "@/components/bento-card";
import { DashboardShell } from "@/components/dashboard-shell";
import { API_BASE_URL } from "@/lib/api";

export default function SettingsPage() {
  return (
    <DashboardShell>
      <div className="space-y-6">
        <div>
          <h1 className="text-2xl font-bold tracking-tighter text-zinc-900 dark:text-zinc-50">
            Settings
          </h1>
          <p className="text-sm text-zinc-500">
            Platform-level configuration overview
          </p>
        </div>

        <BentoCard title="Environment" icon={<Settings size={14} />}>
          <div className="space-y-3 text-sm">
            <div className="flex items-center justify-between rounded-xl border border-zinc-200 dark:border-zinc-800/60 p-3">
              <span className="text-zinc-500">API Base URL</span>
              <code className="text-xs text-zinc-900 dark:text-zinc-100">
                {API_BASE_URL}
              </code>
            </div>
            <p className="text-xs text-zinc-500">
              Use <code>NEXT_PUBLIC_API_URL</code> to point this admin portal at
              a specific API environment.
            </p>
          </div>
        </BentoCard>
      </div>
    </DashboardShell>
  );
}
