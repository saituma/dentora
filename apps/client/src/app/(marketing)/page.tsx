'use client';

import { motion, AnimatePresence } from 'framer-motion';
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
  X,
} from 'lucide-react';
import Link from 'next/link';
import { useEffect, useState } from 'react';
import { cn } from '@/lib/utils';
import TextMarque from '@/components/ui/text-marque';
import {
  AsciiWaveform,
  Bubble,
  Cursor,
  FCard,
  GlitchHeadline,
  LiveTicker,
  MarketingStyles,
  TerminalWindow,
  d,
  inView,
} from '@/components/marketing/shared';

/* ─── Statics ─────────────────────────────────────────────── */
const TOOTH = `
     ╭────────╮
    ╭┤ ██  ██ ├╮
    ││ ██  ██ ││
    ╰┤  ████  ├╯
     ╰────────╯
        │  │
       ╭┘  └╮
      ╭╯    ╰╮
      │      │
      ╰──────╯`;

const CALL_LOG: { time: string; phone: string; type: string; detail: string; ms: number }[] = [
  {
    time: '14:32:01',
    phone: '+44 7700 900341',
    type: 'BOOK',
    detail: 'Checkup · Thu 15 May · 14:00',
    ms: 1240,
  },
  {
    time: '14:31:47',
    phone: '+44 7891 445123',
    type: 'FAQ',
    detail: 'Insurance: BUPA accepted',
    ms: 880,
  },
  {
    time: '14:30:12',
    phone: '+44 7712 009876',
    type: 'RESCHEDULE',
    detail: 'Moved to Fri 23 May · 10:30',
    ms: 1560,
  },
  {
    time: '14:29:55',
    phone: '+44 7900 112233',
    type: 'BOOK',
    detail: 'New patient: cleaning + checkup',
    ms: 1820,
  },
  {
    time: '14:28:33',
    phone: '+44 7811 334455',
    type: 'EMERGENCY',
    detail: 'Same-day slot: Today 16:00',
    ms: 740,
  },
  {
    time: '14:27:19',
    phone: '+44 7700 556677',
    type: 'REMINDER',
    detail: 'Confirmation: patient replied YES',
    ms: 320,
  },
  {
    time: '14:26:08',
    phone: '+44 7809 998877',
    type: 'BOOK',
    detail: 'Hygiene · Fri 23 May · 09:00',
    ms: 1100,
  },
  {
    time: '14:25:41',
    phone: '+44 7723 445566',
    type: 'FAQ',
    detail: 'Directions + parking info sent',
    ms: 450,
  },
  {
    time: '14:24:30',
    phone: '+44 7800 223344',
    type: 'CANCEL',
    detail: 'Cancelled + slot re-opened',
    ms: 670,
  },
  {
    time: '14:23:12',
    phone: '+44 7891 667788',
    type: 'BOOK',
    detail: 'Filling consult · Mon 19 May',
    ms: 1390,
  },
];

const TYPE_COLOR: Record<string, string> = {
  BOOK: 'text-blue-400',
  FAQ: 'text-purple-400',
  RESCHEDULE: 'text-yellow-400',
  EMERGENCY: 'text-red-400',
  REMINDER: 'text-green-400',
  CANCEL: 'text-orange-400',
};

/* ─── Page ────────────────────────────────────────────────── */
export default function HomePage() {
  return (
    <>
      <MarketingStyles />
      <LiveTicker />
      <HeroSection />
      <StatsSection />
      <TextMarque
        delay={300}
        baseVelocity={-0.8}
        scrollDependent
        clasname="py-5 font-mono font-bold tracking-[-0.04em] leading-none text-white/[0.05]"
      >
        SMILE_DENTAL_CARE · OAKRIDGE_DENTAL · PEARL_DENTAL · BRIGHTER_SMILES · SUMMIT_RIDGE ·
        SUNSHINE_DENTAL · NORDIC_DENTAL · RIVERSIDE_SMILES · CITY_DENTAL ·
      </TextMarque>
      <LiveFeedSection />
      <FeatureTeaserSection />
      <ComparisonSection />
      <CTASection />
    </>
  );
}

