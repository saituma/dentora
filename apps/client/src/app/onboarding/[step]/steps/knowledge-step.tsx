import { toast } from 'sonner';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Field, FieldGroup, FieldLabel } from '@/components/ui/field';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { getUserFriendlyApiError } from '@/lib/api-error';
import type { FaqCategory, ServiceCategory } from '../onboarding-types';
import type { OnboardingFlow } from '../use-onboarding-flow';

export function KnowledgeBaseStep({ flow }: { flow: OnboardingFlow }) {
  return (
    <Card className="border-0 bg-card shadow-lg">
      <CardHeader>
        <CardTitle className="text-xl">Knowledge base</CardTitle>
        <CardDescription>Fill in services, pricing, and FAQs</CardDescription>
        <p className="text-sm text-muted-foreground">Add at least one service and one FAQ to continue.</p>
      </CardHeader>
      <CardContent>
        <form
          onSubmit={async (event) => {
            event.preventDefault();
            try {
              const validServices = flow.servicesForm
                .filter((service) => service.serviceName.trim().length > 0)
                .map((service) => ({
                  serviceName: service.serviceName.trim(),
                  category: service.category,
                  description: service.description.trim() || undefined,
                  durationMinutes: service.durationMinutes,
                  price: service.price.trim() || undefined,
                  isActive: true,
                }));
              const validFaqs = flow.faqsForm
                .filter((faq) => faq.question.trim().length > 0 && faq.answer.trim().length > 0)
                .map((faq) => ({
                  question: faq.question.trim(),
                  answer: faq.answer.trim(),
                  category: faq.category,
                }));
              const validStaff = flow.staffForm
                .filter((staff) => staff.name.trim().length > 0)
                .map((staff) => ({
                  name: staff.name.trim(),
                  role: staff.role.trim() || 'Staff',
                }));
              if (validServices.length === 0 || validFaqs.length === 0) {
                toast.error('Add at least one service and one FAQ');
                return;
              }
              await flow.saveServices({ services: validServices }).unwrap();
              await flow.saveFaqs({ faqs: validFaqs }).unwrap();
              if (validStaff.length > 0) {
                await flow.saveStaffMembers({ staffMembers: validStaff }).unwrap();
              }
              toast.success('Knowledge base saved');
              flow.goNext('voice');
            } catch (error: unknown) {
              toast.error(getUserFriendlyApiError(error));
            }
          }}
        >
          <FieldGroup>
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <p className="text-sm font-medium">Services</p>
                <Button type="button" variant="outline" onClick={flow.addServiceRow}>Add service</Button>
              </div>
              {flow.servicesForm.map((service, index) => (
                <div key={`service-${index}`} className="space-y-3 rounded-lg border p-4">
                  <Field>
                    <FieldLabel>Service name</FieldLabel>
                    <Input placeholder="New Patient Exam" required value={service.serviceName} onChange={(event) => flow.updateServiceRow(index, 'serviceName', event.target.value)} />
                  </Field>
                  <Field>
                    <FieldLabel>Service category</FieldLabel>
                    <Select value={service.category} onValueChange={(value) => value && flow.updateServiceRow(index, 'category', value as ServiceCategory)}>
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="preventive">Preventive</SelectItem>
                        <SelectItem value="restorative">Restorative</SelectItem>
                        <SelectItem value="cosmetic">Cosmetic</SelectItem>
                        <SelectItem value="emergency">Emergency</SelectItem>
                        <SelectItem value="orthodontic">Orthodontic</SelectItem>
                        <SelectItem value="other">Other</SelectItem>
                      </SelectContent>
                    </Select>
                  </Field>
                  <Field>
                    <FieldLabel>Duration (minutes)</FieldLabel>
                    <Input type="number" min={5} max={240} required value={service.durationMinutes} onChange={(event) => flow.updateServiceRow(index, 'durationMinutes', Number(event.target.value))} />
                  </Field>
                  <Field>
                    <FieldLabel>Price (USD)</FieldLabel>
                    <Input placeholder="120" value={service.price} onChange={(event) => flow.updateServiceRow(index, 'price', event.target.value)} />
                  </Field>
                  <Field>
                    <FieldLabel>Service details</FieldLabel>
                    <Textarea rows={2} placeholder="What is included, prep instructions, or follow-up details" value={service.description} onChange={(event) => flow.updateServiceRow(index, 'description', event.target.value)} />
                  </Field>
                  <Button type="button" variant="outline" onClick={() => flow.removeServiceRow(index)} disabled={flow.servicesForm.length === 1}>Remove service</Button>
                </div>
              ))}
            </div>

            <div className="space-y-3 pt-2">
              <div className="flex items-center justify-between">
                <p className="text-sm font-medium">FAQs</p>
                <Button type="button" variant="outline" onClick={flow.addFaqRow}>Add FAQ</Button>
              </div>
              {flow.faqsForm.map((faq, index) => (
                <div key={`faq-${index}`} className="space-y-3 rounded-lg border p-4">
                  <Field>
                    <FieldLabel>FAQ question</FieldLabel>
                    <Input placeholder="Do you accept insurance?" required value={faq.question} onChange={(event) => flow.updateFaqRow(index, 'question', event.target.value)} />
                  </Field>
                  <Field>
                    <FieldLabel>FAQ answer</FieldLabel>
                    <Textarea rows={3} placeholder="We accept major PPO plans..." required value={faq.answer} onChange={(event) => flow.updateFaqRow(index, 'answer', event.target.value)} />
                  </Field>
                  <Field>
                    <FieldLabel>FAQ category</FieldLabel>
                    <Select value={faq.category} onValueChange={(value) => value && flow.updateFaqRow(index, 'category', value as FaqCategory)}>
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="insurance">Insurance</SelectItem>
                        <SelectItem value="hours">Hours</SelectItem>
                        <SelectItem value="procedures">Procedures</SelectItem>
                        <SelectItem value="billing">Billing</SelectItem>
                        <SelectItem value="preparation">Preparation</SelectItem>
                        <SelectItem value="other">Other</SelectItem>
                      </SelectContent>
                    </Select>
                  </Field>
                  <Button type="button" variant="outline" onClick={() => flow.removeFaqRow(index)} disabled={flow.faqsForm.length === 1}>Remove FAQ</Button>
                </div>
              ))}
            </div>

            <div className="space-y-3 pt-2">
              <div className="flex items-center justify-between">
                <p className="text-sm font-medium">Staff Members</p>
                <Button type="button" variant="outline" onClick={flow.addStaffRow}>Add staff</Button>
              </div>
              {flow.staffForm.map((staff, index) => (
                <div key={`staff-${index}`} className="flex flex-col gap-3 rounded-lg border p-4 sm:flex-row sm:items-start">
                  <Field className="flex-1">
                    <FieldLabel>Name</FieldLabel>
                    <Input placeholder="Dr. Sarah Connor" required value={staff.name} onChange={(event) => flow.updateStaffRow(index, 'name', event.target.value)} />
                  </Field>
                  <Field className="flex-1">
                    <FieldLabel>Role / Specialization</FieldLabel>
                    <Input placeholder="Lead Dentist" value={staff.role} onChange={(event) => flow.updateStaffRow(index, 'role', event.target.value)} />
                  </Field>
                  <Button type="button" variant="outline" className="mt-6 sm:self-start" onClick={() => flow.removeStaffRow(index)} disabled={flow.staffForm.length === 1}>Remove</Button>
                </div>
              ))}
            </div>

            <div className="flex flex-wrap gap-3 pt-2">
              <Button type="button" variant="outline" onClick={flow.goBack} className="min-w-28">Back</Button>
              <Button type="submit" className="min-w-28" disabled={flow.savingServices || flow.savingFaqs || flow.savingStaff}>{flow.savingServices || flow.savingFaqs || flow.savingStaff ? 'Saving...' : 'Next'}</Button>
            </div>
          </FieldGroup>
        </form>
      </CardContent>
    </Card>
  );
}
