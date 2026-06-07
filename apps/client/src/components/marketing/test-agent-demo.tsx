'use client';

import { AnimatePresence, motion } from 'framer-motion';
import {
  ArrowRight,
  CheckCircle2,
  Clock,
  Copy,
  MessageSquare,
  Phone,
  PhoneCall,
  Sparkles,
} from 'lucide-react';
import { useState } from 'react';
import { CountrySelect } from '@/components/marketing/country-select';
import { submitDemoRequest } from '@/features/demo/demoApi';
import { DEFAULT_COUNTRY, type Country } from '@/lib/country-codes';
import { cn } from '@/lib/utils';

/* ── Dentora's live demo agent number ───────────────────────────── */
const AGENT_NUMBER_DISPLAY = '+44 1322 946862';
const AGENT_NUMBER_TEL = '+441322946862';

const EASE = [0.25, 0.46, 0.45, 0.94] as const;
const SPRING = { type: 'spring', stiffness: 260, damping: 22 } as const;

const inView = {
  initial: { opacity: 0, y: 24 },
  whileInView: { opacity: 1, y: 0 },
  viewport: { once: true, margin: '-80px' },
  transition: { duration: 0.6, ease: EASE },
};

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

interface Errors {
  fullName?: string;
  email?: string;
  phone?: string;
  message?: string;
}

const inputBase =
  'h-12 w-full rounded-xl border bg-[var(--mk-inset-bg)] px-4 text-sm mk-body outline-none transition-colors placeholder:text-[var(--mk-faint)] focus:border-[var(--mk-accent)] focus:ring-2 focus:ring-[color-mix(in_srgb,var(--brand-primary)_18%,transparent)]';

