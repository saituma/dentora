'use client';

import { useMemo, useRef, useState } from 'react';
import { PageHeader } from '@/components/page-header';
import { useRouter } from 'next/navigation';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Skeleton } from '@/components/ui/skeleton';
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
import {
  useGetPatientsQuery,
  useUpsertPatientMutation,
  useImportPatientsMutation,
  type PatientProfile,
} from '@/features/patients/patientsApi';
import { UploadIcon, UsersIcon } from 'lucide-react';
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
  const { data, isLoading } = useGetPatientsQuery(search ? { search } : undefined, {
    refetchOnFocus: true,
  });
  const [upsertPatient] = useUpsertPatientMutation();
  const [importPatients, { isLoading: isImporting }] = useImportPatientsMutation();
  const csvInputRef = useRef<HTMLInputElement>(null);

  const handleCsvImport = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;
    event.target.value = '';

    const formData = new FormData();
    formData.append('file', file);

    try {
      const result = await importPatients(formData).unwrap();
      const { imported, skipped, errors } = result.data;
      if (errors.length > 0) {
        toast.warning(
          `Imported ${imported} patients, ${skipped} skipped. First error: row ${errors[0].row} — ${errors[0].message}`,
        );
      } else {
        toast.success(`Successfully imported ${imported} patient${imported === 1 ? '' : 's'}`);
      }
    } catch {
      toast.error('Import failed — check the file format and try again');
    }
  };

  const patients = useMemo(() => data?.data ?? [], [data?.data]);

  const selectedPatient = editingPatient ?? blankPatient;

  const filteredPatients = useMemo(() => {
    if (!search) return patients;
    const needle = search.toLowerCase();
    return patients.filter(
      (patient) =>
        patient.fullName.toLowerCase().includes(needle) ||
        patient.phoneNumber.toLowerCase().includes(needle),
    );
  }, [patients, search]);

  const handleSave = () => {
    toast.promise(
      upsertPatient({
        fullName: selectedPatient.fullName,
        phoneNumber: selectedPatient.phoneNumber,
        dateOfBirth: selectedPatient.dateOfBirth || null,
        notes: selectedPatient.notes || null,
        lastVisitAt: selectedPatient.lastVisitAt || null,
      })
        .unwrap()
        .then(() => {
          setEditingPatient(null);
        }),
      { loading: 'Saving…', success: 'Patient saved', error: 'Failed to save' },
    );
  };

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title="Patients"
        subtitle="Returning patients are recognized by phone number and date of birth."
        actions={
          <div className="flex gap-2">
            <input
              ref={csvInputRef}
              type="file"
              accept=".csv"
              className="hidden"
              onChange={handleCsvImport}
            />
            <Button
              variant="outline"
              onClick={() => csvInputRef.current?.click()}
              disabled={isImporting}
            >
              <UploadIcon className="mr-2 h-4 w-4" />
              {isImporting ? 'Importing…' : 'Import CSV'}
            </Button>
            <Button onClick={() => setEditingPatient({ ...blankPatient })}>Add patient</Button>
          </div>
        }
      />

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
          </div>

          {isLoading ? (
            <div className="overflow-x-auto rounded-md border">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Patient</TableHead>
                    <TableHead>Phone</TableHead>
                    <TableHead className="hidden sm:table-cell">DOB</TableHead>
                    <TableHead className="hidden md:table-cell">Last visit</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead className="text-right">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {Array.from({ length: 8 }).map((_, i) => (
                    <TableRow key={i}>
                      <TableCell>
                        <div className="space-y-1">
                          <Skeleton className="h-4 w-36" />
                          <Skeleton className="h-3 w-24" />
                        </div>
                      </TableCell>
                      <TableCell>
                        <Skeleton className="h-4 w-28" />
                      </TableCell>
                      <TableCell className="hidden sm:table-cell">
                        <Skeleton className="h-4 w-20" />
                      </TableCell>
                      <TableCell className="hidden md:table-cell">
                        <Skeleton className="h-4 w-24" />
                      </TableCell>
                      <TableCell>
                        <Skeleton className="h-5 w-14 rounded-full" />
                      </TableCell>
                      <TableCell className="text-right">
                        <Skeleton className="ml-auto h-8 w-14" />
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          ) : filteredPatients.length === 0 ? (
            <EmptyState
              icon={UsersIcon}
              title="No patients yet"
              description="Profiles appear after the receptionist books appointments."
            />
          ) : (
            <div className="overflow-x-auto rounded-md border">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Patient</TableHead>
                    <TableHead>Phone</TableHead>
                    <TableHead className="hidden sm:table-cell">DOB</TableHead>
                    <TableHead className="hidden md:table-cell">Last visit</TableHead>
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
                        <div className="text-xs text-muted-foreground">
                          {patient.notes || 'No notes'}
                        </div>
                      </TableCell>
                      <TableCell>{patient.phoneNumber}</TableCell>
                      <TableCell className="hidden sm:table-cell">
                        {formatDate(patient.dateOfBirth)}
                      </TableCell>
                      <TableCell className="hidden md:table-cell">
                        {formatDateTime(patient.lastVisitAt)}
                      </TableCell>
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

      <Sheet
        open={Boolean(editingPatient)}
        onOpenChange={(open) => !open && setEditingPatient(null)}
      >
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
                onChange={(event) =>
                  setEditingPatient({ ...selectedPatient, fullName: event.target.value })
                }
                placeholder="Patient name"
              />
            </div>
            <div className="space-y-2">
              <label className="text-sm font-medium">Phone number</label>
              <Input
                value={selectedPatient.phoneNumber}
                onChange={(event) =>
                  setEditingPatient({ ...selectedPatient, phoneNumber: event.target.value })
                }
                placeholder="Phone number"
              />
            </div>
            <div className="space-y-2">
              <label className="text-sm font-medium">Date of birth</label>
              <Input
                value={selectedPatient.dateOfBirth ?? ''}
                onChange={(event) =>
                  setEditingPatient({ ...selectedPatient, dateOfBirth: event.target.value })
                }
                placeholder="YYYY-MM-DD"
              />
            </div>
            <div className="space-y-2">
              <label className="text-sm font-medium">Last visit</label>
              <Input
                value={selectedPatient.lastVisitAt ?? ''}
                onChange={(event) =>
                  setEditingPatient({ ...selectedPatient, lastVisitAt: event.target.value })
                }
                placeholder="YYYY-MM-DD or ISO timestamp"
              />
            </div>
            <div className="space-y-2">
              <label className="text-sm font-medium">Notes</label>
              <Input
                value={selectedPatient.notes ?? ''}
                onChange={(event) =>
                  setEditingPatient({ ...selectedPatient, notes: event.target.value })
                }
                placeholder="Notes, preferences, insurance"
              />
            </div>
          </div>
          <div className="mt-6 flex gap-2">
            <Button onClick={handleSave}>Save profile</Button>
            <Button variant="outline" onClick={() => setEditingPatient(null)}>
              Cancel
            </Button>
          </div>
        </SheetContent>
      </Sheet>
    </div>
  );
}
