'use client';

import { useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
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
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from '@/components/ui/sheet';
import { Badge } from '@/components/ui/badge';
import { EmptyState } from '@/components/empty-state';
import { useGetPatientsQuery, useUpsertPatientMutation, type PatientProfile } from '@/features/patients/patientsApi';
import { UsersIcon } from 'lucide-react';
import { toast } from 'sonner';
import { formatDate, formatDateTime } from './patient-utils';

const blankPatient: PatientProfile = {
  id: 'new',
  tenantId: '',
  fullName: '',
  dateOfBirth: '',
  phoneNumber: '',
  lastVisitAt: null,
  notes: '',
  createdAt: '',
  updatedAt: '',
};

export default function PatientsPage() {
  const router = useRouter();
  const [search, setSearch] = useState('');
  const [editingPatient, setEditingPatient] = useState<PatientProfile | null>(null);
  const { data, isLoading, refetch } = useGetPatientsQuery(search ? { search } : undefined);
  const [upsertPatient, { isLoading: isSaving }] = useUpsertPatientMutation();

  const patients = data?.data ?? [];

  const selectedPatient = editingPatient ?? blankPatient;

  const filteredPatients = useMemo(() => {
    if (!search) return patients;
    const needle = search.toLowerCase();
    return patients.filter((patient) => (
      patient.fullName.toLowerCase().includes(needle)
      || patient.phoneNumber.toLowerCase().includes(needle)
    ));
  }, [patients, search]);

  const handleSave = async () => {
    try {
      await upsertPatient({
        fullName: selectedPatient.fullName,
        phoneNumber: selectedPatient.phoneNumber,
        dateOfBirth: selectedPatient.dateOfBirth || null,
        notes: selectedPatient.notes || null,
        lastVisitAt: selectedPatient.lastVisitAt || null,
      }).unwrap();
      toast.success('Patient profile saved.');
      setEditingPatient(null);
      refetch();
    } catch (error) {
      toast.error('Failed to save patient profile.');
    }
  };

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h2 className="text-lg font-semibold">Patient profiles</h2>
          <p className="text-sm text-muted-foreground">
            Returning patients are recognized by phone number and date of birth.
          </p>
        </div>
        <Button onClick={() => setEditingPatient({ ...blankPatient })}>
          Add patient
        </Button>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Directory</CardTitle>
          <CardDescription>Search or update stored patient profiles.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
            <Input
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="Search by name or phone"
              className="sm:max-w-xs"
            />
            <Button variant="outline" onClick={() => refetch()} disabled={isLoading}>
              Refresh
            </Button>
          </div>

          {isLoading ? (
            <p className="text-sm text-muted-foreground">Loading patients...</p>
          ) : filteredPatients.length === 0 ? (
            <EmptyState
              icon={UsersIcon}
              title="No patients yet"
              description="Profiles appear after the receptionist books appointments."
            />
          ) : (
            <div className="rounded-md border">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Patient</TableHead>
                    <TableHead>Phone</TableHead>
                    <TableHead>DOB</TableHead>
                    <TableHead>Last visit</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead className="text-right">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filteredPatients.map((patient) => (
                    <TableRow
                      key={patient.id}
                      className="cursor-pointer transition-colors hover:bg-muted/40"
                      onClick={() => router.push(`/dashboard/patients/${patient.id}`)}
                    >
                      <TableCell>
                        <div className="font-medium">{patient.fullName}</div>
                        <div className="text-xs text-muted-foreground">{patient.notes || 'No notes'}</div>
                      </TableCell>
                      <TableCell>{patient.phoneNumber}</TableCell>
                      <TableCell>{formatDate(patient.dateOfBirth)}</TableCell>
                      <TableCell>{formatDateTime(patient.lastVisitAt)}</TableCell>
                      <TableCell>
                        <Badge variant="outline">Active</Badge>
                      </TableCell>
                      <TableCell className="text-right">
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={(event) => {
                            event.stopPropagation();
                            setEditingPatient(patient);
                          }}
                        >
                          Edit
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>

      <Sheet open={Boolean(editingPatient)} onOpenChange={(open) => !open && setEditingPatient(null)}>
        <SheetContent>
          <SheetHeader>
            <SheetTitle>{editingPatient?.id === 'new' ? 'Add patient' : 'Edit patient'}</SheetTitle>
            <SheetDescription>Update stored patient details for faster bookings.</SheetDescription>
          </SheetHeader>
          <div className="mt-6 space-y-4">
            <div className="space-y-2">
              <label className="text-sm font-medium">Full name</label>
              <Input
                value={selectedPatient.fullName}
                onChange={(event) => setEditingPatient({ ...selectedPatient, fullName: event.target.value })}
                placeholder="Patient name"
              />
            </div>
            <div className="space-y-2">
              <label className="text-sm font-medium">Phone number</label>
              <Input
                value={selectedPatient.phoneNumber}
                onChange={(event) => setEditingPatient({ ...selectedPatient, phoneNumber: event.target.value })}
                placeholder="Phone number"
              />
            </div>
            <div className="space-y-2">
              <label className="text-sm font-medium">Date of birth</label>
              <Input
                value={selectedPatient.dateOfBirth ?? ''}
                onChange={(event) => setEditingPatient({ ...selectedPatient, dateOfBirth: event.target.value })}
                placeholder="YYYY-MM-DD"
              />
            </div>
            <div className="space-y-2">
              <label className="text-sm font-medium">Last visit</label>
              <Input
                value={selectedPatient.lastVisitAt ?? ''}
                onChange={(event) => setEditingPatient({ ...selectedPatient, lastVisitAt: event.target.value })}
                placeholder="YYYY-MM-DD or ISO timestamp"
              />
            </div>
            <div className="space-y-2">
              <label className="text-sm font-medium">Notes</label>
              <Input
                value={selectedPatient.notes ?? ''}
                onChange={(event) => setEditingPatient({ ...selectedPatient, notes: event.target.value })}
                placeholder="Notes, preferences, insurance"
              />
            </div>
          </div>
          <div className="mt-6 flex gap-2">
            <Button onClick={handleSave} disabled={isSaving}>
              {isSaving ? 'Saving...' : 'Save profile'}
            </Button>
            <Button variant="outline" onClick={() => setEditingPatient(null)}>
              Cancel
            </Button>
          </div>
        </SheetContent>
      </Sheet>
    </div>
  );
}
