import { toast } from 'sonner';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Field, FieldGroup, FieldLabel } from '@/components/ui/field';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { getUserFriendlyApiError } from '@/lib/api-error';
import type { OnboardingFlow } from '../use-onboarding-flow';
import { useCreateCheckoutSessionMutation } from '@/features/billing/billingApi';

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
              <Button type="submit" className="min-w-28" disabled={flow.savingClinicProfile}>{flow.savingClinicProfile ? 'Saving...' : 'Next'}</Button>
            </div>
          </FieldGroup>
        </form>
      </CardContent>
    </Card>
  );
}

export function PlanStep({ flow }: { flow: OnboardingFlow }) {
  const [createCheckout, { isLoading: checkoutLoading }] = useCreateCheckoutSessionMutation();

  const plans = [
    {
      id: 'starter' as const,
      name: 'Starter',
      price: '$49/mo',
      detail: 'Great for solo practices getting started with a reliable AI front desk.',
      highlights: [
        '1 clinic location',
        'Up to 600 calls/month',
        'Business hours booking',
        'Basic analytics & call logs',
        'Email support in 24–48 hrs',
        'Standard voice & FAQs',
      ],
    },
    {
      id: 'growth' as const,
      name: 'Growth',
      price: '$149/mo',
      detail: 'Built for growing clinics that need smarter routing and faster responses.',
      highlights: [
        'Up to 3 locations',
        'Up to 2,500 calls/month',
        'Priority support in 4–8 hrs',
        'Advanced analytics & insights',
        'Custom booking rules',
        'Multi-staff routing',
      ],
    },
    {
      id: 'pro' as const,
      name: 'Pro',
      price: '$299/mo',
      detail: 'Best for multi-location teams and high-volume practices with complex workflows.',
      highlights: [
        'Unlimited locations',
        'Up to 10,000 calls/month',
        'Dedicated success manager',
        'Custom workflows & integrations',
        'Priority routing + VIP support',
        'Quarterly performance reviews',
      ],
    },
  ];

  const handleContinue = async () => {
    try {
      const origin = window.location.origin;
      const result = await createCheckout({
        planId: flow.selectedPlan,
        successUrl: `${origin}/onboarding/knowledge-base?checkout=success`,
        cancelUrl: `${origin}/onboarding/plan?checkout=cancelled`,
      }).unwrap();

      // Redirect to Stripe Checkout
      window.location.href = result.url;
    } catch (error: unknown) {
      toast.error(getUserFriendlyApiError(error));
    }
  };

  return (
    <Card className="border-0 bg-card shadow-lg">
      <CardHeader>
        <CardTitle className="text-2xl">Pick the right plan</CardTitle>
        <CardDescription className="text-base">Transparent pricing. Upgrade or downgrade any time.</CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        <div className="grid gap-5 md:grid-cols-3">
          {plans.map((plan) => {
            const isSelected = flow.selectedPlan === plan.id;
            return (
              <button
                key={plan.id}
                type="button"
                onClick={() => flow.setSelectedPlan(plan.id)}
                className={`rounded-2xl border p-6 text-left transition ${isSelected ? 'border-primary bg-primary/10 shadow-md' : 'border-border hover:border-primary/40'}`}
              >
                <p className="text-base font-semibold tracking-tight">{plan.name}</p>
                <p className="mt-2 text-3xl font-semibold">{plan.price}</p>
                <p className="mt-2 text-sm text-muted-foreground">{plan.detail}</p>
                <ul className="mt-4 space-y-1 text-sm text-muted-foreground">
                  {plan.highlights.map((item) => (
                    <li key={item}>{item}</li>
                  ))}
                </ul>
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
            disabled={checkoutLoading}
            onClick={handleContinue}
          >
            {checkoutLoading ? 'Redirecting...' : 'Continue to Payment'}
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
