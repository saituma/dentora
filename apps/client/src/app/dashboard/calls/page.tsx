'use client';

import { useMemo, useState } from 'react';
import Link from 'next/link';
import {
  Card,
  CardContent,
  CardHeader,
} from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { EmptyState } from '@/components/empty-state';
import { PhoneIcon } from 'lucide-react';
import { useGetCallsQuery } from '@/features/calls/callsApi';
import {
  formatDate,
  formatDuration,
  formatMoney,
  formatStatusLabel,
  statusColors,
} from './call-utils';

export default function CallsPage() {
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [search, setSearch] = useState('');
  const { data: callsData, isLoading: callsLoading } = useGetCallsQuery({ limit: 50 });
  const calls = callsData?.data ?? [];

  const filteredCalls = useMemo(() => {
    return calls.filter((call) => {
      const matchStatus = statusFilter === 'all' || call.status === statusFilter;
      const matchSearch =
        !search || (call.callerNumber ?? '').toLowerCase().includes(search.toLowerCase());
      return matchStatus && matchSearch;
    });
  }, [calls, statusFilter, search]);

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h2 className="text-lg font-semibold">Call history</h2>
          <p className="text-sm text-muted-foreground">
            Real-time view of your AI receptionist call activity
          </p>
        </div>
      </div>

      <Card>
        <CardHeader>
          <div className="flex flex-col gap-4 sm:flex-row sm:items-center">
            <Input
              placeholder="Search by caller number..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="max-w-xs"
            />
            <Select
              value={statusFilter}
              onValueChange={(value) => setStatusFilter(value ?? 'all')}
            >
              <SelectTrigger className="w-[180px]">
                <SelectValue placeholder="Status" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All statuses</SelectItem>
                <SelectItem value="started">Started</SelectItem>
                <SelectItem value="in_progress">In progress</SelectItem>
                <SelectItem value="completed">Completed</SelectItem>
                <SelectItem value="escalated">Escalated</SelectItem>
                <SelectItem value="failed">Failed</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </CardHeader>
        <CardContent>
          {callsLoading ? (
            <div className="text-sm text-muted-foreground">Loading calls…</div>
          ) : filteredCalls.length === 0 ? (
            <EmptyState
              icon={PhoneIcon}
              title="No calls found"
              description="Try adjusting filters or search terms"
            />
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Date</TableHead>
                  <TableHead>Caller</TableHead>
                  <TableHead>Duration</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Cost</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredCalls.map((call) => (
                  <TableRow
                    key={call.id}
                    className="cursor-pointer transition-colors hover:bg-muted/40"
                  >
                    <TableCell className="text-muted-foreground">
                      <Link href={`/dashboard/calls/${call.id}`} className="block">
                        {formatDate(call.startedAt)}
                      </Link>
                    </TableCell>
                    <TableCell>
                      <Link href={`/dashboard/calls/${call.id}`} className="block">
                        {call.callerNumber ?? 'Unknown'}
                      </Link>
                    </TableCell>
                    <TableCell>
                      <Link href={`/dashboard/calls/${call.id}`} className="block">
                        {formatDuration(call.durationSeconds)}
                      </Link>
                    </TableCell>
                    <TableCell>
                      <Link href={`/dashboard/calls/${call.id}`} className="block">
                        <Badge
                          variant="secondary"
                          className={statusColors[call.status] ?? ''}
                        >
                          {formatStatusLabel(call.status)}
                        </Badge>
                      </Link>
                    </TableCell>
                    <TableCell className="text-muted-foreground">
                      <Link href={`/dashboard/calls/${call.id}`} className="block">
                        {formatMoney(call.costEstimate)}
                      </Link>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
