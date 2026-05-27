'use client';

import { motion } from 'framer-motion';
import { Check } from 'lucide-react';
import Link from 'next/link';
import { cn } from '@/lib/utils';
import { PageHeader, d, inView } from '@/components/marketing/shared';

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
    <div className="mx-auto max-w-6xl px-6 py-20 lg:px-8">
      <PageHeader
        eyebrow="Pricing"
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
              'relative flex flex-col rounded-2xl border p-7 shadow-sm',
              plan.popular
                ? 'border-[#4fc3f7]/40 bg-[#4fc3f7]/[0.04]'
                : 'border-white/10 bg-[#111827]',
            )}
          >
            {plan.popular && (
              <span className="absolute -top-3 left-1/2 -translate-x-1/2 whitespace-nowrap rounded-full bg-[#4fc3f7] px-4 py-1 text-xs font-semibold text-white">
                Most Popular
              </span>
            )}
            <div className="mb-6">
              <p className="text-xs font-medium uppercase tracking-widest text-[#c7d0d9]/50">
                {plan.name}
              </p>
              <div className="mt-2 flex items-baseline gap-1">
                <span className="font-display text-4xl font-bold text-[#c7d0d9]">{plan.price}</span>
                <span className="text-[#c7d0d9]/50">{plan.period}</span>
              </div>
              <p className="mt-2 text-sm leading-relaxed text-[#c7d0d9]/60">{plan.desc}</p>
            </div>
            <ul className="mb-8 flex-1 space-y-3">
              {plan.features.map((f) => (
                <li key={f} className="flex items-start gap-2.5 text-sm text-[#c7d0d9]/70">
                  <Check className="mt-0.5 size-4 shrink-0 text-[#4fc3f7]" />
                  {f}
                </li>
              ))}
            </ul>
            <Link
              href="/contact"
              className={cn(
                'flex h-11 items-center justify-center rounded-full text-sm font-semibold transition',
                plan.popular
                  ? 'bg-[#4fc3f7] text-white hover:bg-[#38b2f0]'
                  : 'border border-white/10 text-[#c7d0d9] hover:bg-black/[0.03]',
              )}
            >
              {plan.cta}
            </Link>
          </motion.div>
        ))}
      </div>

      {/* FAQ */}
      <motion.div {...inView} className="mt-16">
        <h2 className="mb-6 text-center font-display text-2xl font-bold text-[#c7d0d9]">
          Common questions
        </h2>
        <div className="grid gap-4 sm:grid-cols-2">
          {faqs.map((faq, i) => (
            <motion.div
              key={faq.q}
              {...d(i * 0.08)}
              className="rounded-2xl border border-white/10 bg-[#111827] p-6 shadow-sm"
            >
              <p className="mb-2 text-sm font-semibold text-[#c7d0d9]">{faq.q}</p>
              <p className="text-sm text-[#c7d0d9]/60">{faq.a}</p>
            </motion.div>
          ))}
        </div>
      </motion.div>

      {/* Trust strip */}
      <motion.div
        {...inView}
        className="mt-10 flex flex-wrap items-center justify-center gap-6 text-[12px] text-[#c7d0d9]/50"
      >
        {['no credit card', 'setup in 15 min', 'cancel anytime', 'UK GDPR compliant'].map((t) => (
          <span key={t} className="flex items-center gap-1.5">
            <span className="text-[#4fc3f7]">✓</span> {t}
          </span>
        ))}
      </motion.div>
    </div>
  );
}
