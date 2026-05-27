'use client';

import { motion } from 'framer-motion';
import { BarChart3, CalendarCheck, MessageSquare, Phone, Shield } from 'lucide-react';
import { Bubble, FCard, PageHeader, d } from '@/components/marketing/shared';

export default function FeaturesPage() {
  return (
    <div className="mx-auto max-w-6xl px-6 py-20 lg:px-8">
      <PageHeader
        eyebrow="Features"
        title={
          <>
            Everything your front desk does.
            <br />
            <span className="text-[#4fc3f7]">Faster. 24/7. Never sick.</span>
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
            accent="purple"
            description="Dentora picks up every call in under a second — 24/7, no hold music, no missed patients. Human voice, real intelligence."
          >
            <div className="mt-4 space-y-2 rounded-xl border border-white/10 bg-[#111827] p-3">
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
            accent="purple"
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
                  className="rounded border border-white/10 bg-[#111827] p-1.5 text-center"
                >
                  <p className="text-[8px] text-[#c7d0d9]/50">{day}</p>
                  <div
                    className={
                      booked
                        ? 'mt-1 rounded px-1 py-0.5 text-[8px] bg-[#4fc3f7]/15 text-[#4fc3f7]'
                        : 'mt-1 rounded px-1 py-0.5 text-[8px] text-gray-300'
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
            accent="purple"
            description="Track every call, booking, and conversion with live dashboards and staff review tools."
          >
            <div
              className="mt-4 flex items-end gap-1 rounded-xl border border-white/10 bg-[#111827] p-3"
              style={{ height: 56 }}
            >
              {[38, 62, 44, 80, 54, 93, 68, 78, 52, 88].map((h, i) => (
                <div
                  key={i}
                  className="flex-1 rounded-sm bg-[#4fc3f7]/30"
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
                  className="rounded-full border border-emerald-500/20 bg-emerald-500/5 px-2 py-0.5 text-[9px] text-emerald-600"
                >
                  {b}
                </span>
              ))}
            </div>
          </FCard>
        </motion.div>
      </div>
    </div>
  );
}
