'use client';

import { motion } from 'framer-motion';
import {
  ArrowRight,
  BarChart3,
  CalendarCheck,
  CheckCircle2,
  Clock,
  MessageSquare,
  Phone,
  Play,
  Shield,
  TrendingUp,
  Users,
} from 'lucide-react';
import Link from 'next/link';
import { useEffect, useState } from 'react';
import { cn } from '@/lib/utils';

const d = (delay = 0) => ({
  initial: { opacity: 0, y: 18 },
  animate: { opacity: 1, y: 0 },
  transition: { duration: 0.5, ease: 'easeOut' as const, delay },
});

const inView = {
  initial: { opacity: 0, y: 24 },
  whileInView: { opacity: 1, y: 0 },
  viewport: { once: true, margin: '-60px' },
  transition: { duration: 0.55, ease: 'easeOut' as const },
};

const CALL_LOG = [
  { time: '14:32', phone: '+44 7700 900341', type: 'BOOK', detail: 'Checkup · Thu 15 May · 14:00' },
  { time: '14:31', phone: '+44 7891 445123', type: 'FAQ', detail: 'Insurance: BUPA accepted' },
  {
    time: '14:30',
    phone: '+44 7712 009876',
    type: 'RESCHEDULE',
    detail: 'Moved to Fri 23 May · 10:30',
  },
  {
    time: '14:29',
    phone: '+44 7900 112233',
    type: 'BOOK',
    detail: 'New patient: cleaning + checkup',
  },
  {
    time: '14:28',
    phone: '+44 7811 334455',
    type: 'EMERGENCY',
    detail: 'Same-day slot: Today 16:00',
  },
  {
    time: '14:27',
    phone: '+44 7700 556677',
    type: 'REMINDER',
    detail: 'Confirmation: patient replied YES',
  },
];

const TYPE_STYLE: Record<string, string> = {
  BOOK: 'bg-[#e0ff4f] text-black',
  FAQ: 'bg-[#b275ff]/15 text-[#8040cc]',
  RESCHEDULE: 'bg-amber-100 text-amber-700',
  EMERGENCY: 'bg-red-100 text-red-600',
  REMINDER: 'bg-emerald-100 text-emerald-700',
  CANCEL: 'bg-orange-100 text-orange-600',
};

export default function HomePage() {
  return (
    <>
      <HeroSection />
      <TrustLogos />
      <HowItWorksSection />
      <StatsSection />
      <LiveFeedSection />
      <FeaturesSection />
      <TestimonialsSection />
      <CTASection />
    </>
  );
}

