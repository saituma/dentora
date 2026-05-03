import { toast } from 'sonner';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Field, FieldGroup, FieldLabel } from '@/components/ui/field';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { getUserFriendlyApiError } from '@/lib/api-error';
import type { OnboardingFlow } from '../use-onboarding-flow';

export function ClinicProfileStep({ flow }: { flow: OnboardingFlow }) {
  return (
    <Card className="border bg-card/95 shadow-sm rounded-3xl">
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
              flow.goNext('knowledge-base');
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
              <Button type="submit" className="min-w-28" disabled={flow.savingClinicProfile}>{flow.savingClinicProfile ? 'Saving...' : 'Next'}</Button>
            </div>
          </FieldGroup>
        </form>
      </CardContent>
    </Card>
  );
}

