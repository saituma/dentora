'use client';

import type { ReactNode } from 'react';
import {
  BotIcon,
  BoxesIcon,
  CloudIcon,
  CpuIcon,
  GithubIcon,
  LayersIcon,
  RocketIcon,
  ShieldCheckIcon,
  SparklesIcon,
  TriangleIcon,
} from 'lucide-react';

type Brand = {
  name: string;
  icon: ReactNode;
};

const brands: Brand[] = [
  { name: 'Bupa Dental Care', icon: <ShieldCheckIcon className="size-4" aria-hidden="true" /> },
  { name: 'mydentist', icon: <SparklesIcon className="size-4" aria-hidden="true" /> },
  { name: 'PortmanDentex', icon: <LayersIcon className="size-4" aria-hidden="true" /> },
  { name: 'Rodericks Dental', icon: <RocketIcon className="size-4" aria-hidden="true" /> },
  { name: 'B Dental', icon: <BotIcon className="size-4" aria-hidden="true" /> },
  { name: 'Smilepod', icon: <TriangleIcon className="size-4" aria-hidden="true" /> },
  { name: 'The Dental Centre', icon: <BoxesIcon className="size-4" aria-hidden="true" /> },
  { name: 'Quality Dental Group', icon: <CpuIcon className="size-4" aria-hidden="true" /> },
  { name: 'Harley Street Dental', icon: <CloudIcon className="size-4" aria-hidden="true" /> },
  { name: 'Damira Dental Studios', icon: <GithubIcon className="size-4" aria-hidden="true" /> },
];

function LogoItem({ name, icon }: Brand) {
  return (
    <div className="flex shrink-0 items-center gap-2 px-5 text-foreground/60 dark:text-foreground/40">
      <span className="shrink-0">{icon}</span>
      <span className="whitespace-nowrap text-xs font-medium tracking-wide">{name}</span>
    </div>
  );
}

export function TrustedClinicsMarquee() {
  return (
    <section className="border-b py-10 md:py-12">
      <div className="mx-auto w-full max-w-7xl px-4 sm:px-6 lg:px-8">
        <div className="space-y-3">
          <p className="text-center text-[11px] uppercase tracking-[0.15em] text-foreground/50 dark:text-foreground/30 font-medium">
            Trusted by UK dental clinics
          </p>

          <div className="relative overflow-hidden">
            <div
              className="pointer-events-none absolute inset-0 z-10"
              style={{
                maskImage:
                  'linear-gradient(to right, transparent, black 15%, black 85%, transparent)',
                WebkitMaskImage:
                  'linear-gradient(to right, transparent, black 15%, black 85%, transparent)',
              }}
            >
              <div className="flex w-fit animate-logo-marquee">
                {[0, 1].map((setIdx) => (
                  <div key={setIdx} className="flex shrink-0">
                    {brands.map((brand, i) => (
                      <LogoItem key={`${setIdx}-${i}-${brand.name}`} {...brand} />
                    ))}
                  </div>
                ))}
              </div>
            </div>

            <div className="invisible flex" aria-hidden="true">
              <LogoItem {...brands[0]} />
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
