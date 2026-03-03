import Link from 'next/link';
import {
  ArrowRightIcon,
  CalendarIcon,
  CheckCircle2Icon,
  Clock3Icon,
  HeadsetIcon,
  PhoneCallIcon,
  ShieldCheckIcon,
  SparklesIcon,
  StethoscopeIcon,
  TrendingUpIcon,
} from 'lucide-react';
import { TrustedClinicsMarquee } from '@/components/marketing/trusted-clinics-marquee';

export default function LandingPage() {
  return (
    <div className="overflow-hidden">
      <section className="relative border-b">
        <div className="pointer-events-none absolute inset-x-0 -top-28 h-72 bg-primary/10 blur-3xl" />
        <div className="mx-auto w-full max-w-7xl px-4 sm:px-6 lg:px-8 relative grid gap-12 py-18 md:py-24 lg:grid-cols-[1.05fr_0.95fr] lg:items-center lg:gap-16">
          <div className="space-y-8">
            <div className="inline-flex items-center gap-2 rounded-full border bg-card px-3 py-1 text-xs text-muted-foreground">
              <SparklesIcon className="size-3.5 text-primary" />
              AI Receptionist Platform for Dental Clinics
            </div>

            <div className="space-y-5">
              <h1 className="text-4xl leading-tight font-semibold tracking-tight sm:text-5xl lg:text-6xl">
                Capture more bookings.
                <span className="block text-primary">
                  Without hiring another receptionist.
                </span>
              </h1>
              <p className="max-w-2xl text-base text-muted-foreground sm:text-lg">
                DentalFlow answers every call, books appointments in real time,
                and handles common patient questions with your clinic’s voice.
              </p>
            </div>

            <div className="flex flex-wrap items-center gap-3">
              <Link
                href="/signup"
                className="inline-flex h-11 items-center justify-center gap-2 rounded-md bg-primary px-5 text-sm font-medium text-primary-foreground transition hover:opacity-90"
              >
                Start free 14-day trial
                <ArrowRightIcon className="size-4" />
              </Link>
              <Link
                href="/contact"
                className="inline-flex h-11 items-center justify-center rounded-md border bg-background px-5 text-sm font-medium transition hover:bg-muted"
              >
                Book a live demo
              </Link>
            </div>

            <div className="flex flex-wrap gap-x-6 gap-y-2 text-sm text-muted-foreground">
              <p className="inline-flex items-center gap-2">
                <CheckCircle2Icon className="size-4 text-primary" />
                Setup in under 20 minutes
              </p>
              <p className="inline-flex items-center gap-2">
                <CheckCircle2Icon className="size-4 text-primary" />
                HIPAA-conscious workflows
              </p>
              <p className="inline-flex items-center gap-2">
                <CheckCircle2Icon className="size-4 text-primary" />
                No code required
              </p>
            </div>
          </div>

          <div className="relative rounded-2xl border bg-card p-6 shadow-sm">
            <div className="mb-4 flex items-center justify-between">
              <p className="text-sm font-medium">Today’s AI performance</p>
              <span className="rounded-full bg-primary/10 px-2.5 py-1 text-xs text-primary">
                Live
              </span>
            </div>

            <div className="grid gap-3 sm:grid-cols-2">
              <div className="rounded-xl border bg-background p-4">
                <p className="text-xs text-muted-foreground">
                  Missed calls recovered
                </p>
                <p className="mt-2 text-2xl font-semibold">94%</p>
              </div>
              <div className="rounded-xl border bg-background p-4">
                <p className="text-xs text-muted-foreground">
                  Call to booking rate
                </p>
                <p className="mt-2 text-2xl font-semibold">34%</p>
              </div>
              <div className="rounded-xl border bg-background p-4">
                <p className="text-xs text-muted-foreground">
                  After-hours answered
                </p>
                <p className="mt-2 text-2xl font-semibold">127</p>
              </div>
              <div className="rounded-xl border bg-background p-4">
                <p className="text-xs text-muted-foreground">
                  Revenue recovered
                </p>
                <p className="mt-2 text-2xl font-semibold">$2.3k</p>
              </div>
            </div>

            <div className="mt-5 rounded-xl border bg-background p-4 text-sm">
              <p className="font-medium">
                “I can finally leave at 5 PM and still know every call is
                handled.”
              </p>
              <p className="mt-2 text-muted-foreground">
                Practice Manager, BrightSmile Dental
              </p>
            </div>
          </div>
        </div>
      </section>

      <TrustedClinicsMarquee />

      <section className="py-20 md:py-24">
        <div className="mx-auto w-full max-w-7xl px-4 sm:px-6 lg:px-8">
          <div className="mx-auto max-w-2xl text-center">
            <p className="text-sm font-medium text-primary">
              Why clinics switch
            </p>
            <h2 className="mt-2 text-3xl font-semibold tracking-tight sm:text-4xl">
              Everything your front desk needs,
              <span className="block">without the burnout.</span>
            </h2>
          </div>

          <div className="mt-12 grid gap-5 md:grid-cols-2 xl:grid-cols-4">
            <div className="rounded-2xl border bg-card p-6">
              <PhoneCallIcon className="size-9 text-primary" />
              <h3 className="mt-5 text-lg font-semibold">
                Always-on call handling
              </h3>
              <p className="mt-2 text-sm text-muted-foreground">
                AI answers in seconds, even after hours and during peak times.
              </p>
            </div>
            <div className="rounded-2xl border bg-card p-6">
              <CalendarIcon className="size-9 text-primary" />
              <h3 className="mt-5 text-lg font-semibold">
                Real-time scheduling
              </h3>
              <p className="mt-2 text-sm text-muted-foreground">
                Books, reschedules, and confirms appointments instantly.
              </p>
            </div>
            <div className="rounded-2xl border bg-card p-6">
              <StethoscopeIcon className="size-9 text-primary" />
              <h3 className="mt-5 text-lg font-semibold">
                Trained on your clinic
              </h3>
              <p className="mt-2 text-sm text-muted-foreground">
                Learns your services, pricing, and policies for consistent
                answers.
              </p>
            </div>
            <div className="rounded-2xl border bg-card p-6">
              <TrendingUpIcon className="size-9 text-primary" />
              <h3 className="mt-5 text-lg font-semibold">Growth analytics</h3>
              <p className="mt-2 text-sm text-muted-foreground">
                See conversion rates, recovered revenue, and team performance.
              </p>
            </div>
          </div>
        </div>
      </section>

      <section className="border-y bg-muted/30 py-18 md:py-24">
        <div className="mx-auto w-full max-w-7xl px-4 sm:px-6 lg:px-8 grid gap-8 lg:grid-cols-3">
          {[
            {
              icon: <HeadsetIcon className="size-5 text-primary" />,
              title: 'Step 1',
              label: 'Connect your clinic details',
              text: 'Upload services, FAQs, and scheduling rules in one setup flow.',
            },
            {
              icon: <Clock3Icon className="size-5 text-primary" />,
              title: 'Step 2',
              label: 'Go live in minutes',
              text: 'Forward calls to your AI receptionist and monitor performance.',
            },
            {
              icon: <ShieldCheckIcon className="size-5 text-primary" />,
              title: 'Step 3',
              label: 'Scale confidently',
              text: 'Track quality, optimize scripts, and recover more missed revenue.',
            },
          ].map((step) => (
            <div key={step.label} className="rounded-2xl border bg-card p-6">
              <div className="inline-flex rounded-md bg-primary/10 p-2">
                {step.icon}
              </div>
              <p className="mt-4 text-xs font-semibold tracking-wide text-primary uppercase">
                {step.title}
              </p>
              <h3 className="mt-2 text-lg font-semibold">{step.label}</h3>
              <p className="mt-2 text-sm text-muted-foreground">{step.text}</p>
            </div>
          ))}
        </div>
      </section>

      <section className="py-20 md:py-24">
        <div className="mx-auto w-full max-w-7xl px-4 sm:px-6 lg:px-8">
          <div className="rounded-3xl border bg-card p-8 md:p-12">
            <div className="mx-auto max-w-3xl text-center">
              <h2 className="text-3xl font-semibold tracking-tight sm:text-4xl">
                Ready to turn every missed call
                <span className="block text-primary">
                  into a booked appointment?
                </span>
              </h2>
              <p className="mt-4 text-muted-foreground">
                Join modern dental practices using DentalFlow to answer faster,
                book smarter, and grow without adding overhead.
              </p>
              <div className="mt-8 flex flex-wrap justify-center gap-3">
                <Link
                  href="/signup"
                  className="inline-flex h-11 items-center justify-center gap-2 rounded-md bg-primary px-5 text-sm font-medium text-primary-foreground transition hover:opacity-90"
                >
                  Start free trial
                  <ArrowRightIcon className="size-4" />
                </Link>
                <Link
                  href="/pricing"
                  className="inline-flex h-11 items-center justify-center rounded-md border bg-background px-5 text-sm font-medium transition hover:bg-muted"
                >
                  See pricing
                </Link>
              </div>
            </div>
          </div>
        </div>
      </section>
    </div>
  );
}
