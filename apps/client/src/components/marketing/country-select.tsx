'use client';

import { AnimatePresence, motion } from 'framer-motion';
import { Check, ChevronDown, Search } from 'lucide-react';
import { useEffect, useMemo, useRef, useState } from 'react';
import { COUNTRIES, type Country, flagEmoji } from '@/lib/country-codes';
import { cn } from '@/lib/utils';

const EASE = [0.25, 0.46, 0.45, 0.94] as const;

export function CountrySelect({
  value,
  onChange,
}: {
  value: Country;
  onChange: (country: Country) => void;
}) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const rootRef = useRef<HTMLDivElement>(null);
  const searchRef = useRef<HTMLInputElement>(null);

  // Close on outside click / Escape
  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false);
    };
    document.addEventListener('mousedown', onDown);
    document.addEventListener('keydown', onKey);
    // focus search on open
    const t = setTimeout(() => searchRef.current?.focus(), 50);
    return () => {
      document.removeEventListener('mousedown', onDown);
      document.removeEventListener('keydown', onKey);
      clearTimeout(t);
    };
  }, [open]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return COUNTRIES;
    return COUNTRIES.filter(
      (c) =>
        c.name.toLowerCase().includes(q) || c.dial.includes(q) || c.iso.toLowerCase().includes(q),
    );
  }, [query]);

  return (
    <div ref={rootRef} className="relative">
      <button
        type="button"
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-label="Select country dialling code"
        onClick={() => setOpen((v) => !v)}
        className="flex h-12 items-center gap-1.5 rounded-l-xl border border-[var(--mk-hairline)] border-r-0 bg-[var(--mk-inset-bg)] px-3 text-sm mk-body transition-colors hover:bg-[color-mix(in_srgb,var(--brand-primary)_6%,var(--mk-inset-bg))]"
      >
        <span className="text-base leading-none">{flagEmoji(value.iso)}</span>
        <span className="font-medium tabular-nums">{value.dial}</span>
        <ChevronDown
          className={cn('size-3.5 mk-faint transition-transform', open && 'rotate-180')}
        />
      </button>

      <AnimatePresence>
        {open && (
          <motion.div
            initial={{ opacity: 0, y: 6, scale: 0.98 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 6, scale: 0.98 }}
            transition={{ duration: 0.16, ease: EASE }}
            role="listbox"
            className="absolute left-0 top-[calc(100%+8px)] z-50 w-72 overflow-hidden rounded-2xl border border-[var(--mk-surface-border)] bg-[var(--mk-surface)] [box-shadow:var(--mk-panel-shadow)]"
          >
            <div className="border-b border-[var(--mk-hairline)] p-2">
              <div className="flex items-center gap-2 rounded-lg bg-[var(--mk-inset-bg)] px-2.5">
                <Search className="size-4 mk-faint" />
                <input
                  ref={searchRef}
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  placeholder="Search country…"
                  className="h-9 w-full bg-transparent text-sm mk-body outline-none placeholder:text-[var(--mk-faint)]"
                />
              </div>
            </div>
            <div className="max-h-64 overflow-y-auto p-1.5">
              {filtered.length === 0 ? (
                <p className="px-3 py-6 text-center text-sm mk-faint">No countries found</p>
              ) : (
                filtered.map((c) => {
                  const selected = c.iso === value.iso;
                  return (
                    <button
                      key={c.iso}
                      type="button"
                      role="option"
                      aria-selected={selected}
                      onClick={() => {
                        onChange(c);
                        setOpen(false);
                        setQuery('');
                      }}
                      className={cn(
                        'flex w-full items-center gap-3 rounded-lg px-2.5 py-2 text-left text-sm transition-colors',
                        selected
                          ? 'bg-primary/10 mk-heading'
                          : 'mk-body hover:bg-[var(--mk-inset-bg)]',
                      )}
                    >
                      <span className="text-base leading-none">{flagEmoji(c.iso)}</span>
                      <span className="flex-1 truncate">{c.name}</span>
                      <span className="tabular-nums mk-faint">{c.dial}</span>
                      {selected && <Check className="size-4 mk-accent" />}
                    </button>
                  );
                })
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
