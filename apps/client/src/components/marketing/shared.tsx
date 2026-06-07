'use client';

import { motion } from 'framer-motion';
import { cn } from '@/lib/utils';

/* ─── Animation helpers ─────────────────────────────────────────
   Easing extracted by designlang from Linear:
   cubic-bezier(0.25, 0.46, 0.45, 0.94) — a refined ease-out. */
const EASE = [0.25, 0.46, 0.45, 0.94] as const;
export const inView = {
  initial: { opacity: 0, y: 22 },
  whileInView: { opacity: 1, y: 0 },
  viewport: { once: true, margin: '-80px' },
  transition: { duration: 0.6, ease: EASE },
};
export const d = (delay: number) => ({
  ...inView,
  transition: { ...inView.transition, delay },
});

/* ─── Global CSS ────────────────────────────────────────────── */
const STYLES = `
  @keyframes ticker{0%{transform:translateX(0)}100%{transform:translateX(-50%)}}
  .tick  { animation: ticker 28s linear infinite; }
`;

export function MarketingStyles() {
  return <style dangerouslySetInnerHTML={{ __html: STYLES }} />;
}

/* ─── Live Ticker ───────────────────────────────────────────── */
const TICKER_EVENTS = [
  '● +44 7700 900341  →  Booking confirmed: Wed 19 May · 2:00 PM',
  '● +44 7891 445123  →  FAQ answered: insurance coverage',
  '● +44 7712 009876  →  Reschedule: Thu 20 May · 10:30 AM',
  '● +44 7900 112233  →  New patient: checkup + cleaning booked',
  '● +44 7811 334455  →  Emergency slot allocated: Today 4 PM',
  '● +44 7700 556677  →  Reminder confirmed: patient replied YES',
  '● +44 7809 998877  →  Booking confirmed: Fri 23 May · 9:00 AM',
];

export function LiveTicker() {
  const text = TICKER_EVENTS.join('    ·    ');
  return (
    <div className="relative overflow-hidden border-b border-[var(--mk-hairline)] bg-[var(--mk-surface)] py-2 text-[11px]">
      <div className="flex">
        <div className="tick whitespace-nowrap font-mono">
          <span className="mk-accent">[LIVE]</span>
          <span className="mx-4 mk-faint">·</span>
          <span className="mk-faint">{text}</span>
          <span className="mx-8 mk-faint">·</span>
          <span className="mk-accent">[LIVE]</span>
          <span className="mx-4 mk-faint">·</span>
          <span className="mk-faint">{text}</span>
          <span className="mx-8 mk-faint">·</span>
        </div>
      </div>
    </div>
  );
}

/* ─── Clean info card (replaces TerminalWindow) ─────────────── */
export function TerminalWindow({
  title,
  children,
  className,
}: {
  title?: string;
  children: React.ReactNode;
  className?: string;
  scanline?: boolean;
}) {
  return (
    <div className={cn('mk-panel overflow-hidden rounded-2xl', className)}>
      {title && (
        <div className="flex items-center gap-2 border-b border-[var(--mk-hairline)] px-4 py-3">
          <div className="flex gap-1.5">
            <div className="size-2.5 rounded-full bg-red-400/60" />
            <div className="size-2.5 rounded-full bg-yellow-400/60" />
            <div className="size-2.5 rounded-full bg-green-400/60" />
          </div>
          <span className="flex-1 text-center text-[11px] mk-faint">{title}</span>
        </div>
      )}
      <div className="relative">{children}</div>
    </div>
  );
}

/* ─── Chat bubble ───────────────────────────────────────────── */
export function Bubble({ ai, text }: { ai?: boolean; text: string }) {
  return (
    <div className={cn('flex gap-2 text-[11px]', !ai && 'justify-end')}>
      {ai && (
        <div className="mt-0.5 flex size-4 shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-[#4fc3f7] to-[#0284c7] text-[7px] font-bold text-white">
          D
        </div>
      )}
      <div
        className={cn(
          'max-w-[82%] rounded-lg px-2.5 py-1.5 leading-relaxed ring-1 ring-inset',
          ai
            ? 'bg-[#4fc3f7]/10 mk-body ring-[#4fc3f7]/15'
            : 'bg-[var(--mk-inset-bg)] mk-body ring-white/5',
        )}
      >
        {text}
      </div>
    </div>
  );
}

/* ─── Feature card ──────────────────────────────────────────── */
export function FCard({
  icon: Icon,
  title,
  description,
  accent = 'purple',
  children,
}: {
  icon: React.ElementType;
  title: string;
  description: string;
  accent?: 'blue' | 'purple' | 'green';
  children?: React.ReactNode;
}) {
  const iconColor = {
    blue: 'mk-accent',
    purple: 'mk-accent',
    green: 'text-emerald-500',
  }[accent];

  return (
    <div className="mk-panel mk-lift group flex h-full flex-col rounded-3xl p-7">
      <div className="mk-icon-tile mb-5 flex size-11 items-center justify-center rounded-2xl">
        <Icon
          className={cn(
            'size-5 transition-transform duration-300 group-hover:scale-110',
            iconColor,
          )}
        />
      </div>
      <h3 className="mb-2 font-display text-base font-bold mk-heading">{title}</h3>
      <p className="flex-1 text-[15px] leading-relaxed mk-muted">{description}</p>
      {children}
    </div>
  );
}

/* ─── Page header (reused on every sub-page) ────────────────── */
export function PageHeader({
  eyebrow,
  title,
  subtitle,
}: {
  eyebrow: string;
  title: React.ReactNode;
  subtitle?: string;
}) {
  return (
    <motion.div {...inView} className="relative mb-16 text-center">
      {/* ambient glow behind the page title */}
      <div className="mk-glow mk-glow-primary mk-animate-breathe pointer-events-none left-1/2 top-[-60px] size-[420px] -translate-x-1/2 opacity-40" />
      <span className="mk-chip relative mb-4 inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-medium uppercase tracking-wider mk-accent">
        {eyebrow}
      </span>
      <h1 className="relative font-display text-4xl font-bold leading-[1.08] tracking-[-0.03em] mk-heading md:text-[3.25rem]">
        {title}
      </h1>
      {subtitle && (
        <p className="relative mx-auto mt-4 max-w-xl text-lg leading-relaxed mk-muted">
          {subtitle}
        </p>
      )}
    </motion.div>
  );
}

/* ─── ASCII Waveform (light version) ────────────────────────── */
export function AsciiWaveform({ bars = 52, className }: { bars?: number; className?: string }) {
  return (
    <div className={cn('select-none text-[#4fc3f7]/20', className)}>
      {Array.from({ length: bars }, (_, i) => (
        <span key={i}>▁</span>
      ))}
    </div>
  );
}
