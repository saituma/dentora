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
  Sparkles,
  TrendingUp,
  Users,
} from 'lucide-react';
import Link from 'next/link';
import { useEffect, useState } from 'react';
import { cn } from '@/lib/utils';

/* ──────────────────────────────────────────────────────────────
   Motion — easing + durations extracted by designlang from Linear
   (cubic-bezier(0.25, 0.46, 0.45, 0.94), 120/180/420ms, ease-out).
   ────────────────────────────────────────────────────────────── */
const EASE = [0.25, 0.46, 0.45, 0.94] as const;
const SPRING_EASE = [0.22, 1, 0.36, 1] as const;

const rise = (delay = 0) => ({
  initial: { opacity: 0, y: 20 },
  animate: { opacity: 1, y: 0 },
  transition: { duration: 0.55, ease: EASE, delay },
});

const inView = (delay = 0) => ({
  initial: { opacity: 0, y: 24 },
  whileInView: { opacity: 1, y: 0 },
  viewport: { once: true, margin: '-80px' },
  transition: { duration: 0.6, ease: EASE, delay },
});

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
  BOOK: 'bg-sky-500/12 text-sky-600 ring-1 ring-inset ring-sky-500/25',
  FAQ: 'bg-cyan-500/12 text-cyan-600 ring-1 ring-inset ring-cyan-500/20',
  RESCHEDULE: 'bg-amber-500/12 text-amber-600 ring-1 ring-inset ring-amber-500/20',
  EMERGENCY: 'bg-red-500/12 text-red-600 ring-1 ring-inset ring-red-500/20',
  REMINDER: 'bg-emerald-500/12 text-emerald-600 ring-1 ring-inset ring-emerald-500/20',
  CANCEL: 'bg-orange-500/12 text-orange-600 ring-1 ring-inset ring-orange-500/20',
};

