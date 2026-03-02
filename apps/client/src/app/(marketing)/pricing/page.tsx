import Link from 'next/link';
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { Button } from '@/components/ui/button';

const plans = [
  {
    name: 'Starter',
    price: 49,
    minutes: 200,
    features: [
      '24/7 AI receptionist',
      '200 call minutes/month',
      'Knowledge base upload',
      'Basic analytics',
    ],
  },
  {
    name: 'Pro',
    price: 99,
    minutes: 500,
    popular: true,
    features: [
      'Everything in Starter',
      '500 call minutes/month',
      'Calendar integration',
      'Advanced analytics',
      'Priority support',
    ],
  },
  {
    name: 'Enterprise',
    price: 249,
    minutes: 1500,
    features: [
      'Everything in Pro',
      '1500 call minutes/month',
      'PMS integration',
      'Custom voice & branding',
      'Dedicated success manager',
    ],
  },
];

export default function PricingPage() {
  return (
    <div className="mx-auto w-full max-w-7xl px-4 py-24 sm:px-6 lg:px-8">
      <div className="mx-auto max-w-3xl text-center">
        <h1 className="text-4xl font-bold">Simple, transparent pricing</h1>
        <p className="mt-4 text-lg text-muted-foreground">
          Pay for what you use. All plans include a 14-day free trial.
        </p>
      </div>

      <div className="mx-auto mt-16 grid max-w-5xl gap-8 md:grid-cols-3">
        {plans.map((plan) => (
          <Card
            key={plan.name}
            className={plan.popular ? 'border-primary' : ''}
          >
            <CardHeader>
              {plan.popular && (
                <span className="w-fit rounded-full bg-primary px-3 py-1 text-xs font-medium text-primary-foreground">
                  Most popular
                </span>
              )}
              <CardTitle>{plan.name}</CardTitle>
              <CardDescription>
                ${plan.price}/month · {plan.minutes} min
              </CardDescription>
            </CardHeader>
            <CardContent>
              <ul className="space-y-2">
                {plan.features.map((f) => (
                  <li key={f} className="text-sm">
                    ✓ {f}
                  </li>
                ))}
              </ul>
            </CardContent>
            <CardFooter>
              <Button
                className="w-full"
                variant={plan.popular ? 'default' : 'outline'}
                asChild
              >
                <Link href="/signup">Get started</Link>
              </Button>
            </CardFooter>
          </Card>
        ))}
      </div>

      <p className="mt-12 text-center text-sm text-muted-foreground">
        Additional minutes: $0.15/min. Volume discounts available for
        Enterprise.
      </p>
    </div>
  );
}