/* ─── Hero ─────────────────────────────────────────────────── */
function HeroSection() {
  return (
    <section className="px-6 pb-6 pt-16 lg:px-8 lg:pt-24">
      <div className="mx-auto max-w-7xl">
        <div className="grid items-center gap-12 lg:grid-cols-2">
          {/* Left */}
          <motion.div {...d(0.05)}>
            <motion.div
              {...d(0)}
              className="mb-5 inline-flex items-center gap-2 rounded-full border border-black/10 bg-white px-4 py-2 text-sm text-gray-600"
            >
              <span className="size-2 animate-pulse rounded-full bg-[#e0ff4f]" />
              AI Receptionist for Dental Clinics · UK & Ireland
            </motion.div>

            <h1 className="font-display text-5xl font-extrabold leading-[1.05] tracking-tight text-black md:text-6xl lg:text-[4.5rem]">
              AI Receptionist
              <br />
              for Dental Clinics
            </h1>

            <p className="mt-6 max-w-lg text-lg leading-relaxed text-gray-500">
              Dentora answers every patient call, books appointments directly into your practice
              management system, and handles enquiries around the clock — so your front desk team
              can focus on in-clinic care.
            </p>

            <div className="mt-8 flex flex-wrap items-center gap-3">
              <Link
                href="/contact"
                className="inline-flex h-12 items-center gap-2 rounded-full bg-[#b275ff] px-8 text-[15px] font-medium text-white transition hover:bg-[#a060f0]"
              >
                Get started
              </Link>
              <button className="inline-flex h-12 items-center gap-3 rounded-full border border-black/10 bg-white px-6 text-[15px] font-medium text-gray-700 transition hover:bg-gray-50">
                <span className="flex size-7 shrink-0 items-center justify-center rounded-full bg-[#b275ff] text-white">
                  <Play className="ml-0.5 size-3 fill-white" />
                </span>
                Watch demo
              </button>
            </div>

            <div className="mt-8 flex flex-wrap gap-x-7 gap-y-3">
              {[
                { icon: Shield, label: 'UK GDPR Compliant' },
                { icon: Clock, label: '24/7 Availability' },
                { icon: Phone, label: '98% Answer Rate' },
              ].map(({ icon: Icon, label }) => (
                <div key={label} className="flex items-center gap-2 text-sm text-gray-500">
                  <Icon className="size-4 text-[#b275ff]" />
                  {label}
                </div>
              ))}
            </div>
          </motion.div>

          {/* Right — live call card */}
          <motion.div {...d(0.15)} className="relative">
            <div className="overflow-hidden rounded-2xl border border-black/[0.08] bg-white shadow-xl shadow-black/[0.06]">
              {/* Header */}
              <div className="flex items-center gap-3 border-b border-black/[0.06] px-5 py-4">
                <div className="flex size-9 items-center justify-center rounded-full bg-[#b275ff] text-sm font-bold text-white">
                  SJ
                </div>
                <div className="flex-1">
                  <p className="text-sm font-semibold text-black">Sarah Johnson</p>
                  <p className="text-xs text-gray-400">+44 7700 900123</p>
                </div>
                <span className="flex items-center gap-1.5 rounded-full bg-emerald-50 px-3 py-1 text-xs font-medium text-emerald-600">
                  <span className="size-1.5 animate-pulse rounded-full bg-emerald-500" />
                  LIVE
                </span>
              </div>

              {/* Chat */}
              <div className="space-y-3 p-5">
                <ChatBubble ai>Hi, this is Dentora for Pearl Dental. How can I help?</ChatBubble>
                <ChatBubble>I need to book a checkup next week.</ChatBubble>
                <ChatBubble ai>Of course! Tuesday 10am or Thursday 2pm — which works?</ChatBubble>
                <ChatBubble>Thursday 2pm please.</ChatBubble>
                <ChatBubble ai>Perfect. Booking Thursday 15 May at 2:00 PM now.</ChatBubble>
              </div>

              {/* Confirmation */}
              <div className="mx-5 mb-5 rounded-xl border border-emerald-200 bg-emerald-50 p-3">
                <div className="flex items-center gap-2">
                  <CheckCircle2 className="size-4 text-emerald-500" />
                  <span className="text-sm font-semibold text-emerald-700">
                    Appointment Confirmed
                  </span>
                </div>
                <p className="mt-0.5 text-xs text-emerald-600">Thu 15 May · 14:00 · Checkup</p>
              </div>
            </div>

            {/* Floating badge */}
            <motion.div
              initial={{ opacity: 0, x: 16 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ delay: 0.8, duration: 0.5 }}
              className="absolute -right-4 top-8 rounded-2xl border border-black/[0.08] bg-white p-3.5 shadow-lg shadow-black/[0.06]"
            >
              <div className="flex items-center gap-2.5">
                <div className="flex size-9 items-center justify-center rounded-full bg-[#b275ff]">
                  <Phone className="size-4 text-white" />
                </div>
                <div>
                  <p className="text-sm font-semibold text-black">+3 calls today</p>
                  <p className="text-xs text-gray-400">all answered &lt;1s</p>
                </div>
              </div>
            </motion.div>
          </motion.div>
        </div>
      </div>
    </section>
  );
}

function ChatBubble({ children, ai }: { children: React.ReactNode; ai?: boolean }) {
  return (
    <div className={cn('flex', ai ? 'justify-start' : 'justify-end')}>
      <div
        className={cn(
          'max-w-[80%] rounded-2xl px-4 py-2.5 text-sm',
          ai ? 'rounded-tl-sm bg-gray-100 text-gray-800' : 'rounded-tr-sm bg-[#b275ff] text-white',
        )}
      >
        {children}
      </div>
    </div>
  );
}

