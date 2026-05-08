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
      <section className="border-b border-white/[0.06]">
        <motion.div {...fadeUp} className="mx-auto w-full max-w-4xl px-4 py-16 sm:px-6 lg:px-8 lg:py-20">
          <p className="text-sm font-semibold uppercase tracking-widest text-blue-400">{eyebrow}</p>
          <h1 className="mt-3 text-4xl font-bold tracking-tight text-white sm:text-5xl">
            {title}
          </h1>
          <p className="mt-5 max-w-3xl text-base text-gray-400 sm:text-lg">
            {description}
          </p>
          <p className="mt-6 text-sm text-gray-500">
            Effective date: {effectiveDate}
          </p>
        </motion.div>
      </section>

      <section>
        <div className="mx-auto w-full max-w-4xl px-4 py-12 sm:px-6 lg:px-8 lg:py-16">
          <div className="space-y-6">
            {sections.map((section) => (
              <motion.div
                key={section.title}
                {...fadeUp}
                className="rounded-3xl border border-white/[0.08] bg-[#0f1424]/80 p-1.5"
              >
                <div className="rounded-[calc(1.5rem-6px)] border border-white/[0.06] bg-gradient-to-br from-[#0f1424] to-[#0a0e1a] p-6">
                  <h2 className="text-lg font-semibold text-white">{section.title}</h2>
                  <div className="mt-3 space-y-3 text-sm leading-7 text-gray-400 sm:text-base">
                    {section.content}
                  </div>
                </div>
              </motion.div>
            ))}
          </div>
        </div>
      </section>
    </div>
  );
}
