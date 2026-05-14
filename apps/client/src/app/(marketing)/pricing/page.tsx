'use client';

import { motion } from 'framer-motion';
import { Check } from 'lucide-react';
import Link from 'next/link';
import { cn } from '@/lib/utils';
import {
  MarketingStyles,
  PageHeader,
  TerminalWindow,
  d,
  inView,
} from '@/components/marketing/shared';

const plans = [
  {
    name: 'Starter',
    price: '£149',
    period: '/mo',
    desc: 'Perfect for single-location practices getting started with AI.',
    features: [
      '300 AI-handled calls / month',
      'Appointment booking & scheduling',
      'Basic patient Q&A',
      'Google Calendar sync',
      'Email call summaries',
      'UK GDPR compliant',
    ],
    cta: 'Get Started',
    popular: false,
  },
  {
    name: 'Growth',
    price: '£299',
    period: '/mo',
    desc: 'For practices ready to fully automate their front desk.',
    features: [
      'Unlimited AI-handled calls',
      'Everything in Starter',
      'Real-time analytics dashboard',
      'Staff review & approval workflow',
      'No-show reminders & follow-ups',
      'Priority support',
    ],
    cta: 'Start Free Trial',
    popular: true,
  },
  {
    name: 'Enterprise',
    price: 'Custom',
    period: '',
    desc: 'Multi-location groups and DSOs with bespoke requirements.',
    features: [
      'Unlimited locations',
      'Custom AI voice & persona',
      'PMS integrations',
      'Dedicated account manager',
      'SLA guarantee',
      'On-site onboarding',
    ],
    cta: 'Talk to Sales',
    popular: false,
  },
];

const faqs = [
  {
    q: 'Is there a setup fee?',
    a: 'No setup fees ever. You pay the monthly subscription and nothing else.',
  },
  {
    q: 'Can I cancel anytime?',
    a: 'Yes. Cancel from your dashboard at any time — no penalties, no notice period.',
  },
  {
    q: 'How long does setup take?',
    a: 'Most practices are live within 15 minutes. We connect your calendar and phone number, train the AI on your FAQs, and you go live.',
  },
  {
    q: 'Does it work with my existing phone number?',
    a: 'Yes. Dentora can forward calls from your existing number or ring on an additional number you provide.',
  },
];

export default function PricingPage() {
  return (
    <>
      <MarketingStyles />
      <div className="mx-auto max-w-6xl px-6 py-20 lg:px-8">
        <PageHeader
          eyebrow="// pricing"
          title="Simple, transparent pricing."
          subtitle="No setup fees. No long-term contracts. Cancel anytime."
        />

        {/* Plans */}
        <div className="grid gap-5 md:grid-cols-3">
          {plans.map((plan, i) => (
            <motion.div
              key={plan.name}
              {...d(i * 0.08)}
              className={cn(
                'relative flex flex-col rounded-2xl border p-7',
                plan.popular
                  ? 'border-blue-500/40 bg-blue-600/8'
                  : 'border-white/[0.07] bg-white/[0.02]',
              )}
            >
              {plan.popular && (
                <span className="absolute -top-3 left-1/2 -translate-x-1/2 whitespace-nowrap rounded-full bg-blue-600 px-4 py-1 text-xs font-semibold text-white">
                  Most Popular
                </span>
              )}
              <div className="mb-6">
                <p className="font-mono text-[10px] uppercase tracking-widest text-white/30">
                  {plan.name}
                </p>
                <div className="mt-2 flex items-baseline gap-1">
                  <span className="text-4xl font-bold text-white">{plan.price}</span>
                  <span className="text-gray-400">{plan.period}</span>
                </div>
                <p className="mt-2 text-sm leading-relaxed text-gray-400">{plan.desc}</p>
              </div>
              <ul className="mb-8 flex-1 space-y-3">
                {plan.features.map((f) => (
                  <li key={f} className="flex items-start gap-2.5 text-sm text-gray-300">
                    <Check className="mt-0.5 size-4 shrink-0 text-blue-400" />
                    {f}
                  </li>
                ))}
              </ul>
              <Link
                href="/contact"
                className={cn(
                  'flex h-10 items-center justify-center rounded-xl text-sm font-semibold transition',
                  plan.popular
                    ? 'bg-blue-600 text-white hover:bg-blue-500'
                    : 'border border-white/10 text-white hover:bg-white/5',
                )}
              >
                {plan.cta}
              </Link>
            </motion.div>
          ))}
        </div>

        {/* FAQ terminal */}
        <motion.div {...inView} className="mt-16">
          <TerminalWindow title="dentora@ai:~ — pricing_faq">
            <div className="divide-y divide-white/[0.05]">
              {faqs.map((faq, i) => (
                <motion.div key={faq.q} {...d(i * 0.08)} className="p-6">
                  <p className="mb-2 font-mono text-[12px]">
                    <span className="text-white/25">$</span>{' '}
                    <span className="text-blue-400">ask</span>{' '}
                    <span className="text-white/60">&quot;{faq.q}&quot;</span>
                  </p>
                  <p className="font-mono text-[12px] text-green-400/70">▸ {faq.a}</p>
                </motion.div>
              ))}
            </div>
          </TerminalWindow>
        </motion.div>

        {/* Trust strip */}
        <motion.div
          {...inView}
          className="mt-10 flex flex-wrap items-center justify-center gap-6 font-mono text-[11px] text-white/25"
        >
          {['no credit card', 'setup in 15 min', 'cancel anytime', 'UK GDPR compliant'].map((t) => (
            <span key={t} className="flex items-center gap-1.5">
              <span className="text-blue-400">✓</span> {t}
            </span>
          ))}
        </motion.div>
      </div>
    </>
  );
}
