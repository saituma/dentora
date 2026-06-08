'use client';

import { motion, useInView, useSpring, useTransform } from 'framer-motion';
import { ArrowRight, PhoneMissed, Sparkles, TrendingUp, Wallet } from 'lucide-react';
import Link from 'next/link';
import { useEffect, useRef, useState } from 'react';
import { cn } from '@/lib/utils';

const EASE = [0.25, 0.46, 0.45, 0.94] as const;

const inView = {
  initial: { opacity: 0, y: 24 },
  whileInView: { opacity: 1, y: 0 },
  viewport: { once: true, margin: '-80px' },
  transition: { duration: 0.6, ease: EASE },
};

const gbp = new Intl.NumberFormat('en-GB', {
  style: 'currency',
  currency: 'GBP',
  maximumFractionDigits: 0,
});
const num = new Intl.NumberFormat('en-GB');

const NUM_TEXT = 'bg-gradient-to-b from-[#2bb0ef] to-[#0a6aa3] bg-clip-text text-transparent';

/* ── Animated count-up number ───────────────────────────────────── */
function CountUp({
  value,
  active,
  format,
  className,
}: {
  value: number;
  active: boolean;
  format: (n: number) => string;
  className?: string;
}) {
  const spring = useSpring(0, { stiffness: 55, damping: 18 });
  const text = useTransform(spring, (v) => format(Math.round(v)));

  useEffect(() => {
    if (active) spring.set(value);
  }, [active, value, spring]);

  return <motion.span className={className}>{text}</motion.span>;
}

/* ── Premium range slider ───────────────────────────────────────── */
function Slider({
  label,
  icon: Icon,
  value,
  onChange,
  min,
  max,
  step,
  format,
}: {
  label: string;
  icon: React.ElementType;
  value: number;
  onChange: (v: number) => void;
  min: number;
  max: number;
  step: number;
  format: (n: number) => string;
}) {
  const pct = ((value - min) / (max - min)) * 100;
  return (
    <div>
      <div className="flex items-center justify-between gap-3">
        <span className="flex items-center gap-2 text-sm font-medium mk-body">
          <Icon className="size-4 text-[#0a84c9]" />
          {label}
        </span>
        <span className="font-display text-lg font-bold tabular-nums mk-heading">
          {format(value)}
        </span>
      </div>
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
        aria-label={label}
        className="mk-slider mt-3"
        style={{ '--pct': `${pct}%` } as React.CSSProperties}
      />
      <div className="mt-1 flex justify-between text-[11px] mk-faint">
        <span>{format(min)}</span>
        <span>{format(max)}</span>
      </div>
    </div>
  );
}

export function RoiCalculator() {
  const [missedCalls, setMissedCalls] = useState(50);
  const [clientValue, setClientValue] = useState(150);

  const ref = useRef<HTMLDivElement>(null);
  const active = useInView(ref, { once: true, margin: '-80px' });

  const monthly = missedCalls * clientValue;
  const yearly = monthly * 12;

  return (
    <section id="roi-calculator" className="relative isolate scroll-mt-24 px-6 py-24 lg:px-8">
      {/* ambient depth */}
      <div className="pointer-events-none absolute inset-0 -z-10 overflow-hidden">
        <div className="mk-glow mk-glow-primary mk-animate-breathe left-1/2 top-0 size-[560px] -translate-x-1/2" />
      </div>

      {/* header */}
      <motion.div {...inView} className="mx-auto max-w-2xl text-center">
        <span className="mk-chip mb-4 inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-medium uppercase tracking-wider mk-accent">
          <Sparkles className="size-3" />
          ROI Calculator
        </span>
        <h2 className="font-display text-3xl font-bold leading-[1.1] tracking-[-0.025em] mk-heading md:text-[2.5rem]">
          Find out how much Dentora can{' '}
          <span className="bg-gradient-to-r from-[#22a6e2] to-[#0a6aa3] bg-clip-text text-transparent">
            save your clinic.
          </span>
        </h2>
        <p className="mx-auto mt-4 text-lg leading-relaxed mk-muted">
          Drag the sliders to match your practice. Every missed call is a patient who booked
          somewhere else, see what Dentora could recover.
        </p>
      </motion.div>

      {/* body */}
      <div
        ref={ref}
        className="mx-auto mt-12 grid max-w-7xl items-center gap-6 lg:grid-cols-[1fr_1.05fr]"
      >
        {/* left: inputs */}
        <motion.div {...inView}>
          <div className="mk-panel rounded-3xl p-6 sm:p-8">
            <h3 className="font-display text-xl font-bold mk-heading">Your numbers</h3>
            <p className="mt-1 text-sm mk-muted">A quick estimate, no sign-up needed.</p>
            <div className="mt-7 space-y-8">
              <Slider
                label="Missed calls per month"
                icon={PhoneMissed}
                value={missedCalls}
                onChange={setMissedCalls}
                min={0}
                max={500}
                step={5}
                format={(n) => num.format(n)}
              />
              <Slider
                label="Average value per new client"
                icon={Wallet}
                value={clientValue}
                onChange={setClientValue}
                min={20}
                max={2000}
                step={10}
                format={(n) => gbp.format(n)}
              />
            </div>
          </div>
        </motion.div>

        {/* right: result */}
        <motion.div {...inView} transition={{ ...inView.transition, delay: 0.1 }}>
          <div className="mk-panel relative overflow-hidden rounded-3xl p-6 text-center sm:p-8 lg:text-left">
            <div className="pointer-events-none absolute -right-12 -top-12 size-48 rounded-full bg-[#4fc3f7]/10 blur-3xl" />
            <div className="relative">
              <span className="inline-flex items-center gap-2 rounded-full bg-emerald-500/12 px-3 py-1 text-xs font-semibold text-emerald-600 ring-1 ring-inset ring-emerald-500/25">
                <TrendingUp className="size-3.5" />
                Potential monthly savings
              </span>

              <div className="mt-4 flex items-end justify-center gap-1.5 lg:justify-start">
                <CountUp
                  value={monthly}
                  active={active}
                  format={(n) => gbp.format(n)}
                  className={cn(
                    'font-display text-5xl font-extrabold tabular-nums sm:text-6xl',
                    NUM_TEXT,
                  )}
                />
                <span className="mb-1.5 text-lg font-medium mk-faint">/mo</span>
              </div>

              <p className="mt-3 text-[15px] mk-muted">
                That&apos;s{' '}
                <CountUp
                  value={yearly}
                  active={active}
                  format={(n) => gbp.format(n)}
                  className="font-semibold mk-heading"
                />{' '}
                recovered a year, from bookings you&apos;re missing today.
              </p>

              <div className="mk-hairline my-6" />

              <div className="flex flex-col items-center gap-3 sm:flex-row sm:items-center sm:justify-between lg:items-center">
                <p className="text-sm mk-muted">
                  Ready to capture it? See Dentora on your own number.
                </p>
                <Link
                  href="/contact"
                  className="mk-btn-primary inline-flex h-12 shrink-0 items-center justify-center gap-2 rounded-full px-6 text-[15px] font-semibold"
                >
                  Book a free demo
                  <ArrowRight className="size-4" />
                </Link>
              </div>
            </div>
          </div>
        </motion.div>
      </div>
    </section>
  );
}