/* ─── Trust logos ──────────────────────────────────────────── */
function TrustLogos() {
  const clinics = [
    'Pearl Dental',
    'Oakridge Dental',
    'Brighter Smiles',
    'Riverside Dental',
    'City Dental',
  ];
  return (
    <div className="border-y border-black/[0.06] bg-white/60 py-5">
      <div className="mx-auto max-w-7xl px-6">
        <p className="mb-4 text-center text-xs font-medium uppercase tracking-widest text-gray-400">
          Trusted by dental practices across the UK & Ireland
        </p>
        <div className="flex flex-wrap items-center justify-center gap-x-10 gap-y-3">
          {clinics.map((c) => (
            <span key={c} className="text-sm font-semibold text-gray-400">
              {c}
            </span>
          ))}
        </div>
      </div>
    </div>
  );
}

/* ─── How It Works ─────────────────────────────────────────── */
function HowItWorksSection() {
  const steps = [
    {
      num: '01',
      title: 'Easy setup',
      desc: 'Connect Dentora to your phone system and practice management software.',
      badge: 'Setup',
    },
    {
      num: '02',
      title: 'Never miss a call',
      desc: 'Dentora answers, books and takes deposits 24/7.',
      badge: 'Answering',
    },
    {
      num: '03',
      title: 'Measure impact',
      desc: 'See appointments, revenue booked, and no-shows reduced.',
      badge: 'Analytics',
    },
  ];

  return (
    <section className="px-6 py-20 lg:px-8">
      <div className="mx-auto max-w-7xl">
        <div className="grid gap-6 md:grid-cols-3">
          {steps.map((step, i) => (
            <motion.div
              key={step.num}
              {...d(i * 0.1)}
              className="rounded-2xl border border-black/[0.08] bg-white p-8"
            >
              <span className="text-sm font-semibold text-gray-400">{step.num}</span>
              <h3 className="font-display mt-4 text-xl font-bold text-black">{step.title}</h3>
              <p className="mt-2 text-[15px] leading-relaxed text-gray-500">{step.desc}</p>
              <span className="mt-6 inline-flex items-center rounded-full bg-[#e0ff4f] px-3 py-1 text-xs font-semibold text-black">
                {step.badge}
              </span>
            </motion.div>
          ))}
        </div>
      </div>
    </section>
  );
}

/* ─── Stats ────────────────────────────────────────────────── */
function StatsSection() {
  return (
    <section className="px-6 pb-20 lg:px-8">
      <div className="mx-auto max-w-7xl">
        <motion.div {...inView} className="mb-10 text-center">
          <h2 className="font-display text-3xl font-bold text-black md:text-4xl">
            Capture demand. Reduce no-shows.
            <br />
            Increase chair utilisation.
          </h2>
          <p className="mt-4 text-lg text-gray-500">
            Clinics see a 15% increase in bookings when Dentora goes live.
          </p>
        </motion.div>

        <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
          {[
            { value: '98%', label: 'Calls Answered', icon: Phone },
            { value: '3×', label: 'More Bookings', icon: TrendingUp },
            { value: '45%', label: 'Fewer No-Shows', icon: CalendarCheck },
            { value: '<1s', label: 'Response Time', icon: Clock },
          ].map((s) => (
            <motion.div
              key={s.label}
              {...inView}
              className="rounded-2xl border border-black/[0.08] bg-white p-6 text-center"
            >
              <s.icon className="mx-auto mb-3 size-5 text-[#b275ff]" />
              <div className="font-display text-3xl font-extrabold text-black">{s.value}</div>
              <div className="mt-1 text-sm text-gray-500">{s.label}</div>
            </motion.div>
          ))}
        </div>
      </div>
    </section>
  );
}

