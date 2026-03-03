'use client';

import { useEffect, useRef, useState } from 'react';
import type { CSSProperties, SVGProps } from 'react';

type ClinicBrand = {
  name: string;
  color: string;
  Icon: (props: SVGProps<SVGSVGElement>) => JSX.Element;
};

const brands: ClinicBrand[] = [
  { name: 'NorthPearl Dental', color: '#0ea5e9', Icon: NorthPearlIcon },
  { name: 'Aura Smiles', color: '#10b981', Icon: AuraSmilesIcon },
  { name: 'CityCare Dental', color: '#6366f1', Icon: CityCareIcon },
  { name: 'BlueLine Ortho', color: '#2563eb', Icon: BlueLineIcon },
  { name: 'Nova Dental Group', color: '#f59e0b', Icon: NovaDentalIcon },
  { name: 'Sunset Dentistry', color: '#f97316', Icon: SunsetIcon },
];

export function TrustedClinicsMarquee() {
  const [isVisible, setIsVisible] = useState(false);
  const sectionRef = useRef<HTMLElement>(null);
  const loopedBrands = [...brands, ...brands];

  useEffect(() => {
    const target = sectionRef.current;
    if (!target) {
      return;
    }

    // Fade in once when the section enters the viewport.
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          setIsVisible(true);
          observer.unobserve(entry.target);
        }
      },
      { threshold: 0.25 }
    );

    observer.observe(target);
    return () => observer.disconnect();
  }, []);

  return (
    <section
      ref={sectionRef}
      className={`border-b py-10 transition-all duration-700 md:py-12 ${
        isVisible ? 'translate-y-0 opacity-100' : 'translate-y-4 opacity-0'
      }`}
    >
      <div className="mx-auto w-full max-w-7xl px-4 sm:px-6 lg:px-8">
        <p className="text-center text-xs tracking-[0.2em] text-muted-foreground uppercase">
          Trusted by fast-growing clinics
        </p>

        <div className="relative mt-6 overflow-hidden rounded-2xl border bg-gradient-to-b from-card to-background px-3 py-3">
          {/* Soft edge masks hide logo entry/exit points for a cleaner marquee loop. */}
          <div className="pointer-events-none absolute inset-y-0 left-0 z-10 w-14 bg-gradient-to-r from-background to-transparent sm:w-20" />
          <div className="pointer-events-none absolute inset-y-0 right-0 z-10 w-14 bg-gradient-to-l from-background to-transparent sm:w-20" />

          <ul className="flex w-max gap-3 [animation:clinic-marquee_28s_linear_infinite] hover:[animation-play-state:paused] motion-reduce:[animation-play-state:paused]">
            {loopedBrands.map((brand, index) => (
              <li key={`${brand.name}-${index}`} className="shrink-0">
                <article
                  style={{ '--brand-color': brand.color } as CSSProperties}
                  className="group flex min-w-[10.5rem] items-center gap-3 rounded-xl border bg-card/75 px-4 py-3 text-muted-foreground/55 transition-all duration-300 hover:-translate-y-0.5 hover:scale-[1.03] hover:text-[var(--brand-color)] hover:shadow-sm"
                >
                  <brand.Icon className="size-7 text-current transition-colors duration-300" />
                  <span className="text-sm font-medium tracking-tight text-foreground/80 transition-colors duration-300 group-hover:text-foreground">
                    {brand.name}
                  </span>
                </article>
              </li>
            ))}
          </ul>
        </div>
      </div>

      <style jsx>{`
        /* Continuous horizontal slide animation using duplicated logo items. */
        @keyframes clinic-marquee {
          0% {
            transform: translateX(0);
          }
          100% {
            transform: translateX(-50%);
          }
        }
      `}</style>
    </section>
  );
}

function NorthPearlIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <svg viewBox="0 0 48 48" fill="none" aria-hidden="true" {...props}>
      <circle cx="24" cy="24" r="16" stroke="currentColor" strokeWidth="3" />
      <path d="M24 12L31.5 24L24 36L16.5 24L24 12Z" fill="currentColor" opacity="0.18" />
      <circle cx="24" cy="24" r="5" fill="currentColor" />
    </svg>
  );
}

function AuraSmilesIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <svg viewBox="0 0 48 48" fill="none" aria-hidden="true" {...props}>
      <path d="M8 25C12.5 16 35.5 16 40 25" stroke="currentColor" strokeWidth="3" strokeLinecap="round" />
      <path d="M12 25C14.5 31 19.5 34 24 34C28.5 34 33.5 31 36 25" stroke="currentColor" strokeWidth="3" strokeLinecap="round" />
      <circle cx="17" cy="19" r="2.5" fill="currentColor" opacity="0.8" />
      <circle cx="31" cy="19" r="2.5" fill="currentColor" opacity="0.8" />
    </svg>
  );
}

function CityCareIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <svg viewBox="0 0 48 48" fill="none" aria-hidden="true" {...props}>
      <rect x="10" y="11" width="28" height="26" rx="4" stroke="currentColor" strokeWidth="3" />
      <path d="M24 15V24" stroke="currentColor" strokeWidth="3" strokeLinecap="round" />
      <path d="M19.5 19.5H28.5" stroke="currentColor" strokeWidth="3" strokeLinecap="round" />
      <path d="M18 37V28H30V37" fill="currentColor" opacity="0.2" />
    </svg>
  );
}

function BlueLineIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <svg viewBox="0 0 48 48" fill="none" aria-hidden="true" {...props}>
      <rect x="9" y="13" width="30" height="22" rx="8" stroke="currentColor" strokeWidth="3" />
      <path d="M9 24H39" stroke="currentColor" strokeWidth="3" strokeLinecap="round" />
      <path d="M17 13V35" stroke="currentColor" strokeWidth="3" strokeLinecap="round" opacity="0.45" />
      <path d="M31 13V35" stroke="currentColor" strokeWidth="3" strokeLinecap="round" opacity="0.45" />
    </svg>
  );
}

function NovaDentalIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <svg viewBox="0 0 48 48" fill="none" aria-hidden="true" {...props}>
      <path d="M24 9L28.2 19.8L39 24L28.2 28.2L24 39L19.8 28.2L9 24L19.8 19.8L24 9Z" fill="currentColor" opacity="0.2" />
      <circle cx="24" cy="24" r="7" stroke="currentColor" strokeWidth="3" />
      <path d="M24 13V35" stroke="currentColor" strokeWidth="3" strokeLinecap="round" />
      <path d="M13 24H35" stroke="currentColor" strokeWidth="3" strokeLinecap="round" />
    </svg>
  );
}

function SunsetIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <svg viewBox="0 0 48 48" fill="none" aria-hidden="true" {...props}>
      <path d="M11 31H37" stroke="currentColor" strokeWidth="3" strokeLinecap="round" />
      <path d="M15 31C15 26 19 22 24 22C29 22 33 26 33 31" fill="currentColor" opacity="0.2" />
      <path d="M15 31C15 26 19 22 24 22C29 22 33 26 33 31" stroke="currentColor" strokeWidth="3" />
      <path d="M24 10V15" stroke="currentColor" strokeWidth="3" strokeLinecap="round" />
      <path d="M15 14.5L18 17.5" stroke="currentColor" strokeWidth="3" strokeLinecap="round" />
      <path d="M33 14.5L30 17.5" stroke="currentColor" strokeWidth="3" strokeLinecap="round" />
    </svg>
  );
}
