'use client';

import { useState } from 'react';
import { PageHeader } from '@/components/page-header';
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
  useGetFaqsQuery,
  useAddFaqMutation,
  useUpdateFaqMutation,
  useDeleteFaqMutation,
} from '@/features/aiConfig/aiConfigApi';
import type { Faq } from '@/features/aiConfig/types';
import { PlusIcon, Trash2Icon, CheckIcon, XIcon, PencilIcon } from 'lucide-react';

interface EditingRow {
  id: string;
  question: string;
  answer: string;
  category: string;
}

interface DraftRow {
  id: null;
  question: string;
  answer: string;
  category: string;
}

function newDraftRow(): DraftRow {
  return { id: null, question: '', answer: '', category: '' };
}

export default function FaqsPage() {
  const { data, isLoading } = useGetFaqsQuery();
  const [addFaq] = useAddFaqMutation();
  const [updateFaq] = useUpdateFaqMutation();
  const [deleteFaq] = useDeleteFaqMutation();

  const [editingId, setEditingId] = useState<string | null>(null);
  const [editRow, setEditRow] = useState<EditingRow | null>(null);
  const [draft, setDraft] = useState<DraftRow | null>(null);

  const faqs = data?.data ?? [];

  const startEdit = (faq: Faq) => {
    setDraft(null);
    setEditingId(faq.id);
    setEditRow({
      id: faq.id,
      question: faq.question,
      answer: faq.answer,
      category: faq.category ?? '',
    });
  };

  const cancelEdit = () => {
    setEditingId(null);
    setEditRow(null);
  };

  const saveEdit = async () => {
    if (!editRow) return;
    const payload = {
      question: editRow.question.trim(),
      answer: editRow.answer.trim(),
      category: editRow.category.trim() || undefined,
    };
    if (!payload.question) {
      toast.error('Question is required');
      return;
    }
    if (!payload.answer) {
      toast.error('Answer is required');
      return;
    }
    try {
      await updateFaq({ id: editRow.id, data: payload }).unwrap();
      toast.success('FAQ updated');
      setEditingId(null);
      setEditRow(null);
    } catch {
      toast.error('Failed to update FAQ');
    }
  };

  const saveDraft = async () => {
    if (!draft) return;
    const payload = {
      question: draft.question.trim(),
      answer: draft.answer.trim(),
      category: draft.category.trim() || undefined,
    };
    if (!payload.question) {
      toast.error('Question is required');
      return;
    }
    if (!payload.answer) {
      toast.error('Answer is required');
      return;
    }
    try {
      await addFaq(payload).unwrap();
      toast.success('FAQ added');
      setDraft(null);
    } catch {
      toast.error('Failed to add FAQ');
    }
  };

  const handleDelete = (faq: Faq) => {
    toast.promise(deleteFaq(faq.id).unwrap(), {
      loading: 'Deleting…',
      success: 'FAQ removed',
      error: 'Failed to delete FAQ',
    });
  };

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title="FAQs"
        subtitle="Questions and answers the AI will use to respond to common patient enquiries."
      />

      <Card>
        <CardHeader className="flex flex-row flex-wrap items-start justify-between gap-4">
          <div>
            <CardTitle>Frequently Asked Questions</CardTitle>
            <CardDescription>
              The AI uses these to answer callers — be specific and use the exact wording patients
              use.
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
            Add FAQ
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
                  <TableHead className="w-[28%]">Question</TableHead>
                  <TableHead className="w-[42%]">Answer</TableHead>
                  <TableHead className="w-[18%]">Category</TableHead>
                  <TableHead className="w-[12%] text-right" />
                </TableRow>
              </TableHeader>
              <TableBody>
                {faqs.length === 0 && !draft && (
                  <TableRow>
                    <TableCell
                      colSpan={4}
                      className="text-muted-foreground py-12 text-center text-sm"
                    >
                      No FAQs yet. Click &quot;Add FAQ&quot; to get started.
                    </TableCell>
                  </TableRow>
                )}

                {faqs.map((faq) =>
                  editingId === faq.id && editRow ? (
                    <TableRow key={faq.id} className="bg-muted/30">
                      <TableCell>
                        <Input
                          value={editRow.question}
                          onChange={(e) => setEditRow({ ...editRow, question: e.target.value })}
                          placeholder="e.g. Do you offer NHS treatment?"
                          autoFocus
                        />
                      </TableCell>
                      <TableCell>
                        <Input
                          value={editRow.answer}
                          onChange={(e) => setEditRow({ ...editRow, answer: e.target.value })}
                          placeholder="e.g. Yes, we accept NHS patients for routine check-ups."
                        />
                      </TableCell>
                      <TableCell>
                        <Input
                          value={editRow.category}
                          onChange={(e) => setEditRow({ ...editRow, category: e.target.value })}
                          placeholder="e.g. NHS &amp; Pricing"
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
                    <TableRow key={faq.id}>
                      <TableCell className="font-medium">{faq.question}</TableCell>
                      <TableCell className="text-muted-foreground text-sm">{faq.answer}</TableCell>
                      <TableCell>
                        {faq.category ? (
                          <span className="text-muted-foreground text-sm">{faq.category}</span>
                        ) : (
                          <span className="text-muted-foreground text-xs">—</span>
                        )}
                      </TableCell>
                      <TableCell className="text-right">
                        <div className="flex justify-end gap-1">
                          <Button
                            type="button"
                            variant="ghost"
                            size="icon"
                            className="text-muted-foreground hover:text-foreground"
                            onClick={() => startEdit(faq)}
                          >
                            <PencilIcon className="size-4" />
                          </Button>
                          <Button
                            type="button"
                            variant="ghost"
                            size="icon"
                            className="text-muted-foreground hover:text-destructive"
                            onClick={() => handleDelete(faq)}
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
                        value={draft.question}
                        onChange={(e) => setDraft({ ...draft, question: e.target.value })}
                        placeholder="e.g. Do you offer NHS treatment?"
                        autoFocus
                      />
                    </TableCell>
                    <TableCell>
                      <Input
                        value={draft.answer}
                        onChange={(e) => setDraft({ ...draft, answer: e.target.value })}
                        placeholder="e.g. Yes, we accept NHS patients for routine check-ups."
                      />
                    </TableCell>
                    <TableCell>
                      <Input
                        value={draft.category}
                        onChange={(e) => setDraft({ ...draft, category: e.target.value })}
                        placeholder="e.g. NHS &amp; Pricing"
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
