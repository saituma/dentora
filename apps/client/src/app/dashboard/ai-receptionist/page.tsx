'use client';

import { useState } from 'react';
import { toast } from 'sonner';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Field, FieldGroup, FieldLabel } from '@/components/ui/field';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { FileUpload } from '@/components/file-upload';
import { Badge } from '@/components/ui/badge';
import { PhoneIcon } from 'lucide-react';

const toneOptions = [
  { value: 'friendly', label: 'Friendly' },
  { value: 'professional', label: 'Professional' },
  { value: 'formal', label: 'Formal' },
  { value: 'casual', label: 'Casual' },
];

const voiceOptions = [
  { value: 'rachel', label: 'Rachel (Female)' },
  { value: 'drew', label: 'Drew (Male)' },
  { value: 'clyde', label: 'Clyde (Male)' },
];

export default function AiReceptionistPage() {
  const [greeting, setGreeting] = useState(
    'Hi, thank you for calling. How can I help you today?'
  );
  const [transferNumber, setTransferNumber] = useState('');
  const [systemPrompt, setSystemPrompt] = useState(
    'You are a friendly dental clinic receptionist. Help patients with appointment booking, rescheduling, and answering common questions about services and pricing.'
  );
  const [tone, setTone] = useState('professional');
  const [voice, setVoice] = useState('rachel');
  const [documents, setDocuments] = useState<
    { id: string; name: string; status: string }[]
  >([]);
  const [isSaving, setIsSaving] = useState(false);

  const handleFileUpload = (file: File) => {
    setDocuments((prev) => [
      ...prev,
      { id: crypto.randomUUID(), name: file.name, status: 'processing' },
    ]);
    toast.success(`${file.name} uploaded. Processing...`);
    setTimeout(() => {
      setDocuments((prev) =>
        prev.map((d) => (d.name === file.name ? { ...d, status: 'ready' } : d))
      );
      toast.success(`${file.name} is ready`);
    }, 2000);
  };

  const handleSave = async () => {
    setIsSaving(true);
    await new Promise((r) => setTimeout(r, 500));
    setIsSaving(false);
    toast.success('AI configuration saved');
  };

  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-lg font-semibold">
            Configure your AI receptionist
          </h2>
          <p className="text-sm text-muted-foreground">
            Customize voice, knowledge base, and behavior
          </p>
        </div>
        <Button onClick={handleSave} disabled={isSaving}>
          {isSaving ? 'Saving...' : 'Save changes'}
        </Button>
      </div>

      <Tabs defaultValue="configuration" className="space-y-6">
        <TabsList>
          <TabsTrigger value="configuration">Configuration</TabsTrigger>
          <TabsTrigger value="voice">Voice & Tone</TabsTrigger>
          <TabsTrigger value="knowledge">Knowledge Base</TabsTrigger>
          <TabsTrigger value="rules">Services & Rules</TabsTrigger>
        </TabsList>

        <TabsContent value="configuration" className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle>AI behavior</CardTitle>
              <CardDescription>
                Define how your AI receptionist greets callers and handles calls
              </CardDescription>
            </CardHeader>
            <CardContent>
              <FieldGroup>
                <Field>
                  <FieldLabel>Greeting message</FieldLabel>
                  <Textarea
                    value={greeting}
                    onChange={(e) => setGreeting(e.target.value)}
                    rows={3}
                    placeholder="Hi, thank you for calling [Clinic Name]. How can I help you today?"
                  />
                </Field>
                <Field>
                  <FieldLabel>Transfer number</FieldLabel>
                  <Input
                    value={transferNumber}
                    onChange={(e) => setTransferNumber(e.target.value)}
                    placeholder="+1 (555) 000-0000"
                  />
                </Field>
                <Field>
                  <FieldLabel>System prompt</FieldLabel>
                  <Textarea
                    value={systemPrompt}
                    onChange={(e) => setSystemPrompt(e.target.value)}
                    rows={6}
                    placeholder="Instructions for the AI..."
                  />
                </Field>
              </FieldGroup>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="voice" className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle>Voice & tone</CardTitle>
              <CardDescription>
                Choose the voice and personality of your AI receptionist
              </CardDescription>
            </CardHeader>
            <CardContent>
              <FieldGroup>
                <Field>
                  <FieldLabel>Voice</FieldLabel>
                  <Select
                    value={voice}
                    onValueChange={(value) => setVoice(value ?? 'rachel')}
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {voiceOptions.map((v) => (
                        <SelectItem key={v.value} value={v.value}>
                          {v.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </Field>
                <Field>
                  <FieldLabel>Tone</FieldLabel>
                  <Select
                    value={tone}
                    onValueChange={(value) => setTone(value ?? 'professional')}
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {toneOptions.map((t) => (
                        <SelectItem key={t.value} value={t.value}>
                          {t.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </Field>
                <div className="flex gap-4">
                  <Button variant="outline">
                    <PhoneIcon className="mr-2 size-4" />
                    Test call
                  </Button>
                </div>
              </FieldGroup>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="knowledge" className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle>Knowledge base</CardTitle>
              <CardDescription>
                Upload documents with services, pricing, and FAQs for your AI to
                reference
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
              <FileUpload onFileSelect={handleFileUpload} />
              {documents.length > 0 && (
                <div className="space-y-2">
                  <p className="text-sm font-medium">Uploaded documents</p>
                  <div className="space-y-2">
                    {documents.map((doc) => (
                      <div
                        key={doc.id}
                        className="flex items-center justify-between rounded-lg border p-3"
                      >
                        <span className="text-sm">{doc.name}</span>
                        <Badge
                          variant={
                            doc.status === 'ready' ? 'default' : 'secondary'
                          }
                        >
                          {doc.status}
                        </Badge>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="rules" className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle>Services & rules</CardTitle>
              <CardDescription>
                Define appointment durations and transfer rules
              </CardDescription>
            </CardHeader>
            <CardContent>
              <FieldGroup>
                <Field>
                  <FieldLabel>
                    Default appointment duration (minutes)
                  </FieldLabel>
                  <Input type="number" defaultValue={30} />
                </Field>
                <Field>
                  <FieldLabel>Cancellation policy</FieldLabel>
                  <Textarea
                    placeholder="e.g. Please cancel at least 24 hours in advance"
                    rows={2}
                  />
                </Field>
              </FieldGroup>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
