'use client';

import {
  AlertTriangleIcon,
  CheckCircle2Icon,
  Clock3Icon,
  EyeIcon,
  XCircleIcon,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { PageHeader } from '@/components/page-header';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import {
  staffReviewSeverities,
  staffReviewSources,
  staffReviewStatuses,
  staffReviewTypes,
  type StaffReviewDailyDigest,
  type StaffReviewFilters,
  type StaffReviewItem,
  type StaffReviewSeverity,
  type StaffReviewSource,
  type StaffReviewStatus,
  type StaffReviewType,
} from '@/features/staffReview/staffReviewApi';
import { cn } from '@/lib/utils';

type FilterKey = 'status' | 'severity' | 'type' | 'source';
type FilterValue = StaffReviewStatus | StaffReviewSeverity | StaffReviewType | StaffReviewSource;

interface StaffReviewConsoleProps {
  filters: StaffReviewFilters;
  items: StaffReviewItem[];
  alerts: StaffReviewItem[];
  digest: StaffReviewDailyDigest | null;
  isLoading: boolean;
  isUpdating: boolean;
  errorMessage: string | null;
  onFilterChange: (key: FilterKey, value: FilterValue | undefined) => void;
  onClearFilters: () => void;
  onStatusChange: (id: string, status: StaffReviewStatus) => void;
  onRefresh: () => void;
}

const titleCase = (value: string): string =>
  value
    .split('_')
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(' ');

const formatDateTime = (value: string | null): string => {
  if (!value) return 'Not set';
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? 'Unknown' : date.toLocaleString('en-GB');
};

function severityVariant(severity: StaffReviewSeverity): 'default' | 'error' | 'warning' | 'info' {
  if (severity === 'critical') return 'error';
  if (severity === 'high') return 'warning';
  if (severity === 'medium') return 'info';
  return 'default';
}

function SelectFilter<T extends string>({
  label,
  value,
  options,
  onChange,
}: {
  label: string;
  value?: T;
  options: readonly T[];
  onChange: (value: T | undefined) => void;
}) {
  return (
    <label className="grid min-w-40 gap-1 text-xs font-medium text-muted-foreground">
      {label}
      <select
        className="h-9 rounded-lg border border-input bg-background px-3 text-sm text-foreground"
        value={value ?? ''}
        onChange={(event) => onChange(event.target.value ? (event.target.value as T) : undefined)}
      >
        <option value="">All</option>
        {options.map((option) => (
          <option key={option} value={option}>
            {titleCase(option)}
          </option>
        ))}
      </select>
    </label>
  );
}

function SummaryTile({
  label,
  value,
  intent = 'default',
}: {
  label: string;
  value: number;
  intent?: 'default' | 'warning' | 'danger';
}) {
  return (
    <div
      className={cn(
        'rounded-lg border bg-card p-4',
        intent === 'warning' && 'border-warning/30 bg-warning/5',
        intent === 'danger' && 'border-destructive/30 bg-destructive/5',
      )}
    >
      <div className="text-2xl font-semibold tabular-nums">{value}</div>
      <div className="mt-1 text-xs text-muted-foreground">{label}</div>
    </div>
  );
}

function ReviewItemTable({
  items,
  isUpdating,
  onStatusChange,
}: {
  items: StaffReviewItem[];
  isUpdating: boolean;
  onStatusChange: (id: string, status: StaffReviewStatus) => void;
}) {
  if (items.length === 0) {
    return (
      <div className="rounded-lg border border-dashed py-12 text-center text-sm text-muted-foreground">
        No review items match the current filters.
      </div>
    );
  }

  return (
    <div className="overflow-x-auto rounded-lg border">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Item</TableHead>
            <TableHead>Severity</TableHead>
            <TableHead>Status</TableHead>
            <TableHead>Source</TableHead>
            <TableHead>Related refs</TableHead>
            <TableHead>SLA</TableHead>
            <TableHead className="text-right">Actions</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {items.map((item) => (
            <TableRow key={item.id} className={item.overdue ? 'bg-destructive/5' : undefined}>
              <TableCell className="min-w-80 align-top">
                <div className="font-medium">{titleCase(item.type)}</div>
                <div className="mt-1 text-sm text-muted-foreground">{item.message}</div>
                <div className="mt-2 flex flex-wrap gap-1 text-xs text-muted-foreground">
                  <span>{item.id}</span>
                  <span aria-hidden="true">·</span>
                  <span>{item.reasonCode}</span>
                </div>
              </TableCell>
              <TableCell className="align-top">
                <Badge variant={severityVariant(item.severity)}>{titleCase(item.severity)}</Badge>
              </TableCell>
              <TableCell className="align-top">
                <Badge variant={item.status === 'resolved' ? 'success' : 'outline'}>
                  {titleCase(item.status)}
                </Badge>
              </TableCell>
              <TableCell className="align-top">{titleCase(item.source)}</TableCell>
              <TableCell className="min-w-56 align-top text-xs text-muted-foreground">
                <div>Appointment: {item.relatedAppointmentId ?? 'None'}</div>
                <div>Call: {item.relatedCallSessionId ?? 'None'}</div>
                <div>External: {item.relatedExternalEventRef ?? 'None'}</div>
              </TableCell>
              <TableCell className="min-w-44 align-top text-sm">
                <div>{formatDateTime(item.slaDueAt)}</div>
                {item.overdue ? (
                  <Badge className="mt-2" variant="error">
                    Overdue
                  </Badge>
                ) : null}
                <div className="mt-2 text-xs text-muted-foreground">
                  Created {formatDateTime(item.createdAt)}
                </div>
              </TableCell>
              <TableCell className="align-top">
                <div className="flex justify-end gap-2">
                  {item.status === 'open' ? (
                    <Button
                      aria-label={`Mark ${item.id} in review`}
                      disabled={isUpdating}
                      onClick={() => onStatusChange(item.id, 'in_review')}
                      size="xs"
                      variant="outline"
                    >
                      <EyeIcon className="size-3.5" />
                      Review
                    </Button>
                  ) : null}
                  {item.status !== 'resolved' ? (
                    <Button
                      aria-label={`Resolve ${item.id}`}
                      disabled={isUpdating}
                      onClick={() => onStatusChange(item.id, 'resolved')}
                      size="xs"
                    >
                      <CheckCircle2Icon className="size-3.5" />
                      Resolve
                    </Button>
                  ) : null}
                  {item.status !== 'ignored' && item.status !== 'resolved' ? (
                    <Button
                      aria-label={`Ignore ${item.id}`}
                      disabled={isUpdating}
                      onClick={() => onStatusChange(item.id, 'ignored')}
                      size="xs"
                      variant="outline"
                    >
                      <XCircleIcon className="size-3.5" />
                      Ignore
                    </Button>
                  ) : null}
                </div>
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}

export function StaffReviewConsole({
  filters,
  items,
  alerts,
  digest,
  isLoading,
  isUpdating,
  errorMessage,
  onFilterChange,
  onClearFilters,
  onStatusChange,
  onRefresh,
}: StaffReviewConsoleProps) {
  const totalUnresolved = digest?.totalUnresolved ?? 0;
  const overdueCount = digest?.overdueCount ?? 0;
  const highCriticalOpenCount = digest?.highCriticalOpenCount ?? alerts.length;

  return (
    <div className="space-y-6">
      <PageHeader
        title="Staff Review"
        subtitle="Triage safety, reconciliation, and appointment-change requests for staff-supervised AI receptionist operations."
        actions={
          <Button onClick={onRefresh} size="sm" variant="outline">
            Refresh
          </Button>
        }
      />

      {errorMessage ? (
        <div className="rounded-lg border border-destructive/30 bg-destructive/5 p-3 text-sm text-destructive-foreground">
          {errorMessage}
        </div>
      ) : null}

      <div className="grid gap-3 md:grid-cols-3">
        <SummaryTile
          intent={highCriticalOpenCount > 0 ? 'danger' : 'default'}
          label="High/Critical Open"
          value={highCriticalOpenCount}
        />
        <SummaryTile
          intent={overdueCount > 0 ? 'warning' : 'default'}
          label="Overdue Unresolved"
          value={overdueCount}
        />
        <SummaryTile label="Total Unresolved" value={totalUnresolved} />
      </div>

      {alerts.length > 0 ? (
        <Card className="border-destructive/30">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <AlertTriangleIcon className="size-4 text-destructive" />
              High-priority review needed
            </CardTitle>
            <CardDescription>
              High and critical open items that need clinic staff attention.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <ReviewItemTable
              isUpdating={isUpdating}
              items={alerts}
              onStatusChange={onStatusChange}
            />
          </CardContent>
        </Card>
      ) : null}

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <Clock3Icon className="size-4" />
            Daily digest
          </CardTitle>
          <CardDescription>
            Counts are safe operational totals only. Review item details stay limited to approved
            fields.
          </CardDescription>
        </CardHeader>
        <CardContent className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {staffReviewSeverities.map((severity) => (
            <SummaryTile
              intent={
                severity === 'critical' && (digest?.countsBySeverity.critical ?? 0) > 0
                  ? 'danger'
                  : 'default'
              }
              key={severity}
              label={`${titleCase(severity)} severity`}
              value={digest?.countsBySeverity[severity] ?? 0}
            />
          ))}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div>
              <CardTitle>Review queue</CardTitle>
              <CardDescription>
                Filter, triage, and close staff review items during the supervised pilot.
              </CardDescription>
            </div>
            <Button onClick={onClearFilters} size="sm" variant="outline">
              Clear filters
            </Button>
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex flex-wrap gap-3">
            <SelectFilter
              label="Status"
              onChange={(value) => onFilterChange('status', value)}
              options={staffReviewStatuses}
              value={filters.status}
            />
            <SelectFilter
              label="Severity"
              onChange={(value) => onFilterChange('severity', value)}
              options={staffReviewSeverities}
              value={filters.severity}
            />
            <SelectFilter
              label="Type"
              onChange={(value) => onFilterChange('type', value)}
              options={staffReviewTypes}
              value={filters.type}
            />
            <SelectFilter
              label="Source"
              onChange={(value) => onFilterChange('source', value)}
              options={staffReviewSources}
              value={filters.source}
            />
          </div>

          {isLoading ? (
            <div className="rounded-lg border border-dashed py-12 text-center text-sm text-muted-foreground">
              Loading review items...
            </div>
          ) : (
            <ReviewItemTable
              isUpdating={isUpdating}
              items={items}
              onStatusChange={onStatusChange}
            />
          )}
        </CardContent>
      </Card>
    </div>
  );
}