/* ─── Live Call Feed ───────────────────────────────────────── */
function LiveFeedSection() {
  const [entries, setEntries] = useState(CALL_LOG);

  useEffect(() => {
    let i = CALL_LOG.length;
    const id = setInterval(() => {
      const next = CALL_LOG[i % CALL_LOG.length];
      const now = new Date();
      const ts = `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`;
      setEntries((prev) => [{ ...next, time: ts }, ...prev.slice(0, 7)]);
      i++;
    }, 2800);
    return () => clearInterval(id);
  }, []);

  return (
    <section className="px-6 py-20 lg:px-8">
      <div className="mx-auto max-w-7xl">
        <motion.div {...inView} className="mb-10 flex items-end justify-between">
          <div>
            <span className="inline-flex items-center rounded-full bg-[#e0ff4f] px-3 py-1 text-xs font-semibold text-black">
              Live
            </span>
            <h2 className="font-display mt-3 text-3xl font-bold text-black md:text-4xl">
              Handling real calls. Right now.
            </h2>
          </div>
          <span className="hidden items-center gap-2 text-sm text-gray-400 sm:flex">
            <span className="size-1.5 animate-pulse rounded-full bg-emerald-500" />
            auto-updating
          </span>
        </motion.div>

        <motion.div
          {...inView}
          className="overflow-hidden rounded-2xl border border-black/[0.08] bg-white"
        >
          <div className="grid grid-cols-12 gap-2 border-b border-black/[0.06] px-6 py-3 text-xs font-medium uppercase tracking-wide text-gray-400">
            <span className="col-span-2">Time</span>
            <span className="col-span-3">Number</span>
            <span className="col-span-2">Type</span>
            <span className="col-span-5">Detail</span>
          </div>

          <div className="divide-y divide-black/[0.04]">
            {entries.map((e, i) => (
              <div
                key={`${e.time}-${e.phone}-${i}`}
                className={cn(
                  'grid grid-cols-12 gap-2 px-6 py-3.5 text-sm',
                  i === 0 && 'bg-[#b275ff]/[0.03]',
                )}
              >
                <span className="col-span-2 text-gray-400">{e.time}</span>
                <span className="col-span-3 font-mono text-xs text-gray-500 self-center">
                  {e.phone}
                </span>
                <span className="col-span-2">
                  <span
                    className={cn(
                      'rounded-full px-2.5 py-1 text-xs font-medium',
                      TYPE_STYLE[e.type] ?? 'bg-gray-100 text-gray-600',
                    )}
                  >
                    {e.type}
                  </span>
                </span>
                <span className="col-span-5 truncate text-gray-600">{e.detail}</span>
              </div>
            ))}
          </div>
        </motion.div>
      </div>
    </section>
  );
}

/* ─── Features ─────────────────────────────────────────────── */
function FeaturesSection() {
  const features = [
    {
      icon: Phone,
      title: 'Instant Call Answering',
      desc: 'Picks up in under a second, 24/7. Natural human voice. Zero hold music.',
    },
    {
      icon: CalendarCheck,
      title: 'Smart Scheduling',
      desc: 'Books, reschedules, and cancels directly into your practice management system in real time.',
    },
    {
      icon: MessageSquare,
      title: 'Patient Q&A',
      desc: 'Insurance, pricing, directions, treatments — answered instantly from your own data.',
    },
    {
      icon: BarChart3,
      title: 'Live Analytics',
      desc: 'Track calls, bookings, and conversions with real-time dashboards.',
    },
    {
      icon: Shield,
      title: 'UK GDPR Ready',
      desc: 'AES-256 encryption, ICO audit logs, DSAR export — built for UK dental law.',
    },
    {
      icon: Users,
      title: 'Patient Reactivation',
      desc: 'Automatically follow up with lapsed patients to fill your appointment book.',
    },
  ];

  return (
    <section className="px-6 py-20 lg:px-8">
      <div className="mx-auto max-w-7xl">
        <motion.div {...inView} className="mb-10 flex items-end justify-between">
          <div>
            <h2 className="font-display text-3xl font-bold text-black md:text-4xl">
              Powerful features
            </h2>
            <p className="mt-3 text-lg text-gray-500">
              Everything your clinic needs to never miss a call again.
            </p>
          </div>
          <Link
            href="/features"
            className="hidden items-center gap-1.5 rounded-full bg-[#b275ff] px-5 py-2.5 text-sm font-medium text-white transition hover:bg-[#a060f0] sm:flex"
          >
            Get started <ArrowRight className="size-4" />
          </Link>
        </motion.div>

        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {features.map((f, i) => (
            <motion.div
              key={f.title}
              {...d(i * 0.06)}
              className="rounded-2xl border border-black/[0.08] bg-white p-7 transition hover:-translate-y-0.5 hover:shadow-md hover:shadow-black/[0.06]"
            >
              <div className="mb-4 inline-flex size-10 items-center justify-center rounded-xl bg-[#b275ff]/10">
                <f.icon className="size-5 text-[#b275ff]" />
              </div>
              <h3 className="font-display text-lg font-bold text-black">{f.title}</h3>
              <p className="mt-2 text-[15px] leading-relaxed text-gray-500">{f.desc}</p>
            </motion.div>
          ))}
        </div>
      </div>
    </section>
  );
}

