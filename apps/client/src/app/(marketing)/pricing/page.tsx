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
              'mk-panel mk-lift relative flex flex-col rounded-3xl p-7',
              plan.popular && 'ring-1 ring-inset ring-[#4fc3f7]/35',
            )}
          >
            {plan.popular && (
              <>
                <div className="mk-glow mk-glow-primary pointer-events-none left-1/2 top-[-40px] size-56 -translate-x-1/2 opacity-40" />
                <span className="mk-btn-primary absolute -top-3 left-1/2 -translate-x-1/2 whitespace-nowrap rounded-full px-4 py-1 text-xs font-semibold">
                  Most Popular
                </span>
              </>
            )}
            <div className="relative mb-6">
              <p className="text-xs font-medium uppercase tracking-[0.18em] mk-faint">
                {plan.name}
              </p>
              <div className="mt-2 flex items-baseline gap-1">
                <span className="font-display bg-gradient-to-b from-[#2bb0ef] to-[#0a6aa3] bg-clip-text text-4xl font-bold text-transparent">
                  {plan.price}
                </span>
                <span className="mk-faint">{plan.period}</span>
              </div>
              <p className="mt-2 text-sm leading-relaxed mk-muted">{plan.desc}</p>
            </div>
            <ul className="relative mb-8 flex-1 space-y-3">
              {plan.features.map((f) => (
                <li key={f} className="flex items-start gap-2.5 text-sm mk-body">
                  <Check className="mt-0.5 size-4 shrink-0 mk-accent" />
                  {f}
                </li>
              ))}
            </ul>
            <Link
              href="/contact"
              className={cn(
                'relative flex h-11 items-center justify-center rounded-full text-sm font-semibold transition',
                plan.popular ? 'mk-btn-primary' : 'mk-btn-ghost mk-heading',
              )}
            >
              {plan.cta}
            </Link>
          </motion.div>
        ))}
      </div>

      {/* FAQ */}
      <motion.div {...inView} className="mt-20">
        <h2 className="mb-8 text-center font-display text-2xl font-bold tracking-[-0.02em] mk-heading">
          Common questions
        </h2>
        <div className="grid gap-4 sm:grid-cols-2">
          {faqs.map((faq, i) => (
            <motion.div key={faq.q} {...d(i * 0.08)} className="mk-panel mk-lift rounded-2xl p-6">
              <p className="mb-2 text-sm font-semibold mk-heading">{faq.q}</p>
              <p className="text-sm leading-relaxed mk-muted">{faq.a}</p>
            </motion.div>
          ))}
        </div>
      </motion.div>

      {/* Trust strip */}
      <motion.div
        {...inView}
        className="mt-10 flex flex-wrap items-center justify-center gap-6 text-[12px] mk-faint"
      >
        {['no credit card', 'setup in 15 min', 'cancel anytime', 'UK GDPR compliant'].map((t) => (
          <span key={t} className="flex items-center gap-1.5">
            <span className="mk-accent">✓</span> {t}
          </span>
        ))}
      </motion.div>
    </div>
  );
}
