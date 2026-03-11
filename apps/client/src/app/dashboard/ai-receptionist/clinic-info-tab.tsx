'use client';

import { useEffect, useMemo, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Field, FieldGroup, FieldLabel } from '@/components/ui/field';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import { Skeleton } from '@/components/ui/skeleton';
import { Loader2Icon } from 'lucide-react';

type StaffEntry = {
  id: string;
  name: string;
  role: string;
  phone: string;
  status: string;
  notes: string;
};

const emptyStaffEntry = (): StaffEntry => ({
  id: crypto.randomUUID(),
  name: '',
  role: '',
  phone: '',
  status: 'Available',
  notes: '',
});

const STATUS_OPTIONS = [
  'Available',
  'On-call',
  'Busy',
  'With patient',
  'On break',
  'Off today',
  'Out of office',
  'Vacation',
];

const parseStaffDirectory = (value: string): StaffEntry[] => {
  if (!value.trim()) return [];
  return value
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => {
      const [left, ...rest] = line.split('|').map((part) => part.trim());
      const [namePart, rolePart] = left.split('—').map((part) => part.trim());
      const entry: StaffEntry = {
        id: crypto.randomUUID(),
        name: namePart ?? '',
        role: rolePart ?? '',
        phone: '',
        status: '',
        notes: '',
      };
      rest.forEach((segment) => {
        const lower = segment.toLowerCase();
        if (lower.startsWith('phone:')) entry.phone = segment.slice(6).trim();
        else if (lower.startsWith('status:')) entry.status = segment.slice(7).trim();
        else if (lower.startsWith('notes:')) entry.notes = segment.slice(6).trim();
      });
      return entry;
    });
};

const serializeStaffDirectory = (entries: StaffEntry[]): string => {
  return entries
    .filter((entry) => entry.name.trim() || entry.role.trim())
    .map((entry) => {
      const parts = [];
      const name = entry.name.trim() || 'Staff';
      const role = entry.role.trim();
      parts.push(role ? `${name} — ${role}` : name);
      if (entry.phone.trim()) parts.push(`Phone: ${entry.phone.trim()}`);
      if (entry.status.trim()) parts.push(`Status: ${entry.status.trim()}`);
      if (entry.notes.trim()) parts.push(`Notes: ${entry.notes.trim()}`);
      return parts.join(' | ');
    })
    .join('\n');
};

export function ClinicInfoTab(props: {
  loading: boolean;
  staffDirectory: string;
  setStaffDirectory: (value: string) => void;
  clinicNotes: string;
  setClinicNotes: (value: string) => void;
  onSave: (staffDirectoryOverride?: string) => Promise<void>;
  saving: boolean;
}) {
  const {
    loading,
    staffDirectory,
    setStaffDirectory,
    clinicNotes,
    setClinicNotes,
    onSave,
    saving,
  } = props;

  const [staffEntries, setStaffEntries] = useState<StaffEntry[]>([]);

  useEffect(() => {
    setStaffEntries(parseStaffDirectory(staffDirectory));
  }, [staffDirectory]);

  const hasEntries = useMemo(() => staffEntries.length > 0, [staffEntries.length]);

  return (
    <Card>
      <CardHeader>
        <CardTitle>Clinic Info</CardTitle>
        <CardDescription>
          Add staff details and internal notes that the AI receptionist can use during calls.
        </CardDescription>
      </CardHeader>
      <CardContent>
        {loading ? (
          <div className="space-y-4">
            {Array.from({ length: 4 }).map((_, index) => (
              <Skeleton key={index} className="h-10 w-full" />
            ))}
          </div>
        ) : (
          <FieldGroup>
            <Field>
              <FieldLabel>Staff Directory</FieldLabel>
              <div className="space-y-3">
                {staffEntries.map((entry, index) => (
                  <div key={entry.id} className="rounded-lg border bg-muted/20 p-3">
                    <div className="grid gap-3 md:grid-cols-2">
                      <Field>
                        <FieldLabel>Name</FieldLabel>
                        <Input
                          value={entry.name}
                          onChange={(event) => {
                            const value = event.target.value;
                            setStaffEntries((prev) => prev.map((row, idx) => (idx === index ? { ...row, name: value } : row)));
                          }}
                          placeholder="Dr. Amanuel Tadesse"
                        />
                      </Field>
                      <Field>
                        <FieldLabel>Role</FieldLabel>
                        <Input
                          value={entry.role}
                          onChange={(event) => {
                            const value = event.target.value;
                            setStaffEntries((prev) => prev.map((row, idx) => (idx === index ? { ...row, role: value } : row)));
                          }}
                          placeholder="Orthodontist / Front Desk"
                        />
                      </Field>
                      <Field>
                        <FieldLabel>Phone</FieldLabel>
                        <Input
                          value={entry.phone}
                          onChange={(event) => {
                            const value = event.target.value;
                            setStaffEntries((prev) => prev.map((row, idx) => (idx === index ? { ...row, phone: value } : row)));
                          }}
                          placeholder="+1 555-123-4567"
                        />
                      </Field>
                      <Field>
                        <FieldLabel>Status</FieldLabel>
                        <Select
                          value={entry.status || 'Available'}
                          onValueChange={(value) => {
                            setStaffEntries((prev) => prev.map((row, idx) => (idx === index ? { ...row, status: value } : row)));
                          }}
                        >
                          <SelectTrigger>
                            <SelectValue placeholder="Select status" />
                          </SelectTrigger>
                          <SelectContent>
                            {STATUS_OPTIONS.map((status) => (
                              <SelectItem key={status} value={status}>{status}</SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </Field>
                    </div>
                    <Field className="mt-3">
                      <FieldLabel>Notes</FieldLabel>
                      <Textarea
                        rows={2}
                        value={entry.notes}
                        onChange={(event) => {
                          const value = event.target.value;
                          setStaffEntries((prev) => prev.map((row, idx) => (idx === index ? { ...row, notes: value } : row)));
                        }}
                        placeholder="Speaks Amharic, prefers morning calls, etc."
                      />
                    </Field>
                    <div className="mt-3 flex justify-end">
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        onClick={() => setStaffEntries((prev) => prev.filter((_, idx) => idx !== index))}
                      >
                        Remove
                      </Button>
                    </div>
                  </div>
                ))}
                {!hasEntries && (
                  <div className="rounded-lg border border-dashed bg-muted/20 p-4 text-sm text-muted-foreground">
                    No staff added yet. Click "Add staff member" to begin.
                  </div>
                )}
                <Button type="button" variant="outline" onClick={() => setStaffEntries((prev) => [...prev, emptyStaffEntry()])}>
                  Add staff member
                </Button>
              </div>
            </Field>

            <Field>
              <FieldLabel>Clinic Notes</FieldLabel>
              <Textarea
                rows={5}
                value={clinicNotes}
                onChange={(event) => setClinicNotes(event.target.value)}
                placeholder="Anything the receptionist should know (languages spoken, parking tips, payment policies, etc.)"
              />
            </Field>

            <Button
              onClick={async () => {
                const serialized = serializeStaffDirectory(staffEntries);
                setStaffDirectory(serialized);
                await onSave(serialized);
              }}
              disabled={saving}
            >
              {saving ? (
                <>
                  <Loader2Icon className="mr-2 size-4 animate-spin" />
                  Saving...
                </>
              ) : (
                'Save clinic info'
              )}
            </Button>
          </FieldGroup>
        )}
      </CardContent>
    </Card>
  );
}
