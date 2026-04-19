'use client';

import { useEffect, useMemo, useState } from 'react';
import { toast } from 'sonner';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Checkbox } from '@/components/ui/checkbox';
import { Skeleton } from '@/components/ui/skeleton';
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
import { PlusIcon, Trash2Icon } from 'lucide-react';

function newStaffRow(): StaffMember {
  return {
    id: typeof crypto !== 'undefined' ? crypto.randomUUID() : `staff-${Date.now()}`,
    name: '',
    role: '',
    acceptsAppointments: true,
  };
}

export default function StaffPage() {
  const { data: clinic, isLoading } = useGetClinicQuery();
  const [updateClinic, { isLoading: isSaving }] = useUpdateClinicMutation();
  const [rows, setRows] = useState<StaffMember[]>([]);

  const staffKey = useMemo(
    () => JSON.stringify(clinic?.staffMembers ?? []),
    [clinic?.staffMembers],
  );

  useEffect(() => {
    if (!clinic) return;
    const list = clinic.staffMembers ?? [];
    setRows(
      list.map((m) => ({
        id: m.id ?? crypto.randomUUID(),
        name: m.name,
        role: m.role ?? '',
        acceptsAppointments: m.acceptsAppointments !== false,
      })),
    );
  }, [clinic, staffKey]);

  const handleAdd = () => {
    setRows((prev) => [...prev, newStaffRow()]);
  };

  const handleRemove = (index: number) => {
    setRows((prev) => prev.filter((_, i) => i !== index));
  };

  const updateRow = (index: number, patch: Partial<StaffMember>) => {
    setRows((prev) =>
      prev.map((row, i) => (i === index ? { ...row, ...patch } : row)),
    );
  };

  const handleSave = async () => {
    const trimmed = rows
      .map((row) => ({
        id: row.id,
        name: row.name.trim(),
        role: row.role.trim(),
        acceptsAppointments: row.acceptsAppointments !== false,
      }))
      .filter((row) => row.name.length > 0);

    const invalid = rows.some((row) => row.name.trim() === '' && row.role.trim() !== '');
    if (invalid) {
      toast.error('Remove empty rows or enter a name for each staff member.');
      return;
    }

    try {
      await updateClinic({ staffMembers: trimmed }).unwrap();
      toast.success('Staff saved');
    } catch {
      toast.error('Failed to save staff');
    }
  };

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Staff</h1>
        <p className="text-muted-foreground mt-1 text-sm">
          Doctors and team members the AI receptionist can name when patients ask for a specific
          provider. Only people marked for appointments are offered when booking.
        </p>
      </div>

      <Card>
        <CardHeader className="flex flex-row flex-wrap items-start justify-between gap-4">
          <div>
            <CardTitle>Team</CardTitle>
            <CardDescription>
              Add providers so callers can request them by name; the assistant uses this list for
              scheduling.
            </CardDescription>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button type="button" variant="outline" size="sm" onClick={handleAdd}>
              <PlusIcon className="size-4" />
              Add staff
            </Button>
            <Button type="button" size="sm" onClick={handleSave} disabled={isSaving || isLoading}>
              {isSaving ? 'Saving…' : 'Save'}
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
                  <TableHead className="w-[28%]">Name</TableHead>
                  <TableHead className="w-[28%]">Role</TableHead>
                  <TableHead className="w-[32%]">Bookable</TableHead>
                  <TableHead className="w-[12%] text-right"> </TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {rows.map((row, index) => (
                  <TableRow key={row.id ?? index}>
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
                      <label className="flex cursor-pointer items-center gap-2 text-sm">
                        <Checkbox
                          checked={row.acceptsAppointments !== false}
                          onCheckedChange={(checked) =>
                            updateRow(index, {
                              acceptsAppointments: checked === true,
                            })
                          }
                        />
                        <span className="text-muted-foreground">
                          Accepts new appointments (AI can schedule with this provider)
                        </span>
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
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
