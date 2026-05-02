'use client';

import Link from 'next/link';
import { motion } from 'framer-motion';
import { ArrowRightIcon, CheckCircle2Icon } from 'lucide-react';
import { TrustedClinicsMarquee } from '@/components/marketing/trusted-clinics-marquee';
import { Button } from '@/components/ui/button';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';

const timeline = [
  { time: '09:14', event: 'Emergency call triaged and routed to staff', status: 'Escalated' },
  { time: '09:11', event: 'Composite bonding consultation booked', status: 'Booked' },
  { time: '09:08', event: 'Insurance eligibility question resolved', status: 'Resolved' },
  { time: '09:03', event: 'Broken crown same-day slot offered', status: 'Booked' },
] as const;

const outcomes = [
  ['Missed calls recovered', '94%'],
  ['Call → booking conversion', '34%'],
  ['After-hours answered', '127'],
  ['Recovered monthly revenue', '$2.3k'],
] as const;

const faqs = [
  ['How fast can we launch?', 'Most clinics go live in under 20 minutes after importing services and booking rules.'],
  ['Can we control call behavior?', 'Yes. You set escalation thresholds, booking constraints, and response tone.'],
  ['Does it work after hours?', 'Yes. Calls are answered 24/7 with triage and next-day booking capture.'],
] as const;

