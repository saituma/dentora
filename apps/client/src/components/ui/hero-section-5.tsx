'use client';


import Link from 'next/link';
import { ChevronRight } from 'lucide-react';

import { Button } from '@/components/ui/button';
import { InfiniteSlider } from '@/components/ui/infinite-slider';
import { ProgressiveBlur } from '@/components/ui/progressive-blur';

const clinicNames = [
  'BrightSmile Dental',
  'Harley Street Dental',
  'Crown & Co',
  'Pearl Practice',
  'Bridge Clinic',
  'Northside Dental',
  'ClearCare Studio',
  'Root & Rise',
];

export function HeroSection() {
  return (
    <div className="overflow-x-hidden">
        <section>
          <div className="relative py-24 md:pb-32 lg:pb-36 lg:pt-40">
            <div className="relative z-10 mx-auto flex max-w-7xl flex-col px-6 lg:block lg:px-12">
              <div className="mx-auto max-w-lg text-center lg:ml-0 lg:max-w-full lg:text-left">
                <p className="text-[10px] font-mono uppercase tracking-[0.22em] text-muted-foreground">
                  Dentora / AI Reception
                </p>
                <h1 className="mt-8 max-w-2xl text-balance text-5xl md:text-6xl lg:mt-16 xl:text-7xl">
                  Your dental front desk, answered 24/7.
                </h1>
                <p className="mt-8 max-w-2xl text-balance text-lg">
                  Dentora handles patient calls, answers common questions,
                  captures intent, and books appointments before callers drift
                  away.
                </p>

                <div className="mt-12 flex flex-col items-center justify-center gap-2 sm:flex-row lg:justify-start">
                  <Button
                    render={<Link href="/signup" />}
                    size="lg"
                    className="h-12 rounded-full pl-5 pr-3 text-base"
                  >
                    <span className="text-nowrap">Start Setup</span>
                    <ChevronRight data-icon="inline-end" className="ml-1" />
                  </Button>
                  <Button
                    render={<Link href="/contact" />}
                    size="lg"
                    variant="ghost"
                    className="h-12 rounded-full px-5 text-base hover:bg-zinc-950/5 dark:hover:bg-white/5"
                  >
                    <span className="text-nowrap">Book a demo</span>
                  </Button>
                </div>
              </div>
            </div>
            <div className="absolute inset-1 aspect-[2/3] overflow-hidden rounded-3xl border border-black/10 sm:aspect-video lg:rounded-[3rem] dark:border-white/5">
              <video
                autoPlay
                loop
                muted
                playsInline
                className="size-full object-cover opacity-50 invert dark:opacity-35 dark:invert-0 dark:lg:opacity-75"
                src="https://ik.imagekit.io/lrigu76hy/tailark/dna-video.mp4?updatedAt=1745736251477"
              />
            </div>
          </div>
        </section>
        <section className="bg-background pb-2">
          <div className="group relative m-auto max-w-7xl px-6">
            <div className="flex flex-col items-center md:flex-row">
              <div className="md:max-w-44 md:border-r md:pr-6">
                <p className="text-end text-sm">Built for modern clinics</p>
              </div>
              <div className="relative py-6 md:w-[calc(100%-11rem)]">
                <InfiniteSlider speedOnHover={20} speed={40} gap={112}>
                  {clinicNames.map((name) => (
                    <div
                      key={name}
                      className="flex h-8 items-center rounded-full border border-foreground/10 bg-background/70 px-4 text-sm font-medium text-muted-foreground"
                    >
                      {name}
                    </div>
                  ))}
                </InfiniteSlider>

                <div className="bg-linear-to-r from-background absolute inset-y-0 left-0 w-20" />
                <div className="bg-linear-to-l from-background absolute inset-y-0 right-0 w-20" />
                <ProgressiveBlur
                  className="pointer-events-none absolute left-0 top-0 h-full w-20"
                  direction="left"
                  blurIntensity={1}
                />
                <ProgressiveBlur
                  className="pointer-events-none absolute right-0 top-0 h-full w-20"
                  direction="right"
                  blurIntensity={1}
                />
              </div>
            </div>
          </div>
        </section>
      </div>
  );
}