const ACCENT_TEXT = 'bg-gradient-to-r from-[#22a6e2] to-[#0a6aa3] bg-clip-text text-transparent';
const NUM_TEXT = 'bg-gradient-to-b from-[#2bb0ef] to-[#0a6aa3] bg-clip-text text-transparent';

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
    <section className="relative isolate overflow-hidden px-6 pb-10 pt-14 lg:px-8 lg:pt-24">
      {/* Ambient depth: grid texture + sky-tinted glows */}
      <div className="pointer-events-none absolute inset-0 -z-10">
        <div className="mk-grid mk-fade-edges absolute inset-0" />
        <div className="mk-glow mk-glow-primary mk-animate-breathe left-1/2 top-[-12%] size-[640px] -translate-x-1/2" />
        <div className="mk-glow mk-glow-secondary absolute right-[8%] top-[28%] size-[360px]" />
      </div>

      <div className="mx-auto max-w-7xl">
        <div className="grid items-center gap-14 lg:grid-cols-[1.05fr_0.95fr]">
          {/* Left */}
          <motion.div {...rise(0.05)} className="relative z-10">
            <motion.div
              {...rise(0)}
              className="mk-chip mb-6 inline-flex items-center gap-2 rounded-full px-4 py-1.5 text-sm mk-body"
            >
              <span className="relative flex size-2">
                <span className="absolute inline-flex size-full animate-ping rounded-full bg-[#4fc3f7] opacity-60" />
                <span className="relative inline-flex size-2 rounded-full bg-[#4fc3f7]" />
              </span>
              AI Receptionist for Dental Clinics · UK & Ireland
            </motion.div>

            <h1 className="font-display text-[2.75rem] font-bold leading-[1.04] tracking-[-0.03em] mk-heading sm:text-6xl lg:text-[4.5rem]">
              Never miss another
              <br />
              <span className={ACCENT_TEXT}>patient call.</span>
            </h1>

            <p className="mt-6 max-w-xl text-lg leading-relaxed mk-muted">
              Dentora answers every call, books appointments straight into your practice management
              system, and handles patient questions around the clock — so your front desk can focus
              on the people in the chair.
            </p>

            <div className="mt-9 flex flex-wrap items-center gap-3">
              <Link
                href="/contact"
                className="mk-btn-primary inline-flex h-12 items-center gap-2 rounded-full px-7 text-[15px] font-semibold"
              >
                Book a free demo
                <ArrowRight className="size-4" />
              </Link>
              <button className="mk-btn-ghost inline-flex h-12 items-center gap-3 rounded-full px-5 text-[15px] font-medium">
                <span className="flex size-7 shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-[#2bb0ef] to-[#0a84c9] text-white">
                  <Play className="ml-0.5 size-3 fill-current" />
                </span>
                Watch 2-min demo
              </button>
            </div>

            <div className="mt-10 flex flex-wrap gap-x-7 gap-y-3">
              {[
                { icon: Shield, label: 'UK GDPR Compliant' },
                { icon: Clock, label: '24/7 Availability' },
                { icon: Phone, label: '98% Answer Rate' },
              ].map(({ icon: Icon, label }) => (
                <div key={label} className="flex items-center gap-2 text-sm mk-muted">
                  <Icon className="size-4 text-[#0a84c9]" />
                  {label}
                </div>
              ))}
            </div>
          </motion.div>

          {/* Right — live call card */}
          <motion.div {...rise(0.18)} className="relative z-0">
            <div className="mk-panel mk-animate-float overflow-hidden rounded-3xl">
              {/* Header */}
              <div className="flex items-center gap-3 border-b border-[var(--mk-hairline)] px-5 py-4">
                <div className="flex size-10 items-center justify-center rounded-full bg-gradient-to-br from-[#4fc3f7] to-[#0284c7] text-sm font-bold text-white shadow-lg shadow-[#4fc3f7]/25">
                  SJ
                </div>
                <div className="flex-1">
                  <p className="text-sm font-semibold mk-heading">Sarah Johnson</p>
                  <p className="text-xs mk-faint">+44 7700 900123</p>
                </div>
                <span className="flex items-center gap-1.5 rounded-full bg-emerald-500/12 px-3 py-1 text-xs font-medium text-emerald-600 ring-1 ring-inset ring-emerald-500/25">
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
              <div className="mx-5 mb-5 rounded-2xl border border-emerald-500/25 bg-emerald-500/[0.08] p-3.5">
                <div className="flex items-center gap-2">
                  <CheckCircle2 className="size-4 text-emerald-600" />
                  <span className="text-sm font-semibold text-emerald-700">
                    Appointment Confirmed
                  </span>
                </div>
                <p className="mt-0.5 text-xs text-emerald-600">Thu 15 May · 14:00 · Checkup</p>
              </div>
            </div>

            {/* Floating badge */}
            <motion.div
              initial={{ opacity: 0, x: 20, y: 8 }}
              animate={{ opacity: 1, x: 0, y: 0 }}
              transition={{ delay: 0.9, duration: 0.5, ease: SPRING_EASE }}
              className="mk-panel-soft absolute -right-3 top-10 rounded-2xl p-3.5 sm:-right-6"
            >
              <div className="flex items-center gap-2.5">
                <div className="flex size-9 items-center justify-center rounded-full bg-gradient-to-br from-[#4fc3f7] to-[#0284c7]">
                  <Phone className="size-4 text-white" />
                </div>
                <div>
                  <p className="text-sm font-semibold mk-heading">+3 calls today</p>
                  <p className="text-xs mk-faint">all answered &lt;1s</p>
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
          'max-w-[80%] rounded-2xl px-4 py-2.5 text-sm leading-relaxed',
          ai
            ? 'mk-inset rounded-tl-sm mk-body'
            : 'rounded-tr-sm bg-gradient-to-br from-[#2bb0ef] to-[#0a84c9] text-white shadow-md shadow-[#4fc3f7]/20',
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
    <div className="relative">
      <div className="mk-hairline mx-auto max-w-7xl" />
      <div className="mx-auto max-w-7xl px-6 py-9">
        <p className="mb-5 text-center text-xs font-medium uppercase tracking-[0.18em] mk-faint">
          Trusted by dental practices across the UK & Ireland
        </p>
        <div className="flex flex-wrap items-center justify-center gap-x-10 gap-y-3">
          {clinics.map((c) => (
            <span
              key={c}
              className="text-sm font-semibold mk-faint transition-colors hover:text-[var(--mk-body)]"
            >
              {c}
            </span>
          ))}
        </div>
      </div>
      <div className="mk-hairline mx-auto max-w-7xl" />
    </div>
  );
}