export default function LandingPage() {
  return (
    <div className="relative overflow-hidden pt-[45px] lg:pt-0">
      <section className="relative border-b border-foreground/[0.06]">
        <div className="mx-auto w-full max-w-7xl px-5 sm:px-6 lg:px-7">
          <div className="flex flex-col lg:flex-row">
            <aside className="relative z-10 w-full border-b border-foreground/[0.06] bg-background px-5 sm:px-6 lg:sticky lg:top-0 lg:h-dvh lg:w-[40%] lg:border-b-0 lg:border-r lg:overflow-clip lg:px-7">
              <div className="pointer-events-none absolute inset-0 bg-grid-small text-foreground/[0.04]" />
              <div className="pointer-events-none absolute -left-10 top-24 h-56 w-56 rounded-full bg-primary/12 blur-3xl" />

              <div className="relative flex h-full flex-col justify-between py-14 lg:py-16">
                <div className="space-y-7">
                  <p className="text-[10px] font-mono uppercase tracking-[0.2em] text-muted-foreground">Dentora / AI Reception</p>
                  <h1 className="text-4xl font-medium leading-[0.97] tracking-tight sm:text-5xl lg:text-[3.3rem]">
                    A front desk that never
                    <span className="block text-primary">drops a serious caller.</span>
                  </h1>
                  <p className="max-w-xl text-base text-muted-foreground sm:text-lg">
                    Built for UK dental clinics that need calm operations, instant booking flow, and consistent patient communication.
                  </p>

                  <div className="flex flex-wrap items-center gap-3">
                    <Button asChild className="h-11 border border-foreground/25 bg-foreground px-5 text-xs font-mono uppercase tracking-[0.16em] text-background hover:opacity-90">
                      <Link href="/signup">
                        Start Now
                        <ArrowRightIcon className="size-4" />
                      </Link>
                    </Button>
                    <Button asChild variant="outline" className="h-11 border-foreground/[0.15] bg-background px-5 text-xs font-mono uppercase tracking-[0.16em] hover:bg-foreground/[0.04]">
                      <Link href="/contact">Book Demo</Link>
                    </Button>
                  </div>
                </div>

                <motion.div
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ duration: 0.5, ease: 'easeOut' }}
                  className="border border-foreground/[0.12] bg-background/70 p-4"
                >
                  <p className="text-[10px] font-mono uppercase tracking-[0.18em] text-muted-foreground">Signal</p>
                  <div className="mt-3 flex items-end gap-4">
                    <p className="text-5xl font-medium leading-none tracking-tight">24/7</p>
                    <p className="pb-1 text-xs font-mono uppercase tracking-[0.12em] text-muted-foreground">reception coverage</p>
                  </div>
                </motion.div>
              </div>
            </aside>

            <main className="relative z-0 w-full overflow-x-hidden lg:w-[60%]">
              <div className="px-5 py-14 sm:px-6 lg:px-7 lg:py-16">
                <div className="space-y-10">
                  <div className="border border-foreground/[0.1] bg-card">
                    <div className="border-b border-foreground/[0.06] px-5 py-4">
                      <p className="text-[10px] font-mono uppercase tracking-[0.18em] text-muted-foreground">Live Command Stream</p>
                    </div>
                    <div className="p-5">
                      <div className="space-y-2.5">
                        {timeline.map((row) => (
                          <div key={`${row.time}-${row.event}`} className="flex items-center justify-between gap-4 border border-foreground/[0.08] bg-background/70 px-3 py-2.5">
                            <div className="min-w-0">
                              <p className="text-sm text-foreground/90">{row.event}</p>
                            </div>
                            <div className="shrink-0 text-right">
                              <p className="text-[10px] font-mono uppercase tracking-[0.12em] text-muted-foreground">{row.time}</p>
                              <p className="text-[10px] font-mono uppercase tracking-[0.12em] text-primary">{row.status}</p>
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  </div>

                  <div className="grid gap-4 lg:grid-cols-2">
                    <div className="border border-foreground/[0.1] bg-card p-5">
                      <p className="text-[10px] font-mono uppercase tracking-[0.18em] text-muted-foreground">Outcomes</p>
                      <div className="mt-4 space-y-3">
                        {outcomes.map(([label, value]) => (
                          <div key={label} className="flex items-center justify-between border border-foreground/[0.08] bg-background/70 px-3 py-2">
                            <span className="text-sm text-foreground/85">{label}</span>
                            <span className="text-lg font-medium tabular-nums">{value}</span>
                          </div>
                        ))}
                      </div>
                    </div>

                    <div className="border border-foreground/[0.1] bg-card p-5">
                      <p className="text-[10px] font-mono uppercase tracking-[0.18em] text-muted-foreground">Proof</p>
                      <blockquote className="mt-4 border border-foreground/[0.08] bg-background/70 p-4 text-sm leading-6">
                        “I can finally leave at 5 PM and still know every call is handled, routed, and tracked.”
                        <footer className="mt-3 text-[10px] font-mono uppercase tracking-[0.14em] text-muted-foreground">
                          Practice Manager · BrightSmile Dental
                        </footer>
                      </blockquote>
                    </div>
                  </div>

                  <div className="border border-foreground/[0.1] bg-card p-4">
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead className="text-[10px] font-mono uppercase tracking-[0.14em]">Metric</TableHead>
                          <TableHead className="text-[10px] font-mono uppercase tracking-[0.14em]">Traditional</TableHead>
                          <TableHead className="text-[10px] font-mono uppercase tracking-[0.14em]">Dentora</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        <TableRow>
                          <TableCell>After-hours handling</TableCell>
                          <TableCell>Voicemail</TableCell>
                          <TableCell>Live AI coverage</TableCell>
                        </TableRow>
                        <TableRow>
                          <TableCell>Booking turnaround</TableCell>
                          <TableCell>Next business day</TableCell>
                          <TableCell>In-call scheduling</TableCell>
                        </TableRow>
                        <TableRow>
                          <TableCell>Escalation clarity</TableCell>
                          <TableCell>Manual handoff</TableCell>
                          <TableCell>Policy-based routing</TableCell>
                        </TableRow>
                      </TableBody>
                    </Table>
                  </div>
                </div>
              </div>
            </main>
          </div>
        </div>
      </section>

      <TrustedClinicsMarquee />

      <section className="border-b border-foreground/[0.06] py-16 md:py-20">
        <div className="mx-auto w-full max-w-5xl px-5 sm:px-6 lg:px-7">
          <div className="text-center">
            <p className="text-[10px] font-mono uppercase tracking-[0.18em] text-muted-foreground">FAQ</p>
            <h2 className="mt-2 text-3xl font-medium tracking-tight sm:text-4xl">What clinic teams ask first</h2>
          </div>

          <div className="mt-8 space-y-3">
            {faqs.map(([q, a]) => (
              <details key={q} className="group border border-foreground/[0.1] bg-card p-4">
                <summary className="cursor-pointer list-none pr-8 text-sm font-medium">
                  {q}
                  <span className="float-right text-xs font-mono text-muted-foreground group-open:hidden">+</span>
                  <span className="float-right hidden text-xs font-mono text-muted-foreground group-open:inline">−</span>
                </summary>
                <p className="mt-3 text-sm leading-6 text-muted-foreground">{a}</p>
              </details>
            ))}
          </div>

          <div className="mt-10 flex flex-wrap justify-center gap-x-6 gap-y-2 text-xs font-mono uppercase tracking-[0.1em] text-muted-foreground">
            <p className="inline-flex items-center gap-2">
              <CheckCircle2Icon className="size-4 text-primary" />
              Setup in under 20 minutes
            </p>
            <p className="inline-flex items-center gap-2">
              <CheckCircle2Icon className="size-4 text-primary" />
              No long-term contracts
            </p>
          </div>
        </div>
      </section>
    </div>
  );
}
