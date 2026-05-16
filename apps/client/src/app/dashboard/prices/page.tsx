'use client';

import { useState } from 'react';
import { toast } from 'sonner';
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
  useGetServicesQuery,
  useAddServiceMutation,
  useUpdateServiceMutation,
  useDeleteServiceMutation,
} from '@/features/aiConfig/aiConfigApi';
import type { Service } from '@/features/aiConfig/types';
import { PlusIcon, Trash2Icon, CheckIcon, XIcon, PencilIcon } from 'lucide-react';

interface EditingRow {
  id: string;
  serviceName: string;
  durationMinutes: string;
  price: string;
  description: string;
}

function newDraftRow(): Omit<EditingRow, 'id'> & { id: null } {
  return { id: null, serviceName: '', durationMinutes: '30', price: '', description: '' };
}

export default function PricesPage() {
  const { data, isLoading } = useGetServicesQuery();
  const [addService] = useAddServiceMutation();
  const [updateService] = useUpdateServiceMutation();
  const [deleteService] = useDeleteServiceMutation();

  const [editingId, setEditingId] = useState<string | null>(null);
  const [editRow, setEditRow] = useState<EditingRow | null>(null);
  const [draft, setDraft] = useState<(Omit<EditingRow, 'id'> & { id: null }) | null>(null);

  const services = data?.data ?? [];

  const startEdit = (service: Service) => {
    setDraft(null);
    setEditingId(service.id);
    setEditRow({
      id: service.id,
      serviceName: service.serviceName,
      durationMinutes: String(service.durationMinutes ?? 30),
      price: service.price ?? '',
      description: service.description ?? '',
    });
  };

  const cancelEdit = () => {
    setEditingId(null);
    setEditRow(null);
  };

  const saveEdit = async () => {
    if (!editRow) return;
    const payload = {
      serviceName: editRow.serviceName.trim(),
      durationMinutes: Number(editRow.durationMinutes) || 30,
      price: editRow.price.trim() || undefined,
      description: editRow.description.trim() || undefined,
    };
    if (!payload.serviceName) {
      toast.error('Service name is required');
      return;
    }
    try {
      await updateService({ id: editRow.id, data: payload }).unwrap();
      toast.success('Service updated');
      setEditingId(null);
      setEditRow(null);
    } catch {
      toast.error('Failed to update service');
    }
  };

  const saveDraft = async () => {
    if (!draft) return;
    const payload = {
      serviceName: draft.serviceName.trim(),
      durationMinutes: Number(draft.durationMinutes) || 30,
      price: draft.price.trim() || undefined,
      description: draft.description.trim() || undefined,
    };
    if (!payload.serviceName) {
      toast.error('Service name is required');
      return;
    }
    try {
      await addService(payload).unwrap();
      toast.success('Service added');
      setDraft(null);
    } catch {
      toast.error('Failed to add service');
    }
  };

  const handleDelete = (service: Service) => {
    toast.promise(deleteService(service.id).unwrap(), {
      loading: 'Deleting…',
      success: `${service.serviceName} removed`,
      error: 'Failed to delete service',
    });
  };

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Prices</h1>
        <p className="text-muted-foreground mt-1 text-sm">
          Services and prices your clinic offers. The AI receptionist uses this list to answer cost
          questions and guide appointment bookings.
        </p>
      </div>

      <Card>
        <CardHeader className="flex flex-row flex-wrap items-start justify-between gap-4">
          <div>
            <CardTitle>Services &amp; Pricing</CardTitle>
            <CardDescription>
              Add every treatment you offer. Include a price so the AI can quote it when patients
              ask.
            </CardDescription>
          </div>
          <Button
            type="button"
            variant="outline"
            size="sm"
            disabled={draft !== null}
            onClick={() => {
              cancelEdit();
              setDraft(newDraftRow());
            }}
          >
            <PlusIcon className="size-4" />
            Add service
          </Button>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="space-y-2">
              <Skeleton className="h-10 w-full" />
              <Skeleton className="h-10 w-full" />
              <Skeleton className="h-10 w-full" />
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-[26%]">Service</TableHead>
                  <TableHead className="w-[14%]">Duration</TableHead>
                  <TableHead className="w-[14%]">Price (£)</TableHead>
                  <TableHead className="w-[34%]">Description</TableHead>
                  <TableHead className="w-[12%] text-right" />
                </TableRow>
              </TableHeader>
              <TableBody>
                {services.length === 0 && !draft && (
                  <TableRow>
                    <TableCell
                      colSpan={5}
                      className="text-muted-foreground py-12 text-center text-sm"
                    >
                      No services yet. Click &quot;Add service&quot; to get started.
                    </TableCell>
                  </TableRow>
                )}

                {services.map((service) =>
                  editingId === service.id && editRow ? (
                    <TableRow key={service.id} className="bg-muted/30">
                      <TableCell>
                        <Input
                          value={editRow.serviceName}
                          onChange={(e) => setEditRow({ ...editRow, serviceName: e.target.value })}
                          placeholder="e.g. Invisalign Consultation"
                          autoFocus
                        />
                      </TableCell>
                      <TableCell>
                        <Input
                          value={editRow.durationMinutes}
                          onChange={(e) =>
                            setEditRow({ ...editRow, durationMinutes: e.target.value })
                          }
                          placeholder="30"
                          type="number"
                          min={5}
                        />
                      </TableCell>
                      <TableCell>
                        <Input
                          value={editRow.price}
                          onChange={(e) => setEditRow({ ...editRow, price: e.target.value })}
                          placeholder="0.00"
                        />
                      </TableCell>
                      <TableCell>
                        <Input
                          value={editRow.description}
                          onChange={(e) => setEditRow({ ...editRow, description: e.target.value })}
                          placeholder="Optional description"
                        />
                      </TableCell>
                      <TableCell className="text-right">
                        <div className="flex justify-end gap-1">
                          <Button
                            type="button"
                            variant="ghost"
                            size="icon"
                            className="text-green-600 hover:text-green-700"
                            onClick={saveEdit}
                          >
                            <CheckIcon className="size-4" />
                          </Button>
                          <Button
                            type="button"
                            variant="ghost"
                            size="icon"
                            className="text-muted-foreground"
                            onClick={cancelEdit}
                          >
                            <XIcon className="size-4" />
                          </Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  ) : (
                    <TableRow key={service.id}>
                      <TableCell className="font-medium">{service.serviceName}</TableCell>
                      <TableCell className="text-muted-foreground">
                        {service.durationMinutes ? `${service.durationMinutes} min` : '—'}
                      </TableCell>
                      <TableCell>
                        {service.price ? (
                          <span className="font-medium">£{service.price}</span>
                        ) : (
                          <span className="text-muted-foreground text-xs">Not set</span>
                        )}
                      </TableCell>
                      <TableCell className="text-muted-foreground text-sm">
                        {service.description || '—'}
                      </TableCell>
                      <TableCell className="text-right">
                        <div className="flex justify-end gap-1">
                          <Button
                            type="button"
                            variant="ghost"
                            size="icon"
                            className="text-muted-foreground hover:text-foreground"
                            onClick={() => startEdit(service)}
                          >
                            <PencilIcon className="size-4" />
                          </Button>
                          <Button
                            type="button"
                            variant="ghost"
                            size="icon"
                            className="text-muted-foreground hover:text-destructive"
                            onClick={() => handleDelete(service)}
                          >
                            <Trash2Icon className="size-4" />
                          </Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  ),
                )}

                {draft !== null && (
                  <TableRow className="bg-muted/30">
                    <TableCell>
                      <Input
                        value={draft.serviceName}
                        onChange={(e) => setDraft({ ...draft, serviceName: e.target.value })}
                        placeholder="e.g. Invisalign Consultation"
                        autoFocus
                      />
                    </TableCell>
                    <TableCell>
                      <Input
                        value={draft.durationMinutes}
                        onChange={(e) => setDraft({ ...draft, durationMinutes: e.target.value })}
                        placeholder="30"
                        type="number"
                        min={5}
                      />
                    </TableCell>
                    <TableCell>
                      <Input
                        value={draft.price}
                        onChange={(e) => setDraft({ ...draft, price: e.target.value })}
                        placeholder="0.00"
                      />
                    </TableCell>
                    <TableCell>
                      <Input
                        value={draft.description}
                        onChange={(e) => setDraft({ ...draft, description: e.target.value })}
                        placeholder="Optional description"
                      />
                    </TableCell>
                    <TableCell className="text-right">
                      <div className="flex justify-end gap-1">
                        <Button
                          type="button"
                          variant="ghost"
                          size="icon"
                          className="text-green-600 hover:text-green-700"
                          onClick={saveDraft}
                        >
                          <CheckIcon className="size-4" />
                        </Button>
                        <Button
                          type="button"
                          variant="ghost"
                          size="icon"
                          className="text-muted-foreground"
                          onClick={() => setDraft(null)}
                        >
                          <XIcon className="size-4" />
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
