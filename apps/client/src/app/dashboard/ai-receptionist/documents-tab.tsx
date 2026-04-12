'use client';

import { useMemo, useState } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { toast } from 'sonner';
import { isSupportedContextFile } from '@/app/onboarding/[step]/onboarding-shared';
import { useGetContextDocumentsQuery } from '@/features/onboarding/onboardingApi';

export function DocumentsTab(props: {
  onUpload: (formData: FormData) => Promise<void>;
  saving?: boolean;
}) {
  const { onUpload, saving } = props;
  const [files, setFiles] = useState<File[]>([]);
  const [noteName, setNoteName] = useState('Clinic Knowledge Note');
  const [noteContent, setNoteContent] = useState('');
  const { data: learnedData, isLoading: learnedLoading } = useGetContextDocumentsQuery();
  const learnedDocs = learnedData?.data ?? [];

  const totalChars = useMemo(
    () => noteContent.length,
    [noteContent],
  );

  const handleFiles = async (files: FileList | null) => {
    if (!files?.length) return;

    const newFiles: File[] = [];
    for (const file of Array.from(files)) {
      if (!isSupportedContextFile(file)) {
        toast.error(`${file.name} is not a supported file type.`);
        continue;
      }
      if (files.length + newFiles.length >= 10) {
        toast.error('You can upload up to 10 documents at a time.');
        break;
      }
      if (file.size > 5 * 1024 * 1024) {
        toast.error(`${file.name} is too large. Max 5 MB.`);
        continue;
      }
      newFiles.push(file);
    }

    if (newFiles.length) {
      setFiles((prev) => [...prev, ...newFiles]);
      toast.success(`Added ${newFiles.length} document${newFiles.length > 1 ? 's' : ''}.`);
    }
  };

  const handleRemove = (index: number) => {
    setFiles((prev) => prev.filter((_, i) => i !== index));
  };

  const handleSave = async () => {
    const formData = new FormData();
    files.forEach((file) => formData.append('files', file, file.name));

    if (noteContent.trim()) {
      const blob = new Blob([noteContent.trim()], { type: 'text/plain' });
      const safeName = noteName.trim() || 'Clinic Knowledge Note';
      formData.append('files', blob, `${safeName}.txt`);
    }

    if (files.length === 0 && !noteContent.trim()) {
      toast.error('Add at least one document or note before saving.');
      return;
    }

    try {
      await onUpload(formData);
      setFiles([]);
      setNoteContent('');
      toast.success('Documents saved for AI knowledge.');
    } catch {
      toast.error('Failed to save documents.');
    }
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle>Knowledge Documents</CardTitle>
        <CardDescription>
          Upload clinic documents so the AI receptionist can reference them during calls.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        <div className="space-y-2">
          <label className="text-sm font-medium">Upload files</label>
          <Input
            type="file"
            multiple
            accept=".txt,.md,.csv,.json,.xml,.html,.pdf,.docx,.xlsx,text/plain,text/markdown,text/csv,application/json,text/xml,text/html,application/pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
            onChange={(event) => handleFiles(event.target.files)}
          />
          <p className="text-xs text-muted-foreground">
            Supported: TXT, MD, CSV, JSON, XML, HTML, PDF, DOCX, XLSX. Max 40k characters per document.
          </p>
        </div>

        {files.length > 0 ? (
          <div className="space-y-2">
            <p className="text-sm font-medium">Queued documents</p>
            <div className="space-y-2">
              {files.map((file, index) => (
                <div key={`${file.name}-${index}`} className="flex items-center justify-between rounded-md border px-3 py-2 text-sm">
                  <div className="flex items-center gap-2">
                    <Badge variant="outline">{file.type || 'text/plain'}</Badge>
                    <span className="font-medium">{file.name}</span>
                    <span className="text-xs text-muted-foreground">
                      ({Math.round(file.size / 1024)} KB)
                    </span>
                  </div>
                  <Button variant="ghost" size="sm" onClick={() => handleRemove(index)}>
                    Remove
                  </Button>
                </div>
              ))}
            </div>
          </div>
        ) : null}

        <div className="space-y-2">
          <label className="text-sm font-medium">Quick note</label>
          <Input
            value={noteName}
            onChange={(event) => setNoteName(event.target.value)}
            placeholder="Document name"
          />
          <Textarea
            rows={5}
            value={noteContent}
            onChange={(event) => setNoteContent(event.target.value)}
            placeholder="Paste any clinic notes, pricing, or policies here."
          />
        </div>

        <div className="flex items-center justify-between text-xs text-muted-foreground">
          <span>Total characters: {totalChars}</span>
          <Button onClick={handleSave} disabled={saving}>
            {saving ? 'Saving…' : 'Save documents'}
          </Button>
        </div>

        <div className="space-y-3 border-t pt-5">
          <div>
            <p className="text-sm font-semibold">What the AI learned from documents</p>
            <p className="text-xs text-muted-foreground">
              A quick snapshot of the uploaded knowledge the receptionist can reference on calls.
            </p>
          </div>

          {learnedLoading ? (
            <p className="text-sm text-muted-foreground">Loading learned knowledge…</p>
          ) : learnedDocs.length === 0 ? (
            <div className="rounded-md border border-dashed p-4 text-sm text-muted-foreground">
              No knowledge documents saved yet. Upload a document or note above to populate this section.
            </div>
          ) : (
            <div className="space-y-3">
              {learnedDocs.map((doc) => (
                <div key={doc.id} className="rounded-md border p-3 text-sm">
                  <div className="flex flex-wrap items-center gap-2">
                    <Badge variant="outline">{doc.mimeType || 'text/plain'}</Badge>
                    <span className="font-medium">{doc.title}</span>
                    <span className="text-xs text-muted-foreground">
                      {doc.charCount.toLocaleString()} chars
                    </span>
                  </div>
                  <p className="mt-2 text-xs text-muted-foreground">
                    {doc.preview || 'No preview available.'}
                  </p>
                </div>
              ))}
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