/* ─── Hero ────────────────────────────────────────────────── */
function HeroSection() {
  return (
    <section className="relative overflow-hidden">
      <div className="pointer-events-none absolute -top-40 left-1/2 h-[700px] w-[900px] -translate-x-1/2 rounded-full bg-blue-600/8 blur-[120px]" />
      <pre className="pointer-events-none absolute right-4 top-4 select-none font-mono text-[0.55rem] leading-tight text-white/[0.025] blur-[0.3px] lg:right-16 lg:text-[0.7rem]">
        {TOOTH}
      </pre>

      <div className="mx-auto max-w-7xl px-6 pb-14 pt-14 lg:px-8 lg:pt-20">
        <div className="grid items-start gap-12 lg:grid-cols-2">
          {/* Left */}
          <motion.div {...d(0.05)}>
            <h1 className="text-5xl font-bold leading-[1.05] tracking-[-0.035em] text-white md:text-6xl lg:text-[4.5rem]">
              Your AI Receptionist.
              <br />
              <span className="bg-gradient-to-r from-blue-400 via-blue-500 to-blue-600 bg-clip-text text-transparent">
                <GlitchHeadline>Always Answering.</GlitchHeadline>
              </span>
            </h1>

            <p className="mt-6 max-w-md text-lg leading-relaxed text-gray-400">
              Dentora handles every patient call, books appointments, and answers questions — 24/7,
              in a natural human voice your team never has to manage.
            </p>

            <div className="mt-8 flex flex-wrap items-center gap-3">
              <Link
                href="/contact"
                className="inline-flex h-11 items-center gap-2 rounded-full bg-blue-600 px-7 text-sm font-semibold text-white shadow-lg shadow-blue-600/20 transition hover:bg-blue-500"
              >
                Book a Demo <ArrowRight className="size-4" />
              </Link>
              <button className="inline-flex h-11 items-center gap-3 rounded-full border border-white/10 bg-white/[0.04] px-6 text-sm font-medium text-white transition hover:bg-white/[0.08]">
                <span className="flex size-7 shrink-0 items-center justify-center rounded-full border border-white/20 bg-white/5">
                  <Play className="ml-0.5 size-2.5 fill-white" />
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
                <div key={label} className="flex items-center gap-2 text-xs text-gray-400">
                  <Icon className="size-3.5 text-blue-400" />
                  {label}
                </div>
              ))}
            </div>

            {/* Mini status terminal */}
            <motion.div {...d(0.22)} className="mt-10">
              <TerminalWindow title="dentora@ai:~ — status" className="max-w-sm text-[11px]">
                <div className="space-y-1.5 p-4 text-green-400/80">
                  <p>
                    <span className="text-white/30">$</span> dentora status
                  </p>
                  <p className="text-white/20">────────────────────────</p>
                  <p>
                    AI model <span className="float-right text-green-400">● online</span>
                  </p>
                  <p>
                    Voice engine <span className="float-right text-green-400">● online</span>
                  </p>
                  <p>
                    Calendar sync <span className="float-right text-green-400">● active</span>
                  </p>
                  <p>
                    Calls active <span className="float-right text-blue-400">3</span>
                  </p>
                  <p className="text-white/20">────────────────────────</p>
                  <p>
                    <span className="text-white/30">$</span> <Cursor />
                  </p>
                </div>
              </TerminalWindow>
            </motion.div>
          </motion.div>

          {/* Right — live call terminal */}
          <motion.div {...d(0.15)} className="relative">
            <TerminalWindow title="dentora@ai:~ — live call" scanline className="text-[11px]">
              <div className="flex items-center gap-3 border-b border-white/[0.06] p-4">
                <div className="flex size-9 items-center justify-center rounded-full bg-gradient-to-br from-blue-400 to-blue-600 text-xs font-bold text-white">
                  SJ
                </div>
                <div className="flex-1">
                  <p className="text-xs font-semibold text-white">Sarah Johnson</p>
                  <p className="text-[10px] text-white/30">+44 7700 900123</p>
                </div>
                <span className="flex items-center gap-1.5 rounded-full bg-green-500/10 px-2.5 py-1 text-[10px] text-green-400">
                  <span className="size-1.5 animate-pulse rounded-full bg-green-400" />
                  LIVE
                </span>
              </div>

              <div className="grid grid-cols-5">
                <div className="col-span-3 space-y-3 border-r border-white/[0.06] p-4">
                  <Bubble ai text="Hi, this is Dentora for Pearl Dental. How can I help?" />
                  <Bubble text="I need to book a checkup next week." />
                  <Bubble ai text="Of course! Tuesday 10am or Thursday 2pm — which works?" />
                  <Bubble text="Thursday 2pm please." />
                  <Bubble ai text="Perfect. Booking Thursday 15 May at 2:00 PM now..." />
                  <div className="flex items-center gap-2 pt-1">
                    <div className="h-px flex-1 bg-white/[0.04]" />
                    <AsciiWaveform bars={18} className="text-[10px] text-blue-400/50" />
                    <div className="h-px flex-1 bg-white/[0.04]" />
                  </div>
                </div>

                <div className="col-span-2 space-y-2.5 p-3">
                  <div className="rounded-lg border border-white/[0.06] bg-white/[0.03] p-2.5">
                    <p className="mb-1.5 text-[9px] uppercase tracking-widest text-white/25">
                      Intent
                    </p>
                    <div className="flex items-center gap-1.5">
                      <CalendarCheck className="size-3 text-blue-400" />
                      <span className="text-[10px] text-white">Book Appointment</span>
                    </div>
                    <p className="mt-0.5 text-[9px] text-white/30">Checkup · 1 person</p>
                  </div>

                  <div className="rounded-lg border border-white/[0.06] bg-white/[0.03] p-2.5">
                    <p className="mb-1.5 text-[9px] uppercase tracking-widest text-white/25">
                      Slots
                    </p>
                    {[
                      { t: 'Tue 10:00 AM', sel: false },
                      { t: 'Thu 2:00 PM', sel: true },
                    ].map(({ t, sel }) => (
                      <div
                        key={t}
                        className={cn(
                          'mb-1 rounded px-2 py-1 text-[9px]',
                          sel ? 'bg-blue-600/20 text-blue-300' : 'text-white/25',
                        )}
                      >
                        {sel ? `▶ ${t}` : `  ${t}`}
                      </div>
                    ))}
                  </div>

                  <div className="rounded-lg border border-green-500/20 bg-green-500/5 p-2.5">
                    <div className="flex items-center gap-1">
                      <CheckCircle2 className="size-3 text-green-400" />
                      <span className="text-[9px] font-semibold text-green-400">CONFIRMED</span>
                    </div>
                    <p className="mt-0.5 text-[9px] text-white/40">Thu 15 May · 14:00</p>
                  </div>

                  <div className="text-center font-mono text-[9px] text-white/20">
                    call duration 00:01:34
                  </div>
                </div>
              </div>
            </TerminalWindow>

            <motion.div
              initial={{ opacity: 0, x: 16 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ delay: 1, duration: 0.5 }}
              className="absolute -right-3 top-6 z-10 rounded-xl border border-white/10 bg-[#0d1220]/90 p-3 font-mono text-[10px] shadow-xl backdrop-blur-md"
            >
              <div className="flex items-center gap-2">
                <div className="flex size-7 items-center justify-center rounded-full bg-blue-600">
                  <Phone className="size-3 text-white" />
                </div>
                <div>
                  <p className="text-white">+3 calls today</p>
                  <p className="text-white/35">all answered &lt;1s</p>
                </div>
              </div>
            </motion.div>
          </motion.div>
        </div>
      </div>
    </section>
  );
}