/* ─── Testimonials ─────────────────────────────────────────── */
function TestimonialsSection() {
  const testimonials = [
    {
      quote:
        "Dentora has become essential to our clinic. It manages calls when we're unavailable, handles outbound comms, and patients love it. We've already recommended it to others.",
      name: 'Practice Manager',
      clinic: 'Dublin Dental Practice',
    },
    {
      quote:
        'Dentora has completely changed the way we connect with patients. Calls are never missed, patients can reach us anytime, and bookings happen seamlessly around the clock.',
      name: 'Head of IT',
      clinic: 'UK Dental Group',
    },
    {
      quote:
        'It integrates seamlessly with our cloud-based practice management software. It has given us the flexibility to handle calls and bookings out of hours, while improving appointment confirmations.',
      name: 'Practice Owner',
      clinic: 'Three Site Dental Group',
    },
  ];

  return (
    <section className="px-6 py-20 lg:px-8">
      <div className="mx-auto max-w-7xl">
        <motion.div {...inView} className="mb-10 text-center">
          <h2 className="font-display text-3xl font-bold text-black md:text-4xl">
            Success stories
          </h2>
          <p className="mt-3 text-lg text-gray-500">
            Trusted by single site, multi-site and DSOs across the UK and Ireland.
          </p>
        </motion.div>

        <div className="grid gap-6 md:grid-cols-3">
          {testimonials.map((t, i) => (
            <motion.div
              key={t.clinic}
              {...d(i * 0.1)}
              className="rounded-2xl border border-black/[0.08] bg-white p-7"
            >
              <p className="text-[15px] leading-relaxed text-gray-600">&ldquo;{t.quote}&rdquo;</p>
              <div className="mt-6">
                <p className="text-sm font-semibold text-black">{t.name}</p>
                <p className="text-sm text-gray-400">{t.clinic}</p>
              </div>
            </motion.div>
          ))}
        </div>
      </div>
    </section>
  );
}

/* ─── CTA ──────────────────────────────────────────────────── */
function CTASection() {
  return (
    <section className="px-6 pb-24 pt-8 lg:px-8">
      <motion.div
        {...inView}
        className="mx-auto max-w-4xl overflow-hidden rounded-3xl bg-[#b275ff] p-12 text-center"
      >
        <h2 className="font-display text-4xl font-extrabold text-white md:text-5xl">
          Let Dentora answer.
          <br />
          You focus on smiles.
        </h2>
        <p className="mx-auto mt-4 max-w-md text-lg text-white/75">
          Works with your existing calendar and phone number. No hardware. First 14 days free.
        </p>

        <div className="mt-8 flex flex-wrap items-center justify-center gap-4">
          <Link
            href="/contact"
            className="inline-flex h-12 items-center gap-2 rounded-full bg-[#e0ff4f] px-8 text-[15px] font-semibold text-black transition hover:bg-[#d4f030]"
          >
            Book a Free Demo <ArrowRight className="size-4" />
          </Link>
          <Link
            href="/pricing"
            className="inline-flex h-12 items-center gap-2 rounded-full border border-white/30 px-8 text-[15px] font-medium text-white transition hover:bg-white/10"
          >
            View pricing
          </Link>
        </div>

        <div className="mt-8 flex flex-wrap items-center justify-center gap-6 text-sm text-white/60">
          {['No credit card', 'Setup in 15 min', 'Cancel anytime'].map((t) => (
            <span key={t} className="flex items-center gap-2">
              <CheckCircle2 className="size-4 text-[#e0ff4f]" />
              {t}
            </span>
          ))}
        </div>
      </motion.div>
    </section>
  );
}
