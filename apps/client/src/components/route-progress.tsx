'use client';

import { useCallback, useEffect, useRef } from 'react';
import { usePathname } from 'next/navigation';

export function RouteProgress() {
  const pathname = usePathname();
  const barRef = useRef<HTMLDivElement>(null);
  const prevPathname = useRef(pathname);
  const slowTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const hideTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  const setBar = useCallback((width: number, opacity: number, duration = 400) => {
    const bar = barRef.current;
    if (!bar) return;
    bar.style.transition = `transform ${duration}ms cubic-bezier(0.1,0.9,0.2,1), opacity 200ms ease`;
    bar.style.transform = `scaleX(${width / 100})`;
    bar.style.opacity = String(opacity);
  }, []);

  const startProgress = useCallback(() => {
    clearTimeout(slowTimer.current);
    clearTimeout(hideTimer.current);
    setBar(0, 1, 0);
    requestAnimationFrame(() => {
      setBar(35, 1, 500);
      slowTimer.current = setTimeout(() => setBar(65, 1, 1200), 500);
      slowTimer.current = setTimeout(() => setBar(80, 1, 2000), 1700);
    });
  }, [setBar]);

  const completeProgress = useCallback(() => {
    clearTimeout(slowTimer.current);
    clearTimeout(hideTimer.current);
    setBar(100, 1, 300);
    hideTimer.current = setTimeout(() => {
      setBar(100, 0, 0);
    }, 350);
  }, [setBar]);

  useEffect(() => {
    if (prevPathname.current === pathname) return;
    prevPathname.current = pathname;
    completeProgress();
  });

  useEffect(() => {
    const handleClick = (e: MouseEvent) => {
      const anchor = (e.target as HTMLElement).closest('a');
      if (!anchor?.href) return;
      let url: URL;
      try {
        url = new URL(anchor.href);
      } catch {
        return;
      }
      if (url.origin !== window.location.origin) return;
      if (url.pathname === window.location.pathname) return;
      startProgress();
    };

    document.addEventListener('click', handleClick);
    return () => document.removeEventListener('click', handleClick);
  }, [startProgress]);

  return (
    <div
      ref={barRef}
      aria-hidden
      className="pointer-events-none fixed inset-x-0 top-0 z-[9999] h-[2px] origin-left bg-[#b275ff] shadow-[0_0_12px_2px_rgba(178,117,255,0.65)]"
      style={{ transform: 'scaleX(0)', opacity: 0 }}
    />
  );
}
