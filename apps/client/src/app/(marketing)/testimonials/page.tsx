'use client';

import { motion } from 'framer-motion';
import { ArrowRight, Star } from 'lucide-react';
import Link from 'next/link';
import {
  MarketingStyles,
  PageHeader,
  TerminalWindow,
  AsciiWaveform,
  d,
  inView,
} from '@/components/marketing/shared';

const reviews = [
  {
    quote:
      "We used to miss 30% of calls during busy periods. Now it's zero. Dentora pays for itself in the first week.",
    name: 'Dr. Jessica Miller',
    practice: 'Smile Dental Care, London',
    initials: 'JM',
    metric: '0% missed calls',
  },
  {
    quote:
      "Patients can't tell it's AI. That's the part that still amazes me — completely natural every time.",
    name: 'Dr. Mark Reynolds',
    practice: 'Oakridge Dental, Manchester',
    initials: 'MR',
    metric: '100% patient satisfaction',
  },
  {
    quote:
      'No-shows dropped 45% in three months. The automated reminders alone are worth the subscription.',
    name: 'Dr. Amanda Lee',
    practice: 'Brighter Smiles, Birmingham',
    initials: 'AL',
    metric: '45% fewer no-shows',
  },
  {
    quote:
      "Setup took 10 minutes. By end of day it had booked 4 new patients we'd normally have missed.",
    name: 'Dr. Paul Nduka',
    practice: 'Summit Ridge Dental, Leeds',
    initials: 'PN',
    metric: '4 patients day one',
  },
  {
    quote:
      'Our receptionist now focuses entirely on patients in the chair. The AI handles everything else.',
    name: 'Practice Manager Sarah',
    practice: 'Pearl Dental Care, Bristol',
    initials: 'SM',
    metric: '50% admin time saved',
  },
  {
    quote:
      'The voice is indistinguishable from a human. We get compliments from patients about how helpful the call was.',
    name: 'Dr. Priya Sharma',
    practice: 'Sunshine Dental Group, Edinburgh',
    initials: 'PS',
    metric: 'Human-quality voice',
  },
];

export default function TestimonialsPage() {
  return (
    <>
      <MarketingStyles />
      <div className="mx-auto max-w-6xl px-6 py-20 lg:px-8">
        <PageHeader
          eyebrow="// testimonials"
          title={
            <>
              Loved by dental teams
              <br />
              <span className="bg-gradient-to-r from-blue-400 to-blue-500 bg-clip-text text-transparent">
                across the UK.
              </span>
            </>
          }
          subtitle="Real results from real practices. No cherry-picking."
        />

        {/* Stats strip */}
        <motion.div {...inView} className="mb-14">
          <TerminalWindow title="dentora@ai:~ — aggregate_stats">
            <div className="grid grid-cols-2 divide-x divide-y divide-white/[0.05] md:grid-cols-4 md:divide-y-0 font-mono">
              {[
                { value: '94,000+', label: 'calls_handled' },
                { value: '98%', label: 'answer_rate' },
                { value: '4.9 / 5', label: 'avg_patient_rating' },
                { value: '£2.1M', label: 'revenue_recovered' },
              ].map((s) => (
                <div key={s.label} className="px-6 py-5 text-center">
                  <p className="text-2xl font-bold text-blue-400">{s.value}</p>
                  <p className="mt-1 text-[10px] text-white/30">{s.label}</p>
                </div>
              ))}
            </div>
          </TerminalWindow>
        </motion.div>

        {/* Review grid */}
        <div className="grid gap-5 md:grid-cols-2 lg:grid-cols-3">
          {reviews.map((r, i) => (
            <motion.div
              key={r.name}
              {...d(i * 0.08)}
              className="flex flex-col rounded-2xl border border-white/[0.07] bg-white/[0.02] p-6"
            >
              {/* Stars */}
              <div className="mb-3 flex gap-0.5">
                {Array.from({ length: 5 }).map((_, j) => (
                  <Star key={j} className="size-3.5 fill-yellow-400 text-yellow-400" />
                ))}
              </div>

              {/* Metric badge */}
              <span className="mb-4 inline-block self-start rounded-full border border-blue-500/20 bg-blue-500/8 px-2.5 py-0.5 font-mono text-[10px] text-blue-400">
                {r.metric}
              </span>

              <p className="flex-1 text-sm leading-relaxed text-gray-300">
                &ldquo;{r.quote}&rdquo;
              </p>

              <div className="mt-6 flex items-center gap-3 border-t border-white/[0.06] pt-5">
                <div className="flex size-9 shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-blue-400 to-blue-600 text-xs font-bold text-white">
                  {r.initials}
                </div>
                <div>
                  <p className="text-sm font-semibold text-white">{r.name}</p>
                  <p className="text-xs text-gray-500">{r.practice}</p>
                </div>
              </div>
            </motion.div>
          ))}
        </div>

        {/* CTA */}
        <motion.div {...inView} className="mt-16 text-center">
          <AsciiWaveform bars={50} className="mb-6 text-base text-blue-400/20" />
          <p className="mb-6 text-gray-400">Ready to join them?</p>
          <Link
            href="/contact"
            className="inline-flex h-12 items-center gap-2 rounded-full bg-blue-600 px-8 text-sm font-semibold text-white shadow-lg shadow-blue-600/20 transition hover:bg-blue-500"
          >
            Book your free demo <ArrowRight className="size-4" />
          </Link>
        </motion.div>
      </div>
    </>
  );
}