/* ─── Section heading helper ───────────────────────────────── */
function SectionHeading({
  eyebrow,
  title,
  subtitle,
  align = 'center',
}: {
  eyebrow?: string;
  title: React.ReactNode;
  subtitle?: string;
  align?: 'center' | 'left';
}) {
  return (
    <div className={cn('max-w-2xl', align === 'center' ? 'mx-auto text-center' : 'text-left')}>
      {eyebrow && (
        <span className="mk-chip mb-4 inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-medium uppercase tracking-wider mk-accent">
          <Sparkles className="size-3" />
          {eyebrow}
        </span>
      )}
      <h2 className="font-display text-3xl font-bold leading-[1.1] tracking-[-0.025em] mk-heading md:text-[2.5rem]">
        {title}
      </h2>
      {subtitle && <p className="mt-4 text-lg leading-relaxed mk-muted">{subtitle}</p>}
    </div>
  );
}

/* ─── How It Works ─────────────────────────────────────────── */
function HowItWorksSection() {
  const steps = [
    {
      num: '01',
      title: 'Easy setup',
      desc: 'Connect Dentora to your phone system and practice management software in minutes.',
      badge: 'Setup',
    },
    {
      num: '02',
      title: 'Never miss a call',
      desc: 'Dentora answers, books and takes deposits 24/7 — in a warm, natural voice.',
      badge: 'Answering',
    },
    {
      num: '03',
      title: 'Measure impact',
      desc: 'See appointments booked, revenue captured, and no-shows reduced — live.',
      badge: 'Analytics',
    },
  ];

  return (
    <section className="px-6 py-24 lg:px-8">
      <div className="mx-auto max-w-7xl">
        <motion.div {...inView()}>
          <SectionHeading
            eyebrow="How it works"
            title="Live in a day. Working from minute one."
            subtitle="No hardware, no rip-and-replace. Dentora layers onto the phone number and calendar you already use."
          />
        </motion.div>

        <div className="relative mt-14 grid gap-5 md:grid-cols-3">
          <div className="mk-hairline absolute left-0 right-0 top-[42px] hidden md:block" />
          {steps.map((step, i) => (
            <motion.div
              key={step.num}
              {...inView(i * 0.1)}
              className="mk-panel mk-lift relative rounded-3xl p-7"
            >
              <div className="mk-icon-tile flex size-12 items-center justify-center rounded-2xl font-display text-lg font-bold mk-accent">
                {step.num}
              </div>
              <h3 className="font-display mt-5 text-xl font-bold mk-heading">{step.title}</h3>
              <p className="mt-2 text-[15px] leading-relaxed mk-muted">{step.desc}</p>
              <span className="mt-6 inline-flex items-center rounded-full bg-[#4fc3f7]/10 px-3 py-1 text-xs font-semibold mk-accent ring-1 ring-inset ring-[#4fc3f7]/20">
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
    <section className="px-6 pb-24 lg:px-8">
      <div className="mx-auto max-w-7xl">
        <motion.div {...inView()} className="mb-12">
          <SectionHeading
            title={
              <>
                Capture demand. Reduce no-shows.
                <br />
                Fill every chair.
              </>
            }
            subtitle="Clinics see a 15% lift in bookings within weeks of Dentora going live."
          />
        </motion.div>

        <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
          {[
            { value: '98%', label: 'Calls answered', icon: Phone },
            { value: '3×', label: 'More bookings', icon: TrendingUp },
            { value: '45%', label: 'Fewer no-shows', icon: CalendarCheck },
            { value: '<1s', label: 'Response time', icon: Clock },
          ].map((s, i) => (
            <motion.div
              key={s.label}
              {...inView(i * 0.08)}
              className="mk-panel mk-lift rounded-3xl p-6 text-center"
            >
              <div className="mk-icon-tile mx-auto mb-4 flex size-10 items-center justify-center rounded-xl">
                <s.icon className="size-5 text-[#0a84c9]" />
              </div>
              <div className={cn('font-display text-4xl font-extrabold', NUM_TEXT)}>{s.value}</div>
              <div className="mt-1.5 text-sm mk-muted">{s.label}</div>
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
    <section className="px-6 py-24 lg:px-8">
      <div className="mx-auto max-w-7xl">
        <motion.div {...inView()} className="mb-10 flex flex-wrap items-end justify-between gap-4">
          <SectionHeading align="left" eyebrow="Live" title="Handling real calls. Right now." />
          <span className="hidden items-center gap-2 text-sm mk-faint sm:flex">
            <span className="size-1.5 animate-pulse rounded-full bg-emerald-500" />
            auto-updating
          </span>
        </motion.div>

        <motion.div {...inView(0.1)} className="mk-panel overflow-hidden rounded-3xl">
          {/* Desktop header */}
          <div className="hidden grid-cols-12 gap-2 border-b border-[var(--mk-hairline)] px-6 py-3 text-xs font-medium uppercase tracking-wide mk-faint sm:grid">
            <span className="col-span-2">Time</span>
            <span className="col-span-3">Number</span>
            <span className="col-span-2">Type</span>
            <span className="col-span-5">Detail</span>
          </div>

          <div>
            {entries.map((e, i) => (
              <div
                key={`${e.time}-${e.phone}-${i}`}
                className={cn(
                  'border-t border-[var(--mk-hairline)] transition-colors first:border-t-0',
                  i === 0 && 'bg-[#4fc3f7]/[0.05]',
                )}
              >
                {/* Mobile card */}
                <div className="flex items-start justify-between gap-3 px-4 py-3 sm:hidden">
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <span
                        className={cn(
                          'shrink-0 rounded-full px-2 py-0.5 text-[10px] font-medium',
                          TYPE_STYLE[e.type] ?? 'mk-inset mk-body',
                        )}
                      >
                        {e.type}
                      </span>
                      <span className="truncate text-xs mk-body">{e.detail}</span>
                    </div>
                    <p className="mt-1 font-mono text-[10px] mk-faint">{e.phone}</p>
                  </div>
                  <span className="shrink-0 text-xs mk-faint">{e.time}</span>
                </div>
                {/* Desktop row */}
                <div className="hidden grid-cols-12 gap-2 px-6 py-3.5 text-sm sm:grid">
                  <span className="col-span-2 self-center mk-faint">{e.time}</span>
                  <span className="col-span-3 self-center font-mono text-xs mk-muted">
                    {e.phone}
                  </span>
                  <span className="col-span-2 self-center">
                    <span
                      className={cn(
                        'rounded-full px-2.5 py-1 text-xs font-medium',
                        TYPE_STYLE[e.type] ?? 'mk-inset mk-body',
                      )}
                    >
                      {e.type}
                    </span>
                  </span>
                  <span className="col-span-5 self-center truncate mk-body">{e.detail}</span>
                </div>
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
      title: 'Instant call answering',
      desc: 'Picks up in under a second, 24/7. Natural human voice. Zero hold music.',
    },
    {
      icon: CalendarCheck,
      title: 'Smart scheduling',
      desc: 'Books, reschedules and cancels directly into your practice management system in real time.',
    },
    {
      icon: MessageSquare,
      title: 'Patient Q&A',
      desc: 'Insurance, pricing, directions, treatments — answered instantly from your own data.',
    },
    {
      icon: BarChart3,
      title: 'Live analytics',
      desc: 'Track calls, bookings and conversions with real-time dashboards.',
    },
    {
      icon: Shield,
      title: 'UK GDPR ready',
      desc: 'AES-256 encryption, ICO audit logs, DSAR export — built for UK dental law.',
    },
    {
      icon: Users,
      title: 'Patient reactivation',
      desc: 'Automatically follow up with lapsed patients to fill your appointment book.',
    },
  ];

  return (
    <section className="px-6 py-24 lg:px-8">
      <div className="mx-auto max-w-7xl">
        <motion.div {...inView()} className="mb-12 flex flex-wrap items-end justify-between gap-6">
          <SectionHeading
            align="left"
            eyebrow="Features"
            title="Everything your front desk wishes it had."
          />
          <Link
            href="/features"
            className="mk-btn-ghost hidden items-center gap-1.5 rounded-full px-5 py-2.5 text-sm font-medium sm:inline-flex"
          >
            Explore all features <ArrowRight className="size-4" />
          </Link>
        </motion.div>

        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {features.map((f, i) => (
            <motion.div
              key={f.title}
              {...inView(i * 0.06)}
              className="mk-panel mk-lift group rounded-3xl p-7"
            >
              <div className="mk-icon-tile mb-5 inline-flex size-11 items-center justify-center rounded-2xl">
                <f.icon className="size-5 text-[#0a84c9] transition-transform duration-300 group-hover:scale-110" />
              </div>
              <h3 className="font-display text-lg font-bold mk-heading">{f.title}</h3>
              <p className="mt-2 text-[15px] leading-relaxed mk-muted">{f.desc}</p>
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
      initials: 'PM',
    },
    {
      quote:
        'Dentora has completely changed the way we connect with patients. Calls are never missed, patients can reach us anytime, and bookings happen seamlessly around the clock.',
      name: 'Head of IT',
      clinic: 'UK Dental Group',
      initials: 'IT',
    },
    {
      quote:
        'It integrates seamlessly with our cloud-based practice management software, giving us the flexibility to handle calls and bookings out of hours while improving confirmations.',
      name: 'Practice Owner',
      clinic: 'Three Site Dental Group',
      initials: 'PO',
    },
  ];

  return (
    <section className="px-6 py-24 lg:px-8">
      <div className="mx-auto max-w-7xl">
        <motion.div {...inView()} className="mb-12">
          <SectionHeading
            eyebrow="Loved by clinics"
            title="Trusted from single sites to DSOs."
            subtitle="Across the UK and Ireland, teams rely on Dentora to be the voice that never misses a patient."
          />
        </motion.div>

        <div className="grid gap-5 md:grid-cols-3">
          {testimonials.map((t, i) => (
            <motion.div
              key={t.clinic}
              {...inView(i * 0.1)}
              className="mk-panel-soft mk-lift flex flex-col rounded-3xl p-7"
            >
              <div className="mb-4 flex gap-0.5 text-[#0a84c9]">
                {Array.from({ length: 5 }).map((_, s) => (
                  <Sparkles key={s} className="size-3.5 fill-current" />
                ))}
              </div>
              <p className="flex-1 text-[15px] leading-relaxed mk-body">&ldquo;{t.quote}&rdquo;</p>
              <div className="mt-6 flex items-center gap-3 border-t border-[var(--mk-hairline)] pt-5">
                <div className="flex size-10 items-center justify-center rounded-full bg-gradient-to-br from-[#4fc3f7] to-[#0284c7] text-xs font-bold text-white">
                  {t.initials}
                </div>
                <div>
                  <p className="text-sm font-semibold mk-heading">{t.name}</p>
                  <p className="text-sm mk-faint">{t.clinic}</p>
                </div>
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
    <section className="px-6 pb-28 pt-8 lg:px-8">
      <motion.div
        {...inView()}
        className="relative isolate mx-auto max-w-5xl overflow-hidden rounded-[2rem] bg-gradient-to-br from-[#4fc3f7] via-[#2aa9ec] to-[#0284c7] p-8 text-center shadow-2xl shadow-[#0284c7]/25 sm:p-14"
      >
        {/* Layered premium background */}
        <div className="mk-grid mk-fade-edges absolute inset-0 -z-10 opacity-30" />
        <div className="pointer-events-none absolute -left-10 -top-10 -z-10 size-72 rounded-full bg-white/25 blur-3xl" />
        <div className="pointer-events-none absolute -bottom-12 -right-8 -z-10 size-72 rounded-full bg-[#0b3a5c]/30 blur-3xl" />

        <span className="mb-5 inline-flex items-center gap-1.5 rounded-full bg-white/20 px-3 py-1 text-xs font-semibold uppercase tracking-wider text-white ring-1 ring-inset ring-white/30 backdrop-blur-sm">
          <Sparkles className="size-3" /> Get started
        </span>
        <h2 className="font-display text-4xl font-extrabold leading-[1.05] tracking-[-0.02em] text-white md:text-5xl">
          Let Dentora answer.
          <br />
          You focus on smiles.
        </h2>
        <p className="mx-auto mt-5 max-w-md text-lg text-white/90">
          Works with your existing calendar and phone number. No hardware. First 14 days free.
        </p>

        <div className="mt-9 flex flex-wrap items-center justify-center gap-3">
          <Link
            href="/contact"
            className="inline-flex h-12 items-center gap-2 rounded-full bg-white px-8 text-[15px] font-semibold text-[#0a4a72] shadow-lg shadow-black/15 transition hover:bg-white/90"
          >
            Book a free demo <ArrowRight className="size-4" />
          </Link>
          <Link
            href="/pricing"
            className="inline-flex h-12 items-center gap-2 rounded-full border border-white/60 bg-white/10 px-8 text-[15px] font-medium text-white backdrop-blur-sm transition hover:bg-white/20"
          >
            View pricing
          </Link>
        </div>

        <div className="mt-9 flex flex-wrap items-center justify-center gap-x-6 gap-y-2 text-sm text-white/90">
          {['No credit card', 'Setup in 15 min', 'Cancel anytime'].map((t) => (
            <span key={t} className="flex items-center gap-2">
              <CheckCircle2 className="size-4 text-white" />
              {t}
            </span>
          ))}
        </div>
      </motion.div>
    </section>
  );
}
