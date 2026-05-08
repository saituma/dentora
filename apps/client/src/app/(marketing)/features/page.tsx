'use client';

import {
  PhoneIcon,
  CalendarIcon,
  FileTextIcon,
  PlugIcon,
  BarChart3Icon,
  ShieldIcon,
} from 'lucide-react';
import { motion } from 'framer-motion';
import type { ReactNode } from 'react';

const fadeUp = {
  initial: { opacity: 0, y: 24 },
  whileInView: { opacity: 1, y: 0 },
  viewport: { once: true },
  transition: { duration: 0.7, ease: [0.32, 0.72, 0, 1] as const },
};

function BentoCard({
  children,
  span = '',
}: {
  children: ReactNode;
  span?: string;
}) {
  return (
    <motion.div
      {...fadeUp}
      className={`group relative rounded-3xl border border-white/[0.08] bg-[#0f1424]/80 p-1.5 shadow-sm transition-shadow hover:shadow-lg hover:shadow-blue-500/5 ${span}`}
    >
      <div className="relative flex h-full flex-col overflow-hidden rounded-[calc(1.5rem-6px)] border border-white/[0.06] bg-gradient-to-br from-[#0f1424] to-[#0a0e1a] p-6">
        <div className="absolute inset-0 bg-gradient-to-br from-transparent to-blue-500/[0.02] pointer-events-none" />
        <div className="relative z-10">{children}</div>
      </div>
    </motion.div>
  );
}

const features = [
  {
    icon: PhoneIcon,
    title: '24/7 Call Handling',
    description:
      'AI answers every call, day or night. Captures leads and books appointments when your front desk is busy or closed.',
  },
  {
    icon: CalendarIcon,
    title: 'Appointment Booking',
    description:
      'Checks availability in real time. Books, reschedules, and cancels appointments with natural conversation.',
  },
  {
    icon: FileTextIcon,
    title: 'Knowledge Base',
    description:
      'Upload your services, pricing, and FAQs. The AI references your clinic-specific data for accurate answers.',
  },
  {
    icon: PlugIcon,
    title: 'Integrations',
    description:
      'Connects with Google Calendar, Outlook, and practice management systems. Syncs seamlessly.',
  },
  {
    icon: BarChart3Icon,
    title: 'Analytics',
    description:
      'Track missed call capture rate, call-to-booking conversion, revenue recovered, and more.',
  },
  {
    icon: ShieldIcon,
    title: 'HIPAA Compliant',
    description:
      'Built for healthcare. Data encrypted, access controlled, and designed for compliance.',
  },
];

export default function FeaturesPage() {
  return (
    <div className="mx-auto w-full max-w-7xl px-4 py-24 sm:px-6 lg:px-8">
      <motion.div {...fadeUp} className="mx-auto max-w-3xl text-center">
        <p className="mb-3 text-sm font-semibold uppercase tracking-widest text-blue-400">FEATURES</p>
        <h1 className="text-4xl font-bold text-white md:text-5xl">Everything You Need</h1>
        <p className="mt-4 text-lg text-gray-400">
          A complete AI receptionist solution for dental practices
        </p>
      </motion.div>

      <div className="mx-auto mt-16 grid max-w-5xl gap-4 md:grid-cols-2 lg:grid-cols-6">
        {features.map((f, i) => (
          <BentoCard key={f.title} span={i < 2 ? 'lg:col-span-3' : 'lg:col-span-2'}>
            <div className="mb-4 flex size-12 items-center justify-center rounded-xl bg-blue-500/10">
              <f.icon className="size-6 text-blue-400" />
            </div>
            <h3 className="mb-2 text-sm font-semibold text-white">{f.title}</h3>
            <p className="text-xs leading-relaxed text-gray-400">{f.description}</p>
          </BentoCard>
        ))}
      </div>
    </div>
  );
}
