'use client';

import { useTheme } from 'next-themes';
import { Moon, Sun } from 'lucide-react';
import { cn } from '@/lib/utils';

export type MkTheme = 'light' | 'dark';

/* Unified theme control for the whole platform (marketing + app), backed by
   next-themes so the preference is shared, persisted, and flash-free. */
export function useMkTheme(): [MkTheme, () => void] {
  const { resolvedTheme, setTheme } = useTheme();
  const theme: MkTheme = resolvedTheme === 'dark' ? 'dark' : 'light';
  const toggle = () => setTheme(theme === 'dark' ? 'light' : 'dark');
  return [theme, toggle];
}

export function ThemeToggle({
  theme,
  onToggle,
  className,
}: {
  theme: MkTheme;
  onToggle: () => void;
  className?: string;
}) {
  const isDark = theme === 'dark';
  return (
    <button
      type="button"
      onClick={onToggle}
      aria-label={isDark ? 'Switch to light mode' : 'Switch to dark mode'}
      title={isDark ? 'Light mode' : 'Dark mode'}
      className={cn(
        'mk-btn-ghost group relative flex size-10 items-center justify-center rounded-full',
        className,
      )}
    >
      <Sun
        className={cn(
          'absolute size-[18px] text-amber-500 transition-all duration-300 ease-out',
          isDark ? 'scale-0 -rotate-90 opacity-0' : 'scale-100 rotate-0 opacity-100',
        )}
      />
      <Moon
        className={cn(
          'absolute size-[18px] text-[#7dd3fc] transition-all duration-300 ease-out',
          isDark ? 'scale-100 rotate-0 opacity-100' : 'scale-0 rotate-90 opacity-0',
        )}
      />
    </button>
  );
}
