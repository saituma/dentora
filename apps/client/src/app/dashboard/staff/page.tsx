'use client';

import { useEffect, useMemo, useState } from 'react';
import { PageHeader } from '@/components/page-header';
import { toast } from 'sonner';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Checkbox } from '@/components/ui/checkbox';
import { Skeleton } from '@/components/ui/skeleton';
import { Badge } from '@/components/ui/badge';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { useGetClinicQuery, useUpdateClinicMutation } from '@/features/clinic/clinicApi';
import type { StaffMember } from '@/features/clinic/types';
import { PlusIcon, Trash2Icon, ChevronDownIcon, ChevronUpIcon } from 'lucide-react';

const DAYS = [
  { key: 'monday', label: 'Mon' },
  { key: 'tuesday', label: 'Tue' },
  { key: 'wednesday', label: 'Wed' },
  { key: 'thursday', label: 'Thu' },
  { key: 'friday', label: 'Fri' },
  { key: 'saturday', label: 'Sat' },
  { key: 'sunday', label: 'Sun' },
];

function newStaffRow(): StaffMember {
  return {
    id: typeof crypto !== 'undefined' ? crypto.randomUUID() : `staff-${Date.now()}`,
    name: '',
    role: '',
    phone: '',
    acceptsAppointments: true,
    workingDays: ['monday', 'tuesday', 'wednesday', 'thursday', 'friday'],
  };
}

function formatWorkingDays(days?: string[]): string {
  if (!days || days.length === 0) return '';
  if (days.length === 7) return 'Every day';
  const weekdays = ['monday', 'tuesday', 'wednesday', 'thursday', 'friday'];
  if (days.length === 5 && weekdays.every((d) => days.includes(d))) return 'Mon – Fri';
  return days.map((d) => DAYS.find((x) => x.key === d)?.label ?? d).join(', ');
}