export function TestAgentDemo() {
  const [fullName, setFullName] = useState('');
  const [email, setEmail] = useState('');
  const [country, setCountry] = useState<Country>(DEFAULT_COUNTRY);
  const [phone, setPhone] = useState('');
  const [message, setMessage] = useState('');
  const [errors, setErrors] = useState<Errors>({});
  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [copied, setCopied] = useState(false);

  const validate = (): boolean => {
    const next: Errors = {};
    if (fullName.trim().length < 2) next.fullName = 'Please enter your full name.';
    if (!EMAIL_RE.test(email.trim())) next.email = 'Please enter a valid email address.';
    if (phone.replace(/\D/g, '').length < 6) next.phone = 'Please enter a valid phone number.';
    if (message.trim().length < 5) next.message = 'Tell us a little more (5+ characters).';
    setErrors(next);
    return Object.keys(next).length === 0;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (submitting) return;
    if (!validate()) return;

    setSubmitting(true);
    const nationalDigits = phone.replace(/\D/g, '').replace(/^0+/, '');
    await submitDemoRequest({
      fullName: fullName.trim(),
      email: email.trim(),
      phoneE164: `${country.dial}${nationalDigits}`,
      phoneCountry: country.iso,
      message: message.trim(),
      source: 'landing_test_agent',
    });
    setSubmitting(false);
    setSubmitted(true);
  };

  const copyNumber = async () => {
    try {
      await navigator.clipboard.writeText(AGENT_NUMBER_DISPLAY);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      /* clipboard unavailable — the Call button still works */
    }
  };

  const reset = () => {
    setSubmitted(false);
    setFullName('');
    setEmail('');
    setPhone('');
    setMessage('');
    setCountry(DEFAULT_COUNTRY);
    setErrors({});
  };

  return (
    <section id="try-demo" className="relative isolate scroll-mt-24 px-6 py-24 lg:px-8">
      {/* ambient depth */}
      <div className="pointer-events-none absolute inset-0 -z-10 overflow-hidden">
        <div className="mk-glow mk-glow-primary mk-animate-breathe left-1/2 top-0 size-[520px] -translate-x-1/2" />
      </div>

      <div className="mx-auto grid max-w-7xl items-center gap-12 lg:grid-cols-[1fr_1.05fr]">
        {/* ── Left: pitch ─────────────────────────────────────── */}
        <motion.div {...inView} className="text-center lg:text-left">
          <span className="mk-chip mb-4 inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-medium uppercase tracking-wider mk-accent">
            <Sparkles className="size-3" />
            Live demo
          </span>
          <h2 className="font-display text-3xl font-bold leading-[1.1] tracking-[-0.025em] mk-heading md:text-[2.5rem]">
            Hear Dentora answer{' '}
            <span className="bg-gradient-to-r from-[#22a6e2] to-[#0a6aa3] bg-clip-text text-transparent">
              for yourself.
            </span>
          </h2>
          <p className="mx-auto mt-4 max-w-md text-lg leading-relaxed mk-muted lg:mx-0">
            Add a few details and we&apos;ll show you a number you can call right away. Ask it
            anything a patient might ask, like booking an appointment, prices or opening hours, then
            hear how it responds.
          </p>

          <ul className="mt-8 space-y-3">
            {[
              { icon: Clock, label: 'Answers in under a second, 24/7' },
              { icon: PhoneCall, label: 'Natural, human-like voice' },
              { icon: CheckCircle2, label: 'Books real appointments on the call' },
            ].map(({ icon: Icon, label }) => (
              <li
                key={label}
                className="flex items-center justify-center gap-3 text-[15px] mk-body lg:justify-start"
              >
                <span className="mk-icon-tile flex size-8 shrink-0 items-center justify-center rounded-lg">
                  <Icon className="size-4 text-[#0a84c9]" />
                </span>
                {label}
              </li>
            ))}
          </ul>
        </motion.div>

        {/* ── Right: form / success card ──────────────────────── */}
        <motion.div {...inView} transition={{ ...inView.transition, delay: 0.1 }}>
          <div className="mk-panel relative rounded-3xl p-6 sm:p-8">
            <AnimatePresence mode="wait" initial={false}>
              {!submitted ? (
                <motion.form
                  key="form"
                  onSubmit={handleSubmit}
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  exit={{ opacity: 0, y: -8 }}
                  transition={{ duration: 0.25, ease: EASE }}
                  className="space-y-4"
                  noValidate
                >
                  <div>
                    <h3 className="font-display text-xl font-bold mk-heading">
                      Try our AI receptionist
                    </h3>
                    <p className="mt-1 text-sm mk-muted">
                      Takes 20 seconds. We&apos;ll reveal the number instantly.
                    </p>
                  </div>

                  <Field label="Full name" error={errors.fullName}>
                    <input
                      className={cn(
                        inputBase,
                        errors.fullName ? 'border-red-400/70' : 'border-[var(--mk-hairline)]',
                      )}
                      placeholder="Jane Smith"
                      value={fullName}
                      onChange={(e) => setFullName(e.target.value)}
                      autoComplete="name"
                    />
                  </Field>

                  <Field label="Email" error={errors.email}>
                    <input
                      type="email"
                      className={cn(
                        inputBase,
                        errors.email ? 'border-red-400/70' : 'border-[var(--mk-hairline)]',
                      )}
                      placeholder="jane@clinic.com"
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      autoComplete="email"
                      inputMode="email"
                    />
                  </Field>

                  <Field label="Phone number" error={errors.phone}>
                    <div className="flex">
                      <CountrySelect value={country} onChange={setCountry} />
                      <input
                        type="tel"
                        inputMode="tel"
                        className={cn(
                          'h-12 w-full rounded-r-xl border bg-[var(--mk-inset-bg)] px-4 text-sm mk-body outline-none transition-colors placeholder:text-[var(--mk-faint)] focus:border-[var(--mk-accent)] focus:ring-2 focus:ring-[color-mix(in_srgb,var(--brand-primary)_18%,transparent)]',
                          errors.phone ? 'border-red-400/70' : 'border-[var(--mk-hairline)]',
                        )}
                        placeholder="7700 900123"
                        value={phone}
                        onChange={(e) => setPhone(e.target.value)}
                        autoComplete="tel-national"
                      />
                    </div>
                  </Field>

                  <Field label="What would you like to test on the call?" error={errors.message}>
                    <textarea
                      rows={3}
                      className={cn(
                        'w-full resize-none rounded-xl border bg-[var(--mk-inset-bg)] px-4 py-3 text-sm mk-body outline-none transition-colors placeholder:text-[var(--mk-faint)] focus:border-[var(--mk-accent)] focus:ring-2 focus:ring-[color-mix(in_srgb,var(--brand-primary)_18%,transparent)]',
                        errors.message ? 'border-red-400/70' : 'border-[var(--mk-hairline)]',
                      )}
                      placeholder="For example, booking a checkup or asking about your prices."
                      value={message}
                      onChange={(e) => setMessage(e.target.value)}
                    />
                  </Field>

                  <button
                    type="submit"
                    disabled={submitting}
                    className="mk-btn-primary inline-flex h-12 w-full items-center justify-center gap-2 rounded-full text-[15px] font-semibold disabled:opacity-70"
                  >
                    {submitting ? (
                      'Getting your number…'
                    ) : (
                      <>
                        Reveal the number <ArrowRight className="size-4" />
                      </>
                    )}
                  </button>
                  <p className="text-center text-xs mk-faint">
                    We&apos;ll only use your details to follow up about Dentora. No spam.
                  </p>
                </motion.form>
              ) : (
                <motion.div
                  key="success"
                  initial={{ opacity: 0, y: 12 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ duration: 0.4, ease: EASE }}
                  className="text-center"
                >
                  <motion.div
                    initial={{ scale: 0, rotate: -20 }}
                    animate={{ scale: 1, rotate: 0 }}
                    transition={SPRING}
                    className="mx-auto flex size-16 items-center justify-center rounded-full bg-emerald-500/12 ring-1 ring-inset ring-emerald-500/25"
                  >
                    <CheckCircle2 className="size-8 text-emerald-500" />
                  </motion.div>

                  <h3 className="mt-5 font-display text-2xl font-bold mk-heading">
                    You&apos;re all set!
                  </h3>
                  <p className="mx-auto mt-2 max-w-sm text-sm mk-muted">
                    Call the number below and ask our AI receptionist anything. It&apos;s live and
                    ready right now.
                  </p>

                  {/* number pill */}
                  <motion.div
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: 0.15, duration: 0.4, ease: EASE }}
                    className="mt-6"
                  >
                    <div className="mk-inset relative mx-auto flex items-center justify-center gap-3 rounded-2xl px-5 py-4">
                      <Phone className="size-5 text-[#0a84c9]" />
                      <span className="font-display text-2xl font-bold tracking-tight">
                        <span className="bg-gradient-to-r from-[#2bb0ef] to-[#0a6aa3] bg-clip-text text-transparent">
                          {AGENT_NUMBER_DISPLAY}
                        </span>
                      </span>
                    </div>
                  </motion.div>

                  <div className="mt-5 flex flex-col gap-2.5 sm:flex-row">
                    <a
                      href={`tel:${AGENT_NUMBER_TEL}`}
                      className="mk-btn-primary inline-flex h-12 flex-1 items-center justify-center gap-2 rounded-full text-[15px] font-semibold"
                    >
                      <PhoneCall className="size-4" />
                      Call now
                    </a>
                    <button
                      type="button"
                      onClick={copyNumber}
                      className="mk-btn-ghost inline-flex h-12 flex-1 items-center justify-center gap-2 rounded-full text-[15px] font-medium"
                    >
                      {copied ? (
                        <>
                          <CheckCircle2 className="size-4 text-emerald-500" />
                          Copied!
                        </>
                      ) : (
                        <>
                          <Copy className="size-4" />
                          Copy number
                        </>
                      )}
                    </button>
                  </div>

                  <div className="mt-5 flex items-center justify-center gap-4 text-xs mk-faint">
                    <span className="flex items-center gap-1.5">
                      <Clock className="size-3.5" /> Available 24/7
                    </span>
                    <span className="flex items-center gap-1.5">
                      <MessageSquare className="size-3.5" /> Free to test
                    </span>
                  </div>

                  <button
                    type="button"
                    onClick={reset}
                    className="mt-6 text-sm font-medium mk-accent transition-opacity hover:opacity-80"
                  >
                    Submit another response
                  </button>
                </motion.div>
              )}
            </AnimatePresence>
          </div>
        </motion.div>
      </div>
    </section>
  );
}

function Field({
  label,
  error,
  children,
}: {
  label: string;
  error?: string;
  children: React.ReactNode;
}) {
  return (
    <div>
      <label className="mb-1.5 block text-sm font-medium mk-body">{label}</label>
      {children}
      <AnimatePresence>
        {error && (
          <motion.p
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: 'auto' }}
            exit={{ opacity: 0, height: 0 }}
            className="mt-1 text-xs text-red-500"
          >
            {error}
          </motion.p>
        )}
      </AnimatePresence>
    </div>
  );
}
