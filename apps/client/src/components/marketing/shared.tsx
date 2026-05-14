'use client';

import { motion } from 'framer-motion';
import { useEffect, useState } from 'react';
import { cn } from '@/lib/utils';

/* ─── Animation helpers ─────────────────────────────────────── */
export const inView = {
  initial: { opacity: 0, y: 22 },
  whileInView: { opacity: 1, y: 0 },
  viewport: { once: true },
  transition: { duration: 0.65, ease: [0.21, 0.47, 0.32, 0.98] as const },
};
export const d = (delay: number) => ({
  ...inView,
  transition: { ...inView.transition, delay },
});

/* ─── Global CSS ────────────────────────────────────────────── */
const STYLES = `
  @keyframes glitch {
    0%,84%,100%{transform:none;opacity:1;clip-path:none}
    85%{transform:translateX(-3px) skewX(-0.8deg);opacity:.88;clip-path:polygon(0 10%,100% 10%,100% 30%,0 30%)}
    86%{transform:translateX(3px) skewX(0.8deg);opacity:.88;clip-path:polygon(0 55%,100% 55%,100% 78%,0 78%)}
    87%{transform:translateX(-1px);clip-path:none;opacity:1}
    88%{transform:none}
  }
  @keyframes glitch-ghost {
    0%,84%,100%{opacity:0}
    85%,86%{opacity:.45;transform:translateX(5px);color:#60a5fa;mix-blend-mode:screen}
    87%{opacity:0}
  }
  @keyframes blink{0%,100%{opacity:1}50%{opacity:0}}
  @keyframes scanline{0%{top:-8%}100%{top:108%}}
  @keyframes flicker{0%,100%{opacity:1}92%{opacity:.96}93%{opacity:.88}94%{opacity:.96}95%{opacity:.92}96%{opacity:1}}
  @keyframes ticker{0%{transform:translateX(0)}100%{transform:translateX(-50%)}}
  .glt   { animation: glitch 8s infinite; }
  .glt-g { animation: glitch-ghost 8s infinite; }
  .cur   { animation: blink 1s step-end infinite; }
  .scan  { animation: scanline 2.5s linear infinite; }
  .flkr  { animation: flicker 6s infinite; }
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
    <div className="relative overflow-hidden border-b border-white/[0.06] bg-[#060a12] py-2 font-mono text-[11px]">
      <div className="flex">
        <div className="tick whitespace-nowrap">
          <span className="text-green-400/70">[LIVE]</span>
          <span className="mx-4 text-white/20">·</span>
          <span className="text-white/40">{text}</span>
          <span className="mx-8 text-white/20">·</span>
          <span className="text-green-400/70">[LIVE]</span>
          <span className="mx-4 text-white/20">·</span>
          <span className="text-white/40">{text}</span>
          <span className="mx-8 text-white/20">·</span>
        </div>
      </div>
    </div>
  );
}

/* ─── Glitch headline ───────────────────────────────────────── */
export function GlitchHeadline({ children }: { children: string }) {
  return (
    <span className="relative inline-block">
      <span className="glt relative z-10">{children}</span>
      <span className="glt-g absolute inset-0 select-none" aria-hidden>
        {children}
      </span>
    </span>
  );
}

/* ─── Terminal Window ───────────────────────────────────────── */
export function TerminalWindow({
  title = 'dentora@ai:~',
  children,
  className,
  scanline = false,
}: {
  title?: string;
  children: React.ReactNode;
  className?: string;
  scanline?: boolean;
}) {
  return (
    <div
      className={cn(
        'flkr overflow-hidden rounded-xl border border-white/[0.1] bg-[#070b14] shadow-2xl shadow-blue-900/20 font-mono',
        className,
      )}
    >
      <div className="flex items-center gap-2 border-b border-white/[0.07] bg-[#0a0f1c] px-4 py-2.5">
        <div className="flex gap-1.5">
          <div className="size-2.5 rounded-full bg-red-500/70" />
          <div className="size-2.5 rounded-full bg-yellow-500/70" />
          <div className="size-2.5 rounded-full bg-green-500/70" />
        </div>
        <span className="flex-1 text-center text-[11px] text-white/30">{title}</span>
      </div>
      <div className="relative">
        {scanline && (
          <div className="scan pointer-events-none absolute left-0 right-0 z-10 h-8 bg-gradient-to-b from-white/[0.03] to-transparent" />
        )}
        {children}
      </div>
    </div>
  );
}

/* ─── ASCII Waveform ────────────────────────────────────────── */
const BLOCKS = ['▁', '▂', '▃', '▄', '▅', '▆', '▇', '█'];

export function AsciiWaveform({ bars = 52, className }: { bars?: number; className?: string }) {
  const [levels, setLevels] = useState(() =>
    Array.from({ length: bars }, () => Math.floor(Math.random() * 8)),
  );

  useEffect(() => {
    const id = setInterval(() => {
      setLevels((prev) =>
        prev.map((b) => Math.max(0, Math.min(7, b + Math.floor(Math.random() * 3) - 1))),
      );
    }, 110);
    return () => clearInterval(id);
  }, [bars]);

  return (
    <div className={cn('select-none font-mono', className)}>
      {levels.map((l, i) => (
        <span key={i} className="transition-all duration-100">
          {BLOCKS[l]}
        </span>
      ))}
    </div>
  );
}

/* ─── Blinking cursor ───────────────────────────────────────── */
export function Cursor() {
  return (
    <span className="cur ml-0.5 inline-block h-[1em] w-[2px] translate-y-[1px] rounded-sm bg-blue-400" />
  );
}

/* ─── Chat bubble ───────────────────────────────────────────── */
export function Bubble({ ai, text }: { ai?: boolean; text: string }) {
  return (
    <div className={cn('flex gap-2 text-[11px]', !ai && 'justify-end')}>
      {ai && (
        <div className="mt-0.5 flex size-4 shrink-0 items-center justify-center rounded-full bg-blue-600 text-[7px] font-bold text-white">
          D
        </div>
      )}
      <div
        className={cn(
          'max-w-[82%] rounded-lg px-2.5 py-1.5 leading-relaxed',
          ai ? 'bg-blue-600/15 text-gray-300' : 'bg-white/[0.06] text-gray-300',
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
  accent = 'blue',
  children,
}: {
  icon: React.ElementType;
  title: string;
  description: string;
  accent?: 'blue' | 'purple' | 'green';
  children?: React.ReactNode;
}) {
  const cls = {
    blue: 'bg-blue-500/10 text-blue-400',
    purple: 'bg-purple-500/10 text-purple-400',
    green: 'bg-green-500/10 text-green-400',
  }[accent];

  return (
    <div className="group flex h-full flex-col rounded-2xl border border-white/[0.07] bg-white/[0.02] p-6 transition hover:border-white/[0.12] hover:bg-white/[0.03]">
      <div className={cn('mb-4 flex size-9 items-center justify-center rounded-xl', cls)}>
        <Icon className="size-4" />
      </div>
      <h3 className="mb-2 text-sm font-semibold text-white">{title}</h3>
      <p className="flex-1 text-sm leading-relaxed text-gray-400">{description}</p>
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
      <p className="mb-3 font-mono text-[11px] uppercase tracking-widest text-blue-400">
        {eyebrow}
      </p>
      <h1 className="text-4xl font-bold tracking-tight text-white md:text-5xl">{title}</h1>
      {subtitle && <p className="mx-auto mt-4 max-w-xl text-gray-400">{subtitle}</p>}
    </motion.div>
  );
}
