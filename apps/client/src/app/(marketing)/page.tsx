'use client';

import {
  Phone,
  CalendarCheck,
  MessageSquare,
  Bell,
  BarChart3,
  ChevronRight,
  ChevronLeft,
  CheckCircle2,
  Check,
  ArrowRight,
  PhoneCall,
  Star,
} from 'lucide-react';
import Image from 'next/image';
import Link from 'next/link';

/* ─── Hero Section ─── */
function HeroSection() {
  return (
    <section className="relative overflow-hidden bg-gradient-to-b from-[#0a0e1a] via-[#0d1220] to-[#0a0e1a]">
      <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_top_right,rgba(37,99,235,0.08),transparent_60%)]" />
      <div className="mx-auto max-w-7xl px-6 py-16 lg:px-8 lg:py-24">
        <div className="grid items-center gap-12 lg:grid-cols-2">
          <div className="relative z-10">
            <p className="mb-6 text-sm font-semibold uppercase tracking-widest text-blue-400">
              AI RECEPTIONIST FOR DENTAL CLINICS
            </p>
            <h1 className="text-4xl font-bold leading-tight tracking-tight text-white md:text-5xl lg:text-6xl">
              Never Miss a Patient.
              <br />
              <span className="bg-gradient-to-r from-blue-400 to-blue-600 bg-clip-text text-transparent">
                Grow Your Practice.
              </span>
            </h1>
            <p className="mt-6 max-w-lg text-lg leading-relaxed text-gray-400">
              Dentora is your 24/7 AI receptionist that answers calls, books appointments, confirms visits and handles patient inquiries – so your team can focus on care.
            </p>

            <div className="mt-8 flex flex-wrap items-center gap-4">
              <Link
                href="/contact"
                className="inline-flex items-center gap-2 rounded-full bg-blue-600 px-7 py-3.5 text-sm font-semibold text-white transition hover:bg-blue-700"
              >
                Book a Demo
                <span className="text-xs text-blue-200">See Dentora in action</span>
              </Link>
              <button className="inline-flex items-center gap-3 rounded-full border border-white/10 bg-white/5 px-6 py-3.5 text-sm font-medium text-white transition hover:bg-white/10">
                <div className="flex size-8 items-center justify-center rounded-full border border-white/20">
                  <svg viewBox="0 0 24 24" className="ml-0.5 size-3.5 fill-white">
                    <polygon points="5,3 19,12 5,21" />
                  </svg>
                </div>
                Watch Video
                <span className="text-xs text-gray-400">2 min overview</span>
              </button>
            </div>

            <div className="mt-10 flex flex-wrap gap-6">
              {[
                { icon: Phone, label: '24/7 AI Answering', sub: 'Never miss a call' },
                { icon: CalendarCheck, label: 'Smart Scheduling', sub: 'More bookings' },
                { icon: MessageSquare, label: 'Insurance & FAQs', sub: 'Instant answers' },
                { icon: CheckCircle2, label: 'HIPAA Compliant', sub: 'Secure & private' },
              ].map((item) => (
                <div key={item.label} className="flex items-center gap-2">
                  <div className="flex size-8 items-center justify-center rounded-full bg-blue-500/10">
                    <item.icon className="size-4 text-blue-400" />
                  </div>
                  <div>
                    <p className="text-xs font-medium text-white">{item.label}</p>
                    <p className="text-[10px] text-gray-500">{item.sub}</p>
                  </div>
                </div>
              ))}
            </div>
          </div>

          <div className="relative">
            <div className="relative mx-auto max-w-md lg:max-w-none">
              {/* Chat bubble */}
              <div className="absolute -top-4 left-1/4 z-20 rounded-xl border border-white/10 bg-[#1a1f35]/90 px-4 py-3 shadow-xl backdrop-blur-sm">
                <div className="flex items-center gap-2">
                  <span className="text-lg">😊</span>
                  <div>
                    <p className="text-xs font-medium text-white">Hi! This is Dentora.</p>
                    <p className="text-[11px] text-gray-400">How can I help you today?</p>
                  </div>
                </div>
              </div>

              {/* Menu options */}
              <div className="absolute left-8 top-16 z-20 space-y-2">
                {['Book an Appointment', 'Check Appointment', 'Insurance Questions', 'Other Inquiries'].map((item) => (
                  <div
                    key={item}
                    className="rounded-lg border border-white/10 bg-[#1a1f35]/80 px-4 py-2 text-xs text-gray-300 shadow backdrop-blur-sm"
                  >
                    {item}
                  </div>
                ))}
              </div>

              {/* AI character placeholder */}
              <div className="relative mx-auto flex h-80 w-80 items-center justify-center lg:h-96 lg:w-96">
                <div className="absolute inset-0 rounded-full bg-gradient-to-b from-blue-600/20 to-transparent" />
                <div className="relative flex size-48 items-center justify-center rounded-full bg-gradient-to-b from-blue-500/30 to-blue-600/10 lg:size-56">
                  <Image
                    src="/dentora.png"
                    alt="Dentora AI"
                    width={200}
                    height={200}
                    className="h-32 w-auto opacity-80 lg:h-40"
                  />
                </div>
              </div>

              {/* Appointment confirmed card */}
              <div className="absolute -right-4 top-8 z-20 rounded-xl border border-white/10 bg-[#1a1f35]/90 p-4 shadow-xl backdrop-blur-sm lg:right-0">
                <div className="flex items-center gap-2">
                  <p className="text-xs font-semibold text-white">New Appointment</p>
                  <span className="text-xs text-green-400">Confirmed! 🎉</span>
                </div>
                <div className="mt-2 space-y-1 text-[11px] text-gray-400">
                  <p>Patient: Sarah Johnson</p>
                  <p>Date: May 24, 2024</p>
                  <p>Time: 10:00 AM</p>
                </div>
              </div>

              {/* Call summary card */}
              <div className="absolute -right-4 bottom-16 z-20 rounded-xl border border-white/10 bg-[#1a1f35]/90 p-4 shadow-xl backdrop-blur-sm lg:right-0">
                <div className="flex items-center gap-2">
                  <PhoneCall className="size-3.5 text-blue-400" />
                  <p className="text-xs font-semibold text-white">Call Summary</p>
                </div>
                <div className="mt-2 space-y-1 text-[11px] text-gray-400">
                  <p>New patient inquiry</p>
                  <p>Teeth cleaning</p>
                  <p>Insurance: Dental</p>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}

