'use client';

import { motion } from 'framer-motion';
import { ArrowRight, Star } from 'lucide-react';
import Link from 'next/link';
import { PageHeader, d, inView } from '@/components/marketing/shared';

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
    <div className="mx-auto max-w-6xl px-6 py-20 lg:px-8">
      <PageHeader
        eyebrow="Testimonials"
        title={
          <>
            Loved by dental teams
            <br />
            <span className="mk-accent">across the UK.</span>
          </>
        }
        subtitle="Real results from real practices. No cherry-picking."
      />

      {/* Stats strip */}
      <motion.div {...inView} className="mb-14">
        <div className="mk-panel grid grid-cols-2 divide-x divide-y divide-[var(--mk-hairline)] overflow-hidden rounded-3xl md:grid-cols-4 md:divide-y-0">
          {[
            { value: '94,000+', label: 'Calls handled' },
            { value: '98%', label: 'Answer rate' },
            { value: '4.9 / 5', label: 'Avg patient rating' },
            { value: '£2.1M', label: 'Revenue recovered' },
          ].map((s) => (
            <div key={s.label} className="px-6 py-6 text-center">
              <p className="font-display bg-gradient-to-r from-[#2bb0ef] to-[#0a6aa3] bg-clip-text text-2xl font-bold text-transparent">
                {s.value}
              </p>
              <p className="mt-1 text-xs mk-muted">{s.label}</p>
            </div>
          ))}
        </div>
      </motion.div>

      {/* Review grid */}
      <div className="grid gap-5 md:grid-cols-2 lg:grid-cols-3">
        {reviews.map((r, i) => (
          <motion.div
            key={r.name}
            {...d(i * 0.08)}
            className="mk-panel mk-lift flex flex-col rounded-3xl p-7"
          >
            {/* Stars */}
            <div className="mb-3 flex gap-0.5">
              {Array.from({ length: 5 }).map((_, j) => (
                <Star key={j} className="size-3.5 fill-[#4fc3f7] mk-accent" />
              ))}
            </div>

            {/* Metric badge */}
            <span className="mb-4 inline-block self-start rounded-full border border-[#4fc3f7]/25 bg-[#4fc3f7]/10 px-2.5 py-0.5 text-[10px] font-medium mk-accent">
              {r.metric}
            </span>

            <p className="flex-1 text-[15px] leading-relaxed mk-body">&ldquo;{r.quote}&rdquo;</p>

            <div className="mt-6 flex items-center gap-3 border-t border-[var(--mk-hairline)] pt-5">
              <div className="flex size-9 shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-[#4fc3f7] to-[#0284c7] text-xs font-bold text-white">
                {r.initials}
              </div>
              <div>
                <p className="text-sm font-semibold mk-heading">{r.name}</p>
                <p className="text-xs mk-muted">{r.practice}</p>
              </div>
            </div>
          </motion.div>
        ))}
      </div>

      {/* CTA */}
      <motion.div {...inView} className="mt-16 text-center">
        <p className="mb-6 mk-muted">Ready to join them?</p>
        <Link
          href="/contact"
          className="mk-btn-primary inline-flex h-12 items-center gap-2 rounded-full px-8 text-sm font-semibold"
        >
          Book your free demo <ArrowRight className="size-4" />
        </Link>
      </motion.div>
    </div>
  );
}
