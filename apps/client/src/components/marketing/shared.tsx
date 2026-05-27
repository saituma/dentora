'use client';

import { motion } from 'framer-motion';
import { cn } from '@/lib/utils';

/* ─── Animation helpers ─────────────────────────────────────── */
export const inView = {
  initial: { opacity: 0, y: 22 },
  whileInView: { opacity: 1, y: 0 },
  viewport: { once: true },
  transition: { duration: 0.65, ease: 'easeOut' as const },
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
    <div className="relative overflow-hidden border-b border-white/10 bg-[#111827] py-2 text-[11px]">
      <div className="flex">
        <div className="tick whitespace-nowrap font-mono">
          <span className="text-[#4fc3f7]">[LIVE]</span>
          <span className="mx-4 text-[#c7d0d9]/20">·</span>
          <span className="text-[#c7d0d9]/50">{text}</span>
          <span className="mx-8 text-[#c7d0d9]/20">·</span>
          <span className="text-[#4fc3f7]">[LIVE]</span>
          <span className="mx-4 text-[#c7d0d9]/20">·</span>
          <span className="text-[#c7d0d9]/50">{text}</span>
          <span className="mx-8 text-[#c7d0d9]/20">·</span>
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
    <div
      className={cn(
        'overflow-hidden rounded-2xl border border-white/10 bg-[#111827] shadow-sm',
        className,
      )}
    >
      {title && (
        <div className="flex items-center gap-2 border-b border-white/10 bg-[#111827] px-4 py-3">
          <div className="flex gap-1.5">
            <div className="size-2.5 rounded-full bg-red-400/60" />
            <div className="size-2.5 rounded-full bg-yellow-400/60" />
            <div className="size-2.5 rounded-full bg-green-400/60" />
          </div>
          <span className="flex-1 text-center text-[11px] text-[#c7d0d9]/40">{title}</span>
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
        <div className="mt-0.5 flex size-4 shrink-0 items-center justify-center rounded-full bg-[#4fc3f7] text-[7px] font-bold text-white">
          D
        </div>
      )}
      <div
        className={cn(
          'max-w-[82%] rounded-lg px-2.5 py-1.5 leading-relaxed',
          ai ? 'bg-[#4fc3f7]/10 text-[#c7d0d9]/80' : 'bg-white/5 text-[#c7d0d9]/80',
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
  const cls = {
    blue: 'bg-[#4fc3f7]/10 text-[#4fc3f7]',
    purple: 'bg-[#4fc3f7]/10 text-[#4fc3f7]',
    green: 'bg-emerald-500/10 text-emerald-600',
  }[accent];

  return (
    <div className="group flex h-full flex-col rounded-2xl border border-white/10 bg-[#111827] p-6 shadow-sm transition hover:border-[#4fc3f7]/30 hover:shadow-md">
      <div className={cn('mb-4 flex size-9 items-center justify-center rounded-xl', cls)}>
        <Icon className="size-4" />
      </div>
      <h3 className="mb-2 text-sm font-semibold text-[#c7d0d9]">{title}</h3>
      <p className="flex-1 text-sm leading-relaxed text-[#c7d0d9]/60">{description}</p>
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
    <motion.div {...inView} className="mb-16 text-center">
      <p className="mb-3 text-xs font-medium uppercase tracking-widest text-[#4fc3f7]">{eyebrow}</p>
      <h1 className="font-display text-4xl font-bold tracking-tight text-[#c7d0d9] md:text-5xl">
        {title}
      </h1>
      {subtitle && <p className="mx-auto mt-4 max-w-xl text-[#c7d0d9]/60">{subtitle}</p>}
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
