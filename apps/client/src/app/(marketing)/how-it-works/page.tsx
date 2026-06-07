'use client';

import { motion } from 'framer-motion';
import { ArrowRight, CheckCircle2 } from 'lucide-react';
import Link from 'next/link';
import { PageHeader, d, inView } from '@/components/marketing/shared';

const steps = [
  {
    number: '01',
    title: 'We Answer',
    desc: 'Every call answered in under a second, 24/7. A natural human voice picks up — patients never know the difference. No hold music. No voicemail.',
    outputs: [
      'Incoming call detected',
      'Voice AI connected in 0.8s',
      'Patient greeted: "Good morning, Pearl Dental…"',
    ],
  },
  {
    number: '02',
    title: 'We Understand',
    desc: 'Our AI identifies what the patient needs — booking, reschedule, FAQ, emergency — and handles it end-to-end without a script tree.',
    outputs: [
      'Intent detected: BOOK_APPOINTMENT',
      'Type: routine checkup · 1 person',
      'Checking calendar availability…',
      'Slots found: Tue 10:00, Thu 14:00',
    ],
  },
  {
    number: '03',
    title: 'We Confirm',
    desc: 'The appointment lands in your calendar. The patient gets a confirmation. Your team gets a full call summary. Nothing falls through the cracks.',
    outputs: [
      'Slot reserved: Thu 15 May 14:00',
      'Google Calendar updated',
      'Patient SMS confirmation sent',
      'Staff summary generated',
    ],
  },
];

export default function HowItWorksPage() {
  return (
    <div className="mx-auto max-w-6xl px-6 py-20 lg:px-8">
      <PageHeader
        eyebrow="How It Works"
        title="Set up in minutes. Works forever."
        subtitle="Dentora plugs into your existing calendar and phone number. No hardware, no training, no scripts."
      />

      {/* Steps */}
      <div className="space-y-6">
        {steps.map((step, i) => (
          <motion.div
            key={step.number}
            {...d(i * 0.12)}
            className="mk-panel mk-lift overflow-hidden rounded-3xl"
          >
            <div className="grid gap-0 md:grid-cols-2">
              {/* Output panel */}
              <div className="border-b border-[var(--mk-hairline)] bg-[var(--mk-inset-bg)] p-6 md:border-b-0 md:border-r md:border-[var(--mk-hairline)]">
                <p className="mb-1 text-xs font-medium uppercase tracking-wider mk-accent">
                  Step {step.number}
                </p>
                <p className="mb-4 font-display text-lg font-bold mk-heading">{step.title}</p>
                <div className="space-y-2">
                  {step.outputs.map((line, j) => (
                    <motion.div
                      key={line}
                      initial={{ opacity: 0, x: -8 }}
                      whileInView={{ opacity: 1, x: 0 }}
                      transition={{ delay: 0.2 + j * 0.12 }}
                      viewport={{ once: true }}
                      className="flex items-center gap-2 text-sm mk-body"
                    >
                      <CheckCircle2 className="size-3.5 shrink-0 mk-accent" />
                      {line}
                    </motion.div>
                  ))}
                </div>
              </div>

              {/* Human explanation */}
              <div className="flex flex-col justify-center p-8">
                <p className="text-sm leading-relaxed mk-muted">{step.desc}</p>
              </div>
            </div>
          </motion.div>
        ))}
      </div>

      {/* Integration note */}
      <motion.div {...inView} className="mt-10">
        <div className="mk-panel rounded-3xl p-6">
          <p className="mb-4 text-sm font-semibold mk-heading">
            Integrates with your existing tools
          </p>
          <div className="grid gap-3 sm:grid-cols-2 md:grid-cols-4">
            {[
              { name: 'Google Calendar', status: 'connected' },
              { name: 'Twilio Voice', status: 'connected' },
              { name: 'ElevenLabs AI', status: 'connected' },
              { name: 'SMS Notifications', status: 'active' },
            ].map(({ name, status }) => (
              <div
                key={name}
                className="flex items-center justify-between rounded-xl mk-inset px-3 py-2.5"
              >
                <span className="text-xs font-medium mk-body">{name}</span>
                <span className="flex items-center gap-1 text-[10px] text-emerald-600">
                  <span className="size-1.5 animate-pulse rounded-full bg-emerald-400" />
                  {status}
                </span>
              </div>
            ))}
          </div>
        </div>
      </motion.div>

      {/* CTA */}
      <motion.div {...inView} className="mt-14 text-center">
        <Link
          href="/contact"
          className="mk-btn-primary inline-flex h-12 items-center gap-2 rounded-full px-8 text-sm font-semibold"
        >
          Get Dentora for your practice <ArrowRight className="size-4" />
        </Link>
      </motion.div>
    </div>
  );
}