/* ─── Stats Section ─── */
function StatsSection() {
  const stats = [
    { icon: Phone, value: '98%', label: 'Call Answer Rate' },
    { icon: CalendarCheck, value: '3x', label: 'More Appointments' },
    { icon: BarChart3, value: '45%', label: 'Reduction in No-Shows' },
    { icon: Phone, value: '24/7', label: 'Always Available' },
  ];

  const logos = [
    'Smile Dental Care',
    'Brighter Smiles',
    'Oakridge Dental',
    'Pearl Dental Care',
    'Summit Ridge Dental',
    'Sunshine Dental Group',
  ];

  return (
    <section className="bg-[#0a0e1a] py-12">
      <div className="mx-auto max-w-6xl px-6 lg:px-8">
        <div className="rounded-2xl border border-white/[0.06] bg-[#0f1424]/80 p-8">
          <h3 className="mb-8 text-center text-lg font-semibold text-white">
            Trusted by Forward-Thinking Dental Practices
          </h3>
          <div className="grid grid-cols-2 gap-6 md:grid-cols-4">
            {stats.map((stat) => (
              <div key={stat.label} className="flex items-center gap-3">
                <div className="flex size-10 shrink-0 items-center justify-center rounded-full bg-blue-500/10">
                  <stat.icon className="size-5 text-blue-400" />
                </div>
                <div>
                  <p className="text-2xl font-bold text-white">{stat.value}</p>
                  <p className="text-xs text-gray-400">{stat.label}</p>
                </div>
              </div>
            ))}
          </div>

          <div className="mt-10 border-t border-white/5 pt-8">
            <div className="flex flex-wrap items-center justify-center gap-8">
              {logos.map((name) => (
                <div key={name} className="flex items-center gap-2 text-sm text-gray-500">
                  <div className="flex size-6 items-center justify-center rounded bg-blue-500/10">
                    <span className="text-[10px] text-blue-400">⚕</span>
                  </div>
                  <span className="text-xs font-medium uppercase tracking-wide">{name}</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}

/* ─── Features Section ─── */
function FeaturesSection() {
  const features = [
    {
      icon: Phone,
      title: 'AI Call Answering',
      description: 'Dentora answers calls instantly, sounds natural, and never keeps patients on hold.',
    },
    {
      icon: CalendarCheck,
      title: 'Smart Scheduling',
      description: 'Books, reschedules and cancels appointments seamlessly into your calendar.',
    },
    {
      icon: MessageSquare,
      title: 'Patient Inquiries',
      description: 'Answers insurance, pricing, treatment and general questions instantly.',
    },
    {
      icon: Bell,
      title: 'Reminders & Follow-ups',
      description: 'Sends automated recalls, confirmations and follow-ups to patients.',
    },
    {
      icon: BarChart3,
      title: 'Insights & Analytics',
      description: 'Track calls, bookings and conversions with powerful real-time analytics.',
    },
  ];

  return (
    <section id="features" className="bg-[#0a0e1a] py-20">
      <div className="mx-auto max-w-6xl px-6 lg:px-8">
        <div className="mb-12 text-center">
          <p className="mb-3 text-sm font-semibold uppercase tracking-widest text-blue-400">FEATURES</p>
          <h2 className="text-3xl font-bold text-white md:text-4xl">
            Everything Your Front Desk Does.
            <br />
            <span className="bg-gradient-to-r from-blue-400 to-blue-600 bg-clip-text text-transparent">And More.</span>
          </h2>
        </div>

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-5">
          {features.map((feature) => (
            <div
              key={feature.title}
              className="group rounded-xl border border-white/[0.06] bg-[#0f1424]/60 p-6 transition hover:border-blue-500/30 hover:bg-[#0f1424]"
            >
              <div className="mb-4 flex size-12 items-center justify-center rounded-xl bg-blue-500/10">
                <feature.icon className="size-6 text-blue-400" />
              </div>
              <h3 className="mb-2 text-sm font-semibold text-white">{feature.title}</h3>
              <p className="text-xs leading-relaxed text-gray-400">{feature.description}</p>
              <Link
                href="#"
                className="mt-4 inline-flex items-center gap-1 text-xs font-medium text-blue-400 transition hover:text-blue-300"
              >
                Learn more <ArrowRight className="size-3" />
              </Link>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

/* ─── How It Works + Demo Form (side by side) ─── */
function HowItWorksAndDemoSection() {
  const steps = [
    {
      number: 1,
      title: 'We Answer',
      description: 'Dentora answers calls and chats like a real person.',
      color: 'text-blue-400',
    },
    {
      number: 2,
      title: 'We Understand',
      description: 'Our AI listens, understands and handles the request.',
      color: 'text-blue-400',
    },
    {
      number: 3,
      title: 'We Take Action',
      description: 'Appointments booked, questions answered, tasks completed.',
      color: 'text-red-400',
    },
  ];

  return (
    <section id="how-it-works" className="bg-[#0a0e1a] py-20">
      <div className="mx-auto max-w-7xl px-6 lg:px-8">
        <div className="grid items-start gap-10 lg:grid-cols-3">
          {/* Left: How it works + steps */}
          <div>
            <p className="mb-2 text-xs font-semibold uppercase tracking-widest text-blue-400">HOW IT WORKS</p>
            <h2 className="mb-10 text-3xl font-bold text-white md:text-4xl">
              Simple. Powerful. Effortless.
            </h2>

            <div className="space-y-8">
              {steps.map((step) => (
                <div key={step.number} className="flex gap-4">
                  <div className="flex size-10 shrink-0 items-center justify-center rounded-full bg-blue-500/10">
                    <Phone className="size-5 text-blue-400" />
                  </div>
                  <div>
                    <div className="flex items-center gap-2">
                      <span className={`text-sm font-bold ${step.color}`}>{step.number}</span>
                      <h3 className={`text-lg font-semibold ${step.color}`}>{step.title}</h3>
                    </div>
                    <p className="mt-1 text-sm text-gray-400">{step.description}</p>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Center: Phone mockup */}
          <div className="flex justify-center">
            <div className="relative w-56">
              <div className="rounded-[2.5rem] border-2 border-white/10 bg-[#0f1424] p-2.5">
                <div className="rounded-[2rem] bg-[#1a1f35] p-5">
                  <div className="flex items-center justify-center py-3">
                    <Image
                      src="/dentora.png"
                      alt="Dentora"
                      width={200}
                      height={200}
                      className="h-7 w-auto"
                    />
                  </div>

                  <div className="my-5 flex justify-center">
                    <div className="flex items-center gap-0.5">
                      {[...Array(11)].map((_, i) => (
                        <div
                          key={i}
                          className="w-[3px] rounded-full bg-blue-400/50"
                          style={{ height: `${8 + Math.sin(i * 0.7) * 12}px` }}
                        />
                      ))}
                    </div>
                  </div>

                  <div className="rounded-xl bg-white/5 p-3 text-center">
                    <p className="text-[11px] text-gray-300">Hi! This is Dentora.</p>
                    <p className="mt-0.5 text-[10px] text-gray-400">How can I help you?</p>
                  </div>

                  <div className="mt-6 flex justify-center gap-3">
                    <div className="flex size-10 items-center justify-center rounded-full bg-red-500">
                      <Phone className="size-4 text-white" />
                    </div>
                    <div className="flex size-10 items-center justify-center rounded-full bg-green-500">
                      <Phone className="size-4 text-white" />
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* Right: Demo form */}
          <div className="rounded-2xl border border-white/[0.06] bg-[#0f1424]/60 p-6 lg:p-8">
            <p className="mb-2 text-xs font-semibold uppercase tracking-widest text-blue-400">BOOK A LIVE DEMO</p>
            <h2 className="mb-1 text-xl font-bold text-white">See Dentora in Action</h2>
            <p className="mb-6 text-xs text-gray-400">
              Discover how our AI receptionist can help your dental practice save time and grow.
            </p>

            <form className="space-y-3" onSubmit={(e) => e.preventDefault()}>
              <div className="grid grid-cols-2 gap-3">
                <input
                  type="text"
                  placeholder="Full Name"
                  className="rounded-lg border border-white/10 bg-white/5 px-3 py-2.5 text-xs text-white placeholder:text-gray-500 focus:border-blue-500 focus:outline-none"
                />
                <input
                  type="email"
                  placeholder="Email Address"
                  className="rounded-lg border border-white/10 bg-white/5 px-3 py-2.5 text-xs text-white placeholder:text-gray-500 focus:border-blue-500 focus:outline-none"
                />
                <input
                  type="text"
                  placeholder="Practice Name"
                  className="rounded-lg border border-white/10 bg-white/5 px-3 py-2.5 text-xs text-white placeholder:text-gray-500 focus:border-blue-500 focus:outline-none"
                />
                <input
                  type="tel"
                  placeholder="Phone Number"
                  className="rounded-lg border border-white/10 bg-white/5 px-3 py-2.5 text-xs text-white placeholder:text-gray-500 focus:border-blue-500 focus:outline-none"
                />
              </div>
              <input
                type="text"
                placeholder="Preferred Date"
                className="w-full rounded-lg border border-white/10 bg-white/5 px-3 py-2.5 text-xs text-white placeholder:text-gray-500 focus:border-blue-500 focus:outline-none"
              />
              <button
                type="submit"
                className="flex w-full items-center justify-center gap-2 rounded-lg bg-blue-600 px-5 py-3 text-sm font-semibold text-white transition hover:bg-blue-700"
              >
                Book My Demo <ArrowRight className="size-4" />
              </button>
              <div className="flex items-center justify-center gap-2 text-[11px] text-gray-400">
                <CheckCircle2 className="size-3.5 text-gray-500" />
                No commitment. Just a 30-min demo.
              </div>
            </form>
          </div>
        </div>
      </div>
    </section>
  );
}

/* ─── Testimonials Section ─── */
function TestimonialsSection() {
  const testimonials = [
    {
      quote: "Dentora has been a game-changer for our practice. We never miss calls anymore and our schedule is fuller than ever!",
      name: 'Dr. Jessica Miller',
      role: 'Smile Dental Care',
    },
    {
      quote: "The AI is incredibly natural. Patients think they're talking to a real person. Our team loves the relief it brings.",
      name: 'Dr. Mark Reynolds',
      role: 'Oakridge Dental',
    },
    {
      quote: "We reduced no-shows by 45% since using Dentora. The reminders and follow-ups work perfectly.",
      name: 'Dr. Amanda Lee',
      role: 'Brighter Smiles',
    },
  ];

  return (
    <section id="testimonials" className="bg-[#0a0e1a] py-20">
      <div className="mx-auto max-w-6xl px-6 lg:px-8">
        <div className="mb-12 text-center">
          <p className="mb-3 text-sm font-semibold uppercase tracking-widest text-blue-400">
            WHAT DENTAL PRACTICES SAY
          </p>
          <h2 className="text-3xl font-bold text-white md:text-4xl">
            Loved by Dentists. Trusted by Teams.
          </h2>
        </div>

        <div className="relative">
          <div className="grid grid-cols-1 gap-6 md:grid-cols-3">
            {testimonials.map((t) => (
              <div
                key={t.name}
                className="rounded-xl border border-white/[0.06] bg-[#0f1424]/60 p-6"
              >
                <div className="mb-4 flex gap-1">
                  {[...Array(5)].map((_, i) => (
                    <Star key={i} className="size-4 fill-yellow-400 text-yellow-400" />
                  ))}
                </div>
                <p className="mb-6 text-sm leading-relaxed text-gray-300">
                  &ldquo;{t.quote}&rdquo;
                </p>
                <div className="flex items-center gap-3">
                  <div className="flex size-10 items-center justify-center rounded-full bg-gradient-to-br from-blue-400 to-blue-600 text-xs font-bold text-white">
                    {t.name.split(' ').map((n) => n[0]).join('')}
                  </div>
                  <div>
                    <p className="text-sm font-semibold text-white">{t.name}</p>
                    <p className="text-xs text-gray-400">{t.role}</p>
                  </div>
                </div>
              </div>
            ))}
          </div>

          <button className="absolute -left-4 top-1/2 flex size-10 -translate-y-1/2 items-center justify-center rounded-full border border-white/10 bg-[#0f1424] text-white transition hover:bg-white/10">
            <ChevronLeft className="size-5" />
          </button>
          <button className="absolute -right-4 top-1/2 flex size-10 -translate-y-1/2 items-center justify-center rounded-full border border-white/10 bg-[#0f1424] text-white transition hover:bg-white/10">
            <ChevronRight className="size-5" />
          </button>
        </div>
      </div>
    </section>
  );
}

/* ─── CTA Section ─── */
function CTASection() {
  return (
    <section className="bg-[#0a0e1a] px-6 py-16 lg:px-8">
      <div className="mx-auto max-w-6xl overflow-hidden rounded-2xl bg-gradient-to-r from-[#0f1a3a] via-[#101830] to-[#0f1424]">
        <div className="grid items-center gap-8 md:grid-cols-3">
          {/* Tooth graphic */}
          <div className="relative flex items-center justify-center p-8">
            <div className="relative size-48">
              <div className="absolute inset-0 rounded-full bg-gradient-to-b from-blue-500/20 to-transparent blur-2xl" />
              <svg viewBox="0 0 100 120" className="relative size-full drop-shadow-[0_0_30px_rgba(59,130,246,0.3)]">
                <path
                  d="M50 10 C30 10 15 25 15 45 C15 60 20 75 25 90 C28 100 32 110 35 110 C40 110 42 95 45 85 C47 80 50 78 50 78 C50 78 53 80 55 85 C58 95 60 110 65 110 C68 110 72 100 75 90 C80 75 85 60 85 45 C85 25 70 10 50 10Z"
                  fill="url(#toothGrad)"
                  stroke="rgba(59,130,246,0.3)"
                  strokeWidth="1"
                />
                <defs>
                  <linearGradient id="toothGrad" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="rgba(147,197,253,0.9)" />
                    <stop offset="100%" stopColor="rgba(59,130,246,0.4)" />
                  </linearGradient>
                </defs>
              </svg>
            </div>
          </div>

          {/* Text */}
          <div className="p-8">
            <p className="mb-3 text-xs font-semibold uppercase tracking-widest text-blue-400">
              READY TO TRANSFORM YOUR PRACTICE?
            </p>
            <h2 className="mb-4 text-2xl font-bold text-white md:text-3xl">
              Let Dentora Handle the Calls. You Focus on Smiles.
            </h2>
            <ul className="space-y-2">
              {[
                '24/7 AI Receptionist',
                'More Appointments',
                'Happier Patients',
                'Less Stress for Your Team',
              ].map((item) => (
                <li key={item} className="flex items-center gap-2 text-sm text-gray-300">
                  <Check className="size-4 text-blue-400" />
                  {item}
                </li>
              ))}
            </ul>
          </div>

          {/* CTA card */}
          <div className="p-8">
            <div className="rounded-xl border border-white/10 bg-[#1a1f35]/80 p-6">
              <h3 className="mb-2 text-lg font-bold text-white">Get Started Today</h3>
              <p className="mb-4 text-xs text-gray-400">
                Book your demo and see the difference.
              </p>
              <Link
                href="/contact"
                className="flex w-full items-center justify-center gap-2 rounded-lg bg-blue-600 px-5 py-3 text-sm font-semibold text-white transition hover:bg-blue-700"
              >
                Book a Demo Now <ArrowRight className="size-4" />
              </Link>
              <p className="mt-3 text-center text-[11px] text-gray-500">
                Setup in minutes. No credit card required.
              </p>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}

/* ─── Landing Page ─── */
export default function LandingPage() {
  return (
    <>
      <HeroSection />
      <StatsSection />
      <FeaturesSection />
      <HowItWorksAndDemoSection />
      <TestimonialsSection />
      <CTASection />
    </>
  );
}