/* ─── Stats + waveform ────────────────────────────────────── */
function StatsSection() {
  return (
    <section className="relative overflow-hidden border-y border-white/[0.05] bg-[#060a12] py-14">
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_at_center,rgba(37,99,235,0.08),transparent_70%)]" />
      <div className="mx-auto max-w-7xl px-6 lg:px-8">
        <div className="mb-6 flex items-center justify-between font-mono text-[11px]">
          <span className="text-white/20">{'// voice_ai.waveform — realtime'}</span>
          <span className="flex items-center gap-2 text-green-400/60">
            <span className="size-1.5 animate-pulse rounded-full bg-green-400" />
            STREAMING
          </span>
        </div>
        <AsciiWaveform
          bars={80}
          className="text-center text-2xl tracking-tight text-blue-400/40 md:text-3xl"
        />
        <div className="mt-10 grid grid-cols-2 gap-4 md:grid-cols-4">
          {[
            { value: '98%', label: 'calls_answered', color: 'text-blue-400' },
            { value: '3×', label: 'more_bookings', color: 'text-purple-400' },
            { value: '45%', label: 'fewer_no_shows', color: 'text-cyan-400' },
            { value: '<1s', label: 'response_time', color: 'text-green-400' },
          ].map((s) => (
            <div
              key={s.label}
              className="rounded-xl border border-white/[0.06] bg-white/[0.02] p-5 text-center font-mono"
            >
              <div className={cn('text-3xl font-bold', s.color)}>{s.value}</div>
              <div className="mt-1 text-[11px] text-white/30">{s.label}</div>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

/* ─── Live Call Feed ──────────────────────────────────────── */
function LiveFeedSection() {
  const [entries, setEntries] = useState(CALL_LOG.slice(0, 6));

  useEffect(() => {
    let i = 6;
    const id = setInterval(() => {
      const next = CALL_LOG[i % CALL_LOG.length];
      const now = new Date();
      const ts = `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}:${String(now.getSeconds()).padStart(2, '0')}`;
      setEntries((prev) => [{ ...next, time: ts }, ...prev.slice(0, 7)]);
      i++;
    }, 2800);
    return () => clearInterval(id);
  }, []);

  return (
    <section className="py-20">
      <div className="mx-auto max-w-6xl px-6 lg:px-8">
        <motion.div {...inView} className="mb-10 flex items-end justify-between">
          <div>
            <p className="mb-2 font-mono text-[11px] uppercase tracking-widest text-blue-400">
              {'// live_call_log'}
            </p>
            <h2 className="text-2xl font-bold tracking-tight text-white md:text-3xl">
              Handling real calls. Right now.
            </h2>
          </div>
          <span className="hidden items-center gap-2 font-mono text-[11px] text-green-400/60 sm:flex">
            <span className="size-1.5 animate-pulse rounded-full bg-green-400" />
            auto-updating
          </span>
        </motion.div>

        <motion.div {...inView}>
          <TerminalWindow title="dentora@ai:~ — call_log --live --follow -n 8">
            {/* Table header */}
            <div className="grid grid-cols-12 gap-2 border-b border-white/[0.06] px-4 py-2 font-mono text-[10px] text-white/20">
              <span className="col-span-2">TIME</span>
              <span className="col-span-3">NUMBER</span>
              <span className="col-span-2">TYPE</span>
              <span className="col-span-4">DETAIL</span>
              <span className="col-span-1 text-right">MS</span>
            </div>

            <div className="divide-y divide-white/[0.04]">
              <AnimatePresence initial={false}>
                {entries.map((e, i) => (
                  <motion.div
                    key={`${e.time}-${e.phone}`}
                    initial={{ opacity: 0, y: -12, backgroundColor: 'rgba(59,130,246,0.08)' }}
                    animate={{ opacity: 1, y: 0, backgroundColor: 'rgba(0,0,0,0)' }}
                    transition={{ duration: 0.4 }}
                    className={cn(
                      'grid grid-cols-12 gap-2 px-4 py-2.5 font-mono text-[11px]',
                      i === 0 ? 'bg-blue-500/5' : '',
                    )}
                  >
                    <span className="col-span-2 text-white/30">{e.time}</span>
                    <span className="col-span-3 text-white/50">{e.phone}</span>
                    <span
                      className={cn(
                        'col-span-2 font-semibold',
                        TYPE_COLOR[e.type] ?? 'text-white/60',
                      )}
                    >
                      {e.type}
                    </span>
                    <span className="col-span-4 truncate text-white/60">{e.detail}</span>
                    <span className="col-span-1 text-right text-white/25">{e.ms}</span>
                  </motion.div>
                ))}
              </AnimatePresence>
            </div>

            <div className="border-t border-white/[0.05] px-4 py-2 font-mono text-[10px] text-white/20">
              <Cursor /> new entries appear automatically
            </div>
          </TerminalWindow>
        </motion.div>
      </div>
    </section>
  );
}

/* ─── Feature Teaser ──────────────────────────────────────── */
function FeatureTeaserSection() {
  const features = [
    {
      icon: Phone,
      title: 'Instant Call Answering',
      desc: 'Picks up in under a second, 24/7. Natural human voice. Zero hold music.',
      accent: 'blue' as const,
    },
    {
      icon: CalendarCheck,
      title: 'Smart Scheduling',
      desc: 'Books, reschedules, and cancels directly into your Google Calendar in real time.',
      accent: 'blue' as const,
    },
    {
      icon: MessageSquare,
      title: 'Patient Q&A',
      desc: 'Insurance, pricing, directions, treatments — answered instantly from your own data.',
      accent: 'purple' as const,
    },
    {
      icon: BarChart3,
      title: 'Live Analytics',
      desc: 'Track calls, bookings, and conversions with real-time dashboards.',
      accent: 'blue' as const,
    },
    {
      icon: Shield,
      title: 'UK GDPR Ready',
      desc: 'AES-256 encryption, ICO audit logs, DSAR export — built for UK dental law.',
      accent: 'green' as const,
    },
  ];

  return (
    <section className="py-20">
      <div className="mx-auto max-w-6xl px-6 lg:px-8">
        <motion.div {...inView} className="mb-10 flex items-end justify-between">
          <div>
            <p className="mb-2 font-mono text-[11px] uppercase tracking-widest text-blue-400">
              {'// features'}
            </p>
            <h2 className="text-2xl font-bold tracking-tight text-white md:text-3xl">
              Built for dental. Every detail.
            </h2>
          </div>
          <Link
            href="/features"
            className="hidden items-center gap-1 text-sm text-blue-400 transition hover:text-blue-300 sm:flex"
          >
            See all <ArrowRight className="size-3.5" />
          </Link>
        </motion.div>

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {features.map((f, i) => (
            <motion.div
              key={f.title}
              {...d(i * 0.07)}
              className={i === 0 ? 'sm:col-span-2 lg:col-span-2' : ''}
            >
              <FCard {...f} description={f.desc} />
            </motion.div>
          ))}
        </div>

        <motion.div {...inView} className="mt-6 text-center sm:hidden">
          <Link href="/features" className="inline-flex items-center gap-1 text-sm text-blue-400">
            See all features <ArrowRight className="size-3.5" />
          </Link>
        </motion.div>
      </div>
    </section>
  );
}

/* ─── Comparison ──────────────────────────────────────────── */
function ComparisonSection() {
  const rows = [
    { bad: 'Missed calls go to voicemail', good: 'Every call answered in < 1 second' },
    { bad: 'Staff overwhelmed at front desk', good: 'Team focuses entirely on patient care' },
    { bad: 'Manual appointment booking', good: 'Auto-booked into Google Calendar' },
    { bad: 'No-shows with no warning', good: '45% fewer no-shows with smart reminders' },
    { bad: 'Closed evenings & weekends', good: 'Answering calls 24 / 7 / 365' },
    { bad: 'Inconsistent patient information', good: 'Accurate answers from your own data' },
  ];

  return (
    <section className="py-20">
      <div className="mx-auto max-w-5xl px-6 lg:px-8">
        <motion.div {...inView} className="mb-10 text-center">
          <p className="mb-2 font-mono text-[11px] uppercase tracking-widest text-blue-400">
            {'// diff --before --after'}
          </p>
          <h2 className="text-2xl font-bold tracking-tight text-white md:text-3xl">
            Before Dentora vs. After.
          </h2>
        </motion.div>

        <motion.div {...inView}>
          <TerminalWindow title="dentora@ai:~ — diff before.txt after.txt">
            {/* Header */}
            <div className="grid grid-cols-2 border-b border-white/[0.07] font-mono text-[11px]">
              <div className="flex items-center gap-2 border-r border-white/[0.07] px-5 py-3 text-red-400/70">
                <X className="size-3" /> without dentora
              </div>
              <div className="flex items-center gap-2 px-5 py-3 text-green-400/70">
                <CheckCircle2 className="size-3" /> with dentora
              </div>
            </div>

            <div className="divide-y divide-white/[0.04] font-mono text-[11px]">
              {rows.map((row, i) => (
                <motion.div key={row.bad} {...d(i * 0.06)} className="grid grid-cols-2">
                  <div className="flex items-start gap-2 border-r border-white/[0.05] px-5 py-3 text-red-400/50">
                    <span className="mt-0.5 shrink-0 text-red-500">─</span>
                    {row.bad}
                  </div>
                  <div className="flex items-start gap-2 px-5 py-3 text-green-400/70">
                    <span className="mt-0.5 shrink-0 text-green-400">+</span>
                    {row.good}
                  </div>
                </motion.div>
              ))}
            </div>

            <div className="border-t border-white/[0.05] px-5 py-3 font-mono text-[10px] text-white/20">
              6 lines changed · 0 insertions(─) · 6 improvements(+)
            </div>
          </TerminalWindow>
        </motion.div>
      </div>
    </section>
  );
}

/* ─── CTA ─────────────────────────────────────────────────── */
function CTASection() {
  return (
    <section className="px-6 pb-24 pt-8 lg:px-8">
      <motion.div {...inView} className="mx-auto max-w-5xl">
        <TerminalWindow title="dentora@ai:~ — get_started" scanline>
          <div className="p-10 text-center">
            <pre className="mb-8 select-none font-mono text-[0.5rem] leading-tight text-blue-400/15 md:text-[0.6rem]">
              {`  ╭──╮  ╭──╮  ╭──╮  ╭──╮  ╭──╮  ╭──╮  ╭──╮  ╭──╮
  │  │  │  │  │  │  │  │  │  │  │  │  │  │  │  │  │
  ╰──╯  ╰──╯  ╰──╯  ╰──╯  ╰──╯  ╰──╯  ╰──╯  ╰──╯
         D  E  N  T  O  R  A  .  A  I`}
            </pre>

            <div className="mb-4 font-mono text-[11px] text-green-400/50">
              <span className="text-white/20">$</span> dentora --start-trial --practice=
              <span className="text-blue-400">&quot;your-clinic&quot;</span>
            </div>

            <h2 className="text-3xl font-bold tracking-tight text-white md:text-4xl lg:text-5xl">
              Let Dentora answer.
              <br />
              You focus on smiles.
            </h2>
            <p className="mx-auto mt-4 max-w-md text-gray-400">
              Works with your existing calendar and phone number. No hardware. First 14 days free.
            </p>

            <div className="mt-8 flex flex-wrap items-center justify-center gap-4">
              <Link
                href="/contact"
                className="inline-flex h-12 items-center gap-2 rounded-full bg-blue-600 px-8 text-sm font-semibold text-white shadow-lg shadow-blue-600/20 transition hover:bg-blue-500"
              >
                Book a Free Demo <ArrowRight className="size-4" />
              </Link>
              <Link
                href="/pricing"
                className="inline-flex h-12 items-center gap-2 rounded-full border border-white/10 px-8 text-sm font-medium text-white transition hover:bg-white/5"
              >
                View pricing
              </Link>
            </div>

            <div className="mt-8 flex flex-wrap items-center justify-center gap-6 font-mono text-[11px] text-white/25">
              {['no credit card', 'setup in 15 min', 'cancel anytime'].map((t) => (
                <span key={t} className="flex items-center gap-1.5">
                  <span className="text-blue-400">✓</span> {t}
                </span>
              ))}
            </div>

            <div className="mt-8">
              <AsciiWaveform bars={40} className="text-sm text-blue-400/15" />
            </div>
          </div>
        </TerminalWindow>
      </motion.div>
    </section>
  );
}
