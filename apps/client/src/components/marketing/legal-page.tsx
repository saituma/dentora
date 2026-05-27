'use client';

import type { ReactNode } from 'react';
import { motion } from 'framer-motion';

const fadeUp = {
  initial: { opacity: 0, y: 24 },
  whileInView: { opacity: 1, y: 0 },
  viewport: { once: true },
  transition: { duration: 0.7, ease: [0.32, 0.72, 0, 1] as const },
};

interface LegalSection {
  title: string;
  content: ReactNode;
}

interface LegalPageProps {
  eyebrow: string;
  title: string;
  description: string;
  effectiveDate: string;
  sections: LegalSection[];
}

export function LegalPage({
  eyebrow,
  title,
  description,
  effectiveDate,
  sections,
}: LegalPageProps) {
  return (
    <div>
      <section className="border-b border-white/10">
        <motion.div
          {...fadeUp}
          className="mx-auto w-full max-w-4xl px-4 py-16 sm:px-6 lg:px-8 lg:py-20"
        >
          <p className="text-xs font-medium uppercase tracking-widest text-[#4fc3f7]">{eyebrow}</p>
          <h1 className="mt-3 font-display text-4xl font-bold tracking-tight text-[#c7d0d9] sm:text-5xl">
            {title}
          </h1>
          <p className="mt-5 max-w-3xl text-base text-[#c7d0d9]/60 sm:text-lg">{description}</p>
          <p className="mt-6 text-sm text-[#c7d0d9]/50">Effective date: {effectiveDate}</p>
        </motion.div>
      </section>

      <section>
        <div className="mx-auto w-full max-w-4xl px-4 py-12 sm:px-6 lg:px-8 lg:py-16">
          <div className="space-y-4">
            {sections.map((section) => (
              <motion.div
                key={section.title}
                {...fadeUp}
                className="rounded-2xl border border-white/10 bg-[#111827] p-6 shadow-sm"
              >
                <h2 className="text-lg font-semibold text-[#c7d0d9]">{section.title}</h2>
                <div className="mt-3 space-y-3 text-sm leading-7 text-[#c7d0d9]/60 sm:text-base">
                  {section.content}
                </div>
              </motion.div>
            ))}
          </div>
        </div>
      </section>
    </div>
  );
}
