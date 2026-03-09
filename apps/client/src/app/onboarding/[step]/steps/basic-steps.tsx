import { toast } from 'sonner';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Field, FieldGroup, FieldLabel } from '@/components/ui/field';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { getUserFriendlyApiError } from '@/lib/api-error';
import type { OnboardingFlow } from '../use-onboarding-flow';

export function ClinicProfileStep({ flow }: { flow: OnboardingFlow }) {
  return (
    <Card className="border-0 bg-card shadow-lg">
      <CardHeader>
        <CardTitle className="text-xl">Clinic profile</CardTitle>
        <CardDescription>Enter your clinic details and business hours</CardDescription>
      </CardHeader>
      <CardContent>
        <form
          onSubmit={async (event) => {
            event.preventDefault();
            try {
              await flow.saveClinicProfile({
                clinicName: flow.clinicName,
                address: flow.address || undefined,
                phone: flow.phone || undefined,
                email: flow.email || undefined,
                timezone: flow.timezone,
              }).unwrap();
              toast.success('Clinic profile saved');
              flow.goNext('plan');
            } catch (error: unknown) {
              toast.error(getUserFriendlyApiError(error));
            }
          }}
        >
          <FieldGroup>
            <Field>
              <FieldLabel>Clinic name</FieldLabel>
              <Input placeholder="Smile Dental" required value={flow.clinicName} onChange={(event) => flow.setClinicName(event.target.value)} />
            </Field>
            <Field>
              <FieldLabel>Address</FieldLabel>
              <Input placeholder="123 Main St" value={flow.address} onChange={(event) => flow.setAddress(event.target.value)} />
            </Field>
            <Field>
              <FieldLabel>Phone</FieldLabel>
              <Input placeholder="+1 555-0100" value={flow.phone} onChange={(event) => flow.setPhone(event.target.value)} />
            </Field>
            <Field>
              <FieldLabel>Email</FieldLabel>
              <Input type="email" placeholder="office@smiledental.com" value={flow.email} onChange={(event) => flow.setEmail(event.target.value)} />
            </Field>
            <Field>
              <FieldLabel>Timezone</FieldLabel>
              <Select value={flow.timezone} onValueChange={(value) => value && flow.setTimezone(value)}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="Europe/London">London</SelectItem>
                  <SelectItem value="Europe/Dublin">Dublin</SelectItem>
                  <SelectItem value="Europe/Paris">Paris</SelectItem>
                  <SelectItem value="Europe/Berlin">Berlin</SelectItem>
                  <SelectItem value="Europe/Madrid">Madrid</SelectItem>
                  <SelectItem value="Europe/Rome">Rome</SelectItem>
                  <SelectItem value="Europe/Amsterdam">Amsterdam</SelectItem>
                  <SelectItem value="Europe/Zurich">Zurich</SelectItem>
                </SelectContent>
              </Select>
            </Field>
            <div className="flex flex-wrap gap-3 pt-2">
              <Button type="button" variant="outline" onClick={flow.goBack} className="min-w-28">Back</Button>
              <Button type="submit" className="min-w-28" disabled={flow.savingProfile}>{flow.savingProfile ? 'Saving...' : 'Next'}</Button>
            </div>
          </FieldGroup>
        </form>
      </CardContent>
    </Card>
  );
}

export function PlanStep({ flow }: { flow: OnboardingFlow }) {
  return (
    <Card className="border-0 bg-card shadow-lg">
      <CardHeader>
        <CardTitle className="text-xl">Choose a plan</CardTitle>
        <CardDescription>This is a mock plan selection step for onboarding UX.</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="grid gap-3 md:grid-cols-3">
          {[
            { id: 'starter' as const, name: 'Starter', price: '$49/mo', detail: 'Best for solo clinics getting started.' },
            { id: 'growth' as const, name: 'Growth', price: '$149/mo', detail: 'Best for busy clinics with higher call volume.' },
            { id: 'pro' as const, name: 'Pro', price: '$299/mo', detail: 'Best for multi-location clinics and teams.' },
          ].map((plan) => {
            const isSelected = flow.selectedPlan === plan.id;
            return (
              <button
                key={plan.id}
                type="button"
                onClick={() => flow.setSelectedPlan(plan.id)}
                className={`rounded-xl border p-4 text-left transition ${isSelected ? 'border-primary bg-primary/5' : 'border-border hover:border-primary/40'}`}
              >
                <p className="text-sm font-medium">{plan.name}</p>
                <p className="mt-1 text-xl font-semibold">{plan.price}</p>
                <p className="mt-2 text-sm text-muted-foreground">{plan.detail}</p>
                {isSelected && <Badge className="mt-3">Selected</Badge>}
              </button>
            );
          })}
        </div>
        <div className="flex flex-wrap gap-3 pt-2">
          <Button type="button" variant="outline" onClick={flow.goBack} className="min-w-28">Back</Button>
          <Button
            type="button"
            className="min-w-28"
            onClick={() => {
              toast.success(`Selected ${flow.selectedPlan} plan`);
              flow.goNext('knowledge-base');
            }}
          >
            Continue
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