export default function StaffPage() {
  const { data: clinic, isLoading } = useGetClinicQuery();
  const [updateClinic] = useUpdateClinicMutation();
  const [rows, setRows] = useState<StaffMember[]>([]);
  const [expandedId, setExpandedId] = useState<string | null>(null);

  const staffKey = useMemo(
    () => JSON.stringify(clinic?.staffMembers ?? []),
    [clinic?.staffMembers],
  );

  useEffect(() => {
    if (!clinic) return;
    const list = clinic.staffMembers ?? [];
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setRows(
      list.map((m) => ({
        id: m.id ?? crypto.randomUUID(),
        name: m.name,
        role: m.role ?? '',
        phone: m.phone ?? '',
        acceptsAppointments: m.acceptsAppointments !== false,
        workingDays: Array.isArray(m.workingDays) ? m.workingDays : undefined,
      })),
    );
  }, [clinic, staffKey]);

  const handleAdd = () => {
    const newRow = newStaffRow();
    setRows((prev) => [...prev, newRow]);
    setExpandedId(newRow.id ?? null);
  };

  const handleRemove = (index: number) => {
    setRows((prev) => prev.filter((_, i) => i !== index));
  };

  const updateRow = (index: number, patch: Partial<StaffMember>) => {
    setRows((prev) => prev.map((row, i) => (i === index ? { ...row, ...patch } : row)));
  };

  const toggleDay = (index: number, day: string) => {
    const current = rows[index].workingDays ?? [];
    const next = current.includes(day) ? current.filter((d) => d !== day) : [...current, day];
    updateRow(index, { workingDays: next });
  };

  const handleSave = () => {
    const trimmed = rows
      .map((row) => ({
        id: row.id,
        name: row.name.trim(),
        role: row.role.trim(),
        phone: row.phone?.trim() || undefined,
        acceptsAppointments: row.acceptsAppointments !== false,
        workingDays: row.workingDays && row.workingDays.length > 0 ? row.workingDays : undefined,
      }))
      .filter((row) => row.name.length > 0);

    const invalid = rows.some((row) => row.name.trim() === '' && row.role.trim() !== '');
    if (invalid) {
      toast.error('Remove empty rows or enter a name for each staff member.');
      return;
    }

    toast.promise(updateClinic({ staffMembers: trimmed }).unwrap(), {
      loading: 'Saving…',
      success: 'Staff saved',
      error: 'Failed to save staff',
    });
  };

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title="Staff"
        subtitle="Team members the AI receptionist can name and route calls to."
      />

      <Card>
        <CardHeader className="flex flex-row flex-wrap items-start justify-between gap-4">
          <div>
            <CardTitle>Team</CardTitle>
            <CardDescription>
              Add providers so callers can request them by name. Expand a row to set which days they
              work.
            </CardDescription>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button type="button" variant="outline" size="sm" onClick={handleAdd}>
              <PlusIcon className="size-4" />
              Add staff
            </Button>
            <Button type="button" size="sm" onClick={handleSave} disabled={isLoading}>
              Save
            </Button>
          </div>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="space-y-2">
              <Skeleton className="h-10 w-full" />
              <Skeleton className="h-10 w-full" />
            </div>
          ) : rows.length === 0 ? (
            <div className="text-muted-foreground rounded-lg border border-dashed py-12 text-center text-sm">
              No staff yet. Click &quot;Add staff&quot; to list doctors and team members.
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-[22%]">Name</TableHead>
                  <TableHead className="w-[18%]">Role</TableHead>
                  <TableHead className="w-[18%]">Phone</TableHead>
                  <TableHead className="w-[20%]">Working days</TableHead>
                  <TableHead className="w-[14%]">Bookable</TableHead>
                  <TableHead className="w-[8%] text-right"> </TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {rows.map((row, index) => {
                  const isExpanded = expandedId === (row.id ?? String(index));
                  const rowKey = row.id ?? index;
                  return (
                    <>
                      <TableRow key={`row-${rowKey}`}>
                        <TableCell>
                          <Input
                            placeholder="e.g. Dr. Jane Smith"
                            value={row.name}
                            onChange={(e) => updateRow(index, { name: e.target.value })}
                            aria-label="Staff name"
                          />
                        </TableCell>
                        <TableCell>
                          <Input
                            placeholder="e.g. Dentist, Hygienist"
                            value={row.role}
                            onChange={(e) => updateRow(index, { role: e.target.value })}
                            aria-label="Role"
                          />
                        </TableCell>
                        <TableCell>
                          <Input
                            placeholder="+44 7700 900000"
                            value={row.phone ?? ''}
                            onChange={(e) => updateRow(index, { phone: e.target.value })}
                            aria-label="Phone"
                          />
                        </TableCell>
                        <TableCell>
                          <button
                            type="button"
                            className="flex items-center gap-1.5 text-sm"
                            onClick={() =>
                              setExpandedId(isExpanded ? null : (row.id ?? String(index)))
                            }
                          >
                            <span className="text-muted-foreground">
                              {row.workingDays && row.workingDays.length > 0
                                ? formatWorkingDays(row.workingDays)
                                : 'Set days'}
                            </span>
                            {isExpanded ? (
                              <ChevronUpIcon className="text-muted-foreground size-3.5" />
                            ) : (
                              <ChevronDownIcon className="text-muted-foreground size-3.5" />
                            )}
                          </button>
                        </TableCell>
                        <TableCell>
                          <label className="flex cursor-pointer items-center gap-2 text-sm">
                            <Checkbox
                              checked={row.acceptsAppointments !== false}
                              onCheckedChange={(checked) =>
                                updateRow(index, { acceptsAppointments: checked === true })
                              }
                            />
                            <span className="text-muted-foreground">Bookable</span>
                          </label>
                        </TableCell>
                        <TableCell className="text-right">
                          <Button
                            type="button"
                            variant="ghost"
                            size="icon"
                            className="text-muted-foreground hover:text-destructive"
                            onClick={() => handleRemove(index)}
                            aria-label={`Remove ${row.name || 'staff member'}`}
                          >
                            <Trash2Icon className="size-4" />
                          </Button>
                        </TableCell>
                      </TableRow>

                      {isExpanded && (
                        <TableRow key={`days-${rowKey}`} className="bg-muted/30 hover:bg-muted/30">
                          <TableCell colSpan={6} className="py-3">
                            <div className="flex flex-col gap-2 px-1">
                              <p className="text-muted-foreground text-xs font-medium uppercase tracking-wide">
                                Working days
                              </p>
                              <div className="flex flex-wrap gap-2">
                                {DAYS.map((day) => {
                                  const active = (row.workingDays ?? []).includes(day.key);
                                  return (
                                    <button
                                      key={day.key}
                                      type="button"
                                      onClick={() => toggleDay(index, day.key)}
                                      className="focus:outline-none"
                                    >
                                      <Badge
                                        variant={active ? 'default' : 'outline'}
                                        className="cursor-pointer select-none px-3 py-1 text-xs"
                                      >
                                        {day.label}
                                      </Badge>
                                    </button>
                                  );
                                })}
                              </div>
                              <p className="text-muted-foreground mt-1 text-xs">
                                The AI will use these days when patients ask who is available on a
                                specific day.
                              </p>
                            </div>
                          </TableCell>
                        </TableRow>
                      )}
                    </>
                  );
                })}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
