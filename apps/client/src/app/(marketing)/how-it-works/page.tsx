'use client';

import { motion } from 'framer-motion';
import { ArrowRight } from 'lucide-react';
import Link from 'next/link';
import {
  MarketingStyles,
  PageHeader,
  TerminalWindow,
  AsciiWaveform,
  d,
  inView,
} from '@/components/marketing/shared';

const steps = [
  {
    cmd: 'dentora --answer',
    output: [
      'Incoming call detected',
      'Voice AI connected in 0.8s',
      'Patient greeted: "Good morning, Pearl Dental…"',
    ],
    title: '01 — We Answer',
    desc: 'Every call answered in under a second, 24/7. A natural human voice picks up — patients never know the difference. No hold music. No voicemail.',
  },
  {
    cmd: 'dentora --understand',
    output: [
      'Intent detected: BOOK_APPOINTMENT',
      'Type: routine checkup · 1 person',
      'Checking calendar availability…',
      'Slots found: Tue 10:00, Thu 14:00',
    ],
    title: '02 — We Understand',
    desc: 'Our AI identifies what the patient needs — booking, reschedule, FAQ, emergency — and handles it end-to-end without a script tree.',
  },
  {
    cmd: 'dentora --confirm',
    output: [
      'Slot reserved: Thu 15 May 14:00',
      'Google Calendar updated ✓',
      'Patient SMS confirmation sent ✓',
      'Staff summary generated ✓',
    ],
    title: '03 — We Confirm',
    desc: 'The appointment lands in your calendar. The patient gets a confirmation. Your team gets a full call summary. Nothing falls through the cracks.',
  },
];

export default function HowItWorksPage() {
  return (
    <>
      <MarketingStyles />
      <div className="mx-auto max-w-6xl px-6 py-20 lg:px-8">
        <PageHeader
          eyebrow="// how_it_works"
          title="Set up in minutes. Works forever."
          subtitle="Dentora plugs into your existing calendar and phone number. No hardware, no training, no scripts."
        />

        {/* Steps */}
        <div className="space-y-6">
          {steps.map((step, i) => (
            <motion.div key={step.cmd} {...d(i * 0.12)}>
              <TerminalWindow title={`step_${i + 1}_of_3.sh`} scanline={i === 0}>
                <div className="grid gap-0 md:grid-cols-2">
                  {/* Terminal output */}
                  <div className="border-b border-white/[0.06] p-6 md:border-b-0 md:border-r">
                    <p className="mb-4 font-mono text-[12px]">
                      <span className="text-white/25">$</span>{' '}
                      <span className="text-blue-400">{step.cmd}</span>
                    </p>
                    <div className="space-y-2">
                      {step.output.map((line, j) => (
                        <motion.p
                          key={line}
                          initial={{ opacity: 0, x: -8 }}
                          whileInView={{ opacity: 1, x: 0 }}
                          transition={{ delay: 0.2 + j * 0.12 }}
                          viewport={{ once: true }}
                          className="font-mono text-[12px] text-green-400/70"
                        >
                          <span className="mr-2 text-white/20">▸</span>
                          {line}
                        </motion.p>
                      ))}
                    </div>
                  </div>

                  {/* Human explanation */}
                  <div className="flex flex-col justify-center p-8">
                    <h2 className="mb-3 font-mono text-lg font-bold text-white">{step.title}</h2>
                    <p className="font-sans text-sm leading-relaxed text-gray-400">{step.desc}</p>
                  </div>
                </div>
              </TerminalWindow>
            </motion.div>
          ))}
        </div>

        {/* Integration note */}
        <motion.div {...inView} className="mt-10">
          <TerminalWindow title="dentora@ai:~ — integrations">
            <div className="p-6 font-mono text-[12px]">
              <p className="mb-3 text-white/25">$ dentora integrations list</p>
              <div className="grid gap-2 sm:grid-cols-2 md:grid-cols-4">
                {[
                  { name: 'Google Calendar', status: 'connected' },
                  { name: 'Twilio Voice', status: 'connected' },
                  { name: 'ElevenLabs AI', status: 'connected' },
                  { name: 'SMS Notifications', status: 'active' },
                ].map(({ name, status }) => (
                  <div
                    key={name}
                    className="rounded-lg border border-white/[0.06] bg-white/[0.02] p-3"
                  >
                    <p className="text-[10px] text-white/60">{name}</p>
                    <p className="mt-1 text-[10px] text-green-400">● {status}</p>
                  </div>
                ))}
              </div>
            </div>
          </TerminalWindow>
        </motion.div>

        {/* CTA */}
        <motion.div {...inView} className="mt-14 text-center">
          <AsciiWaveform bars={50} className="mb-6 text-base text-blue-400/20" />
          <Link
            href="/contact"
            className="inline-flex h-12 items-center gap-2 rounded-full bg-blue-600 px-8 text-sm font-semibold text-white shadow-lg shadow-blue-600/20 transition hover:bg-blue-500"
          >
            Get Dentora for your practice <ArrowRight className="size-4" />
          </Link>
        </motion.div>
      </div>
    </>
  );
}
