"use client";

import { Search, Users } from "lucide-react";
import { useState } from "react";
import { BentoCard } from "@/components/bento-card";
import { DashboardShell } from "@/components/dashboard-shell";
import { useGetUsersQuery } from "@/features/admin/adminApi";

export default function UsersPage() {
  const [search, setSearch] = useState("");
  const { data, isLoading } = useGetUsersQuery({
    limit: 50,
    offset: 0,
    search: search || undefined,
  });
  const users = data?.data ?? [];

  return (
    <DashboardShell>
      <div className="space-y-6">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold tracking-tighter text-zinc-900 dark:text-zinc-50">
              Users
            </h1>
            <p className="text-sm text-zinc-500">
              Platform and tenant user accounts
            </p>
          </div>
          <div className="relative">
            <Search
              size={16}
              className="absolute left-3 top-1/2 -translate-y-1/2 text-zinc-400"
            />
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search by email..."
              className="pl-10 pr-4 py-2.5 rounded-xl bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-white/10 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500/20 w-64 transition"
            />
          </div>
        </div>

        <BentoCard title="User Directory" icon={<Users size={14} />}>
          <div className="overflow-x-auto">
            <table className="w-full text-sm text-left">
              <thead className="text-zinc-500 dark:text-zinc-400 text-xs font-medium border-b border-zinc-100 dark:border-zinc-800/50">
                <tr>
                  <th className="px-4 py-3">Email</th>
                  <th className="px-4 py-3">Role</th>
                  <th className="px-4 py-3">Clinic</th>
                  <th className="px-4 py-3 text-right">Created</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-zinc-100 dark:divide-zinc-800/50">
                {isLoading ? (
                  <tr>
                    <td
                      colSpan={4}
                      className="px-4 py-12 text-center text-zinc-500"
                    >
                      Loading users...
                    </td>
                  </tr>
                ) : users.length === 0 ? (
                  <tr>
                    <td
                      colSpan={4}
                      className="px-4 py-12 text-center text-zinc-500"
                    >
                      No users found
                    </td>
                  </tr>
                ) : (
                  users.map((user) => (
                    <tr
                      key={user.id}
                      className="hover:bg-zinc-50/50 dark:hover:bg-zinc-900/30 transition-colors"
                    >
                      <td className="px-4 py-3 font-medium text-zinc-900 dark:text-zinc-100">
                        {user.email}
                      </td>
                      <td className="px-4 py-3 text-xs text-zinc-500">
                        {user.role}
                      </td>
                      <td className="px-4 py-3 text-xs text-zinc-500">
                        {user.clinicName || "-"}
                      </td>
                      <td className="px-4 py-3 text-right text-xs text-zinc-500">
                        {new Date(user.createdAt).toLocaleString()}
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </BentoCard>
      </div>
    </DashboardShell>
  );
}
