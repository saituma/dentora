'use client';

import { toast } from 'sonner';
import { PlusIcon, TrashIcon } from 'lucide-react';

import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { Field, FieldGroup, FieldLabel } from '@/components/ui/field';
import { Input } from '@/components/ui/input';
import { Skeleton } from '@/components/ui/skeleton';
import { Textarea } from '@/components/ui/textarea';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';

export function ServicesTab(props: {
  newServiceName: string;
  setNewServiceName: (value: string) => void;
  newServiceDuration: string;
  setNewServiceDuration: (value: string) => void;
  handleAddService: () => Promise<void>;
  addingService: boolean;
  servicesLoading: boolean;
  services: Array<{ id: string; serviceName?: string; durationMinutes?: number }>;
  deleteService: (id: string) => { unwrap: () => Promise<unknown> };
}) {
  const { newServiceName, setNewServiceName, newServiceDuration, setNewServiceDuration, handleAddService, addingService, servicesLoading, services, deleteService } = props;

  return (
    <Card>
      <CardHeader>
        <CardTitle>Services</CardTitle>
        <CardDescription>
          Active services the receptionist can book.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        <div className="flex gap-2">
          <Input value={newServiceName} onChange={(e) => setNewServiceName(e.target.value)} placeholder="Service name" className="flex-1" />
          <Input value={newServiceDuration} onChange={(e) => setNewServiceDuration(e.target.value)} placeholder="Minutes" type="number" className="w-28" />
          <Button onClick={handleAddService} disabled={addingService}>
            <PlusIcon className="mr-1 size-4" />
            Add
          </Button>
        </div>

        {servicesLoading ? (
          <div className="space-y-2">
            {Array.from({ length: 3 }).map((_, index) => (
              <Skeleton key={index} className="h-12 w-full" />
            ))}
          </div>
        ) : services.length === 0 ? (
          <p className="py-8 text-center text-sm text-muted-foreground">No services configured yet.</p>
        ) : (
          <div className="space-y-2">
            {services.map((service) => (
              <div key={service.id} className="flex items-center justify-between rounded-lg border p-3">
                <div>
                  <p className="text-sm font-medium">{service.serviceName}</p>
                  <p className="text-xs text-muted-foreground">
                    {service.durationMinutes ? `${service.durationMinutes} min` : 'Duration not set'}
                  </p>
                </div>
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={async () => {
                    try {
                      await deleteService(service.id).unwrap();
                      toast.success('Service removed');
                    } catch {
                      toast.error('Failed to remove service');
                    }
                  }}
                >
                  <TrashIcon className="size-4" />
                </Button>
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

export function FaqsTab(props: {
  newQuestion: string;
  setNewQuestion: (value: string) => void;
  newAnswer: string;
  setNewAnswer: (value: string) => void;
  handleAddFaq: () => Promise<void>;
  addingFaq: boolean;
  faqsLoading: boolean;
  faqs: Array<{ id: string; question?: string; answer?: string }>;
  deleteFaq: (id: string) => { unwrap: () => Promise<unknown> };
}) {
  const { newQuestion, setNewQuestion, newAnswer, setNewAnswer, handleAddFaq, addingFaq, faqsLoading, faqs, deleteFaq } = props;

  return (
    <Card>
      <CardHeader>
        <CardTitle>FAQs</CardTitle>
        <CardDescription>
          Common clinic information the receptionist can answer without asking staff.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        <FieldGroup>
          <Field>
            <FieldLabel>Question</FieldLabel>
            <Input value={newQuestion} onChange={(e) => setNewQuestion(e.target.value)} placeholder="Do you accept new patients?" />
          </Field>
          <Field>
            <FieldLabel>Answer</FieldLabel>
            <Textarea value={newAnswer} onChange={(e) => setNewAnswer(e.target.value)} rows={2} placeholder="Yes, we are currently accepting new patients." />
          </Field>
          <Button onClick={handleAddFaq} disabled={addingFaq}>
            <PlusIcon className="mr-1 size-4" />
            Add FAQ
          </Button>
        </FieldGroup>

        {faqsLoading ? (
          <div className="space-y-2">
            {Array.from({ length: 3 }).map((_, index) => (
              <Skeleton key={index} className="h-16 w-full" />
            ))}
          </div>
        ) : faqs.length === 0 ? (
          <p className="py-8 text-center text-sm text-muted-foreground">No FAQs configured yet.</p>
        ) : (
          <div className="space-y-2">
            {faqs.map((faq) => (
              <div key={faq.id} className="rounded-lg border p-3">
                <div className="flex items-start justify-between">
                  <div>
                    <p className="text-sm font-medium">{faq.question}</p>
                    <p className="mt-1 text-sm text-muted-foreground">{faq.answer}</p>
                  </div>
                  <Button
                    variant="ghost"
                    size="icon"
                    onClick={async () => {
                      try {
                        await deleteFaq(faq.id).unwrap();
                        toast.success('FAQ removed');
                      } catch {
                        toast.error('Failed to remove FAQ');
                      }
                    }}
                  >
                    <TrashIcon className="size-4" />
                  </Button>
                </div>
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function getPolicyDisplay(policy: {
  policyType?: string | null;
  content?: string | null;
  escalationConditions?: { type?: string; content?: string } | null;
  emergencyDisclaimer?: string | null;
}) {
  const normalizedType =
    (typeof policy.policyType === 'string' && policy.policyType.trim())
    || (typeof policy.escalationConditions?.type === 'string' && policy.escalationConditions.type.trim())
    || (typeof policy.emergencyDisclaimer === 'string' && policy.emergencyDisclaimer.trim() ? 'emergency' : '')
    || 'structured_policy';

  const normalizedContent =
    (typeof policy.content === 'string' && policy.content.trim())
    || (typeof policy.escalationConditions?.content === 'string' && policy.escalationConditions.content.trim())
    || (typeof policy.emergencyDisclaimer === 'string' && policy.emergencyDisclaimer.trim())
    || 'Policy details are stored in structured fields.';

  return {
    title: normalizedType.replace(/_/g, ' '),
    content: normalizedContent,
  };
}

export function PoliciesTab(props: {
  newPolicyType: string;
  setNewPolicyType: (value: string) => void;
  newPolicyContent: string;
  setNewPolicyContent: (value: string) => void;
  handleAddPolicy: () => Promise<void>;
  addingPolicy: boolean;
  policiesLoading: boolean;
  policies: Array<{
    id: string;
    policyType?: string | null;
    content?: string | null;
    escalationConditions?: { type?: string; content?: string } | null;
    emergencyDisclaimer?: string | null;
  }>;
  deletePolicy: (id: string) => { unwrap: () => Promise<unknown> };
}) {
  const { newPolicyType, setNewPolicyType, newPolicyContent, setNewPolicyContent, handleAddPolicy, addingPolicy, policiesLoading, policies, deletePolicy } = props;

  return (
    <Card>
      <CardHeader>
        <CardTitle>Policies</CardTitle>
        <CardDescription>
          Patient-facing policy snippets the receptionist should communicate during calls.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        <FieldGroup>
          <Field>
            <FieldLabel>Policy type</FieldLabel>
            <Select value={newPolicyType} onValueChange={(value) => setNewPolicyType(value || 'cancellation')}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="cancellation">Cancellation</SelectItem>
                <SelectItem value="no_show">No-show</SelectItem>
                <SelectItem value="payment">Payment</SelectItem>
                <SelectItem value="insurance">Insurance</SelectItem>
                <SelectItem value="other">Other</SelectItem>
              </SelectContent>
            </Select>
          </Field>
          <Field>
            <FieldLabel>Content</FieldLabel>
            <Textarea value={newPolicyContent} onChange={(e) => setNewPolicyContent(e.target.value)} rows={2} placeholder="Please cancel at least 24 hours in advance." />
          </Field>
          <Button onClick={handleAddPolicy} disabled={addingPolicy}>
            <PlusIcon className="mr-1 size-4" />
            Add policy
          </Button>
        </FieldGroup>

        {policiesLoading ? (
          <div className="space-y-2">
            {Array.from({ length: 2 }).map((_, index) => (
              <Skeleton key={index} className="h-16 w-full" />
            ))}
          </div>
        ) : policies.length === 0 ? (
          <p className="py-8 text-center text-sm text-muted-foreground">No policies configured yet.</p>
        ) : (
          <div className="space-y-2">
            {policies.map((policy) => {
              const policyDisplay = getPolicyDisplay(policy);

              return (
                <div key={policy.id} className="rounded-lg border p-3">
                  <div className="flex items-start justify-between">
                    <div>
                      <Badge variant="outline" className="mb-1 capitalize">
                        {policyDisplay.title}
                      </Badge>
                      <p className="text-sm text-muted-foreground">{policyDisplay.content}</p>
                    </div>
                    <Button
                      variant="ghost"
                      size="icon"
                      onClick={async () => {
                        try {
                          await deletePolicy(policy.id).unwrap();
                          toast.success('Policy removed');
                        } catch {
                          toast.error('Failed to remove policy');
                        }
                      }}
                    >
                      <TrashIcon className="size-4" />
                    </Button>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
