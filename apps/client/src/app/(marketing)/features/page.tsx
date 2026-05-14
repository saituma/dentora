'use client';

import { motion } from 'framer-motion';
import { BarChart3, CalendarCheck, MessageSquare, Phone, Shield } from 'lucide-react';
import {
  AsciiWaveform,
  Bubble,
  FCard,
  MarketingStyles,
  PageHeader,
  d,
} from '@/components/marketing/shared';

export default function FeaturesPage() {
  return (
    <>
      <MarketingStyles />
      <div className="mx-auto max-w-6xl px-6 py-20 lg:px-8">
        <PageHeader
          eyebrow="// features"
          title={
            <>
              Everything your front desk does.
              <br />
              <span className="bg-gradient-to-r from-blue-400 to-blue-500 bg-clip-text text-transparent">
                Faster. 24/7. Never sick.
              </span>
            </>
          }
          subtitle="One AI receptionist that handles calls, bookings, and patient questions — so your team can focus on care."
        />

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {/* Wide — call answering */}
          <motion.div {...d(0)} className="sm:col-span-2">
            <FCard
              icon={Phone}
              title="Instant Call Answering"
              accent="blue"
              description="Dentora picks up every call in under a second — 24/7, no hold music, no missed patients. Human voice, real intelligence."
            >
              <div className="mt-4 space-y-2 rounded-xl border border-white/[0.06] bg-black/30 p-3 font-mono">
                {[
                  { ai: true, t: 'Good morning, Pearl Dental. How can I help?' },
                  { ai: false, t: 'I need to book a filling — is Dr. Smith free?' },
                  { ai: true, t: 'I can book you Wednesday at 11am. Shall I confirm?' },
                ].map((l) => (
                  <Bubble key={l.t} ai={l.ai} text={l.t} />
                ))}
              </div>
            </FCard>
          </motion.div>

          {/* Smart booking */}
          <motion.div {...d(0.06)}>
            <FCard
              icon={CalendarCheck}
              title="Smart Scheduling"
              accent="blue"
              description="Books directly into your calendar in real time. Google Calendar sync, conflict detection, instant patient confirmation."
            >
              <div className="mt-4 grid grid-cols-3 gap-1">
                {[
                  { day: 'MON', booked: false },
                  { day: 'TUE', booked: true },
                  { day: 'WED', booked: false },
                  { day: 'THU', booked: true },
                  { day: 'FRI', booked: true },
                  { day: 'SAT', booked: false },
                ].map(({ day, booked }) => (
                  <div
                    key={day}
                    className="rounded border border-white/[0.05] bg-black/20 p-1.5 text-center font-mono"
                  >
                    <p className="text-[8px] text-white/25">{day}</p>
                    <div
                      className={
                        booked
                          ? 'mt-1 rounded px-1 py-0.5 text-[8px] bg-blue-600/20 text-blue-300'
                          : 'mt-1 rounded px-1 py-0.5 text-[8px] text-white/15'
                      }
                    >
                      {booked ? 'FULL' : 'OPEN'}
                    </div>
                  </div>
                ))}
              </div>
            </FCard>
          </motion.div>

          {/* Patient Q&A */}
          <motion.div {...d(0.1)}>
            <FCard
              icon={MessageSquare}
              title="Patient Q&A"
              accent="purple"
              description="Answers insurance questions, pricing, directions, and treatment FAQs instantly. Trained on your clinic's own data."
            />
          </motion.div>

          {/* Analytics */}
          <motion.div {...d(0.14)}>
            <FCard
              icon={BarChart3}
              title="Call Analytics"
              accent="blue"
              description="Track every call, booking, and conversion with live dashboards and staff review tools."
            >
              <div
                className="mt-4 flex items-end gap-1 rounded-xl border border-white/[0.06] bg-black/30 p-3"
                style={{ height: 56 }}
              >
                {[38, 62, 44, 80, 54, 93, 68, 78, 52, 88].map((h, i) => (
                  <div
                    key={i}
                    className="flex-1 rounded-sm bg-blue-500/30"
                    style={{ height: `${h}%` }}
                  />
                ))}
              </div>
            </FCard>
          </motion.div>

          {/* GDPR */}
          <motion.div {...d(0.18)}>
            <FCard
              icon={Shield}
              title="UK GDPR Compliant"
              accent="green"
              description="AES-256-GCM encryption at rest. ICO-ready audit logs. DSAR export. Built specifically for UK dental practices."
            >
              <div className="mt-4 flex flex-wrap gap-1.5">
                {['UK GDPR', 'ICO', 'AES-256', 'Audit Logs', 'DSAR'].map((b) => (
                  <span
                    key={b}
                    className="rounded-full border border-green-500/20 bg-green-500/5 px-2 py-0.5 font-mono text-[9px] text-green-400"
                  >
                    {b}
                  </span>
                ))}
              </div>
            </FCard>
          </motion.div>
        </div>

        {/* Waveform footer */}
        <div className="mt-20 rounded-2xl border border-white/[0.06] bg-[#060a12] p-8 text-center">
          <p className="mb-4 font-mono text-[11px] text-white/20">{'// voice_ai.waveform'}</p>
          <AsciiWaveform bars={60} className="text-xl text-blue-400/30" />
        </div>
      </div>
    </>
  );
}
