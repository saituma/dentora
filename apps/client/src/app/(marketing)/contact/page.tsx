'use client';

import { useState } from 'react';
import { toast } from 'sonner';
import { motion } from 'framer-motion';
import { ArrowRight, Mail, Phone, MapPin } from 'lucide-react';

const fadeUp = {
  initial: { opacity: 0, y: 24 },
  whileInView: { opacity: 1, y: 0 },
  viewport: { once: true },
  transition: { duration: 0.7, ease: 'easeOut' as const },
};

export default function ContactPage() {
  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setIsSubmitting(true);
    await new Promise((r) => setTimeout(r, 500));
    setIsSubmitting(false);
    toast.success("Message sent! We'll get back to you soon.");
  };

  return (
    <div className="mx-auto w-full max-w-7xl px-4 py-24 sm:px-6 lg:px-8">
      <motion.div {...fadeUp} className="mb-16 text-center">
        <p className="mb-3 text-xs font-medium uppercase tracking-widest text-[#b275ff]">
          Contact Us
        </p>
        <h1 className="font-display text-4xl font-bold text-black md:text-5xl">Get in Touch</h1>
        <p className="mx-auto mt-4 max-w-lg text-lg text-gray-500">
          Questions? Want a demo? We&apos;re here to help.
        </p>
      </motion.div>

      <div className="mx-auto grid max-w-5xl gap-8 lg:grid-cols-5">
        <motion.div {...fadeUp} className="space-y-4 lg:col-span-2">
          {[
            {
              icon: Mail,
              title: 'Email',
              detail: 'info@clientreach.ai',
              sub: 'We respond within 24 hours',
            },
            { icon: Phone, title: 'Phone', detail: '(555) 123-4567', sub: 'Mon–Fri 9am–5pm EST' },
            {
              icon: MapPin,
              title: 'Office',
              detail: 'Remote-first company',
              sub: 'Serving clinics nationwide',
            },
          ].map((item) => (
            <div
              key={item.title}
              className="flex items-start gap-4 rounded-2xl border border-black/[0.08] bg-white p-5 shadow-sm"
            >
              <div className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-[#b275ff]/10">
                <item.icon className="size-5 text-[#b275ff]" />
              </div>
              <div>
                <p className="text-sm font-semibold text-black">{item.title}</p>
                <p className="mt-0.5 text-sm text-gray-600">{item.detail}</p>
                <p className="text-xs text-gray-400">{item.sub}</p>
              </div>
            </div>
          ))}
        </motion.div>

        <motion.div
          {...fadeUp}
          transition={{ ...fadeUp.transition, delay: 0.1 }}
          className="lg:col-span-3"
        >
          <div className="rounded-2xl border border-black/[0.08] bg-white p-8 shadow-sm">
            <h2 className="mb-1 text-xl font-bold text-black">Send us a message</h2>
            <p className="mb-6 text-sm text-gray-500">
              Fill out the form and we&apos;ll respond within 24 hours
            </p>
            <form onSubmit={handleSubmit} className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="mb-1.5 block text-xs font-medium text-gray-700">Name</label>
                  <input
                    name="name"
                    placeholder="Your name"
                    required
                    className="w-full rounded-lg border border-black/10 bg-white px-3 py-2.5 text-sm text-black placeholder:text-gray-400 focus:border-[#b275ff] focus:outline-none"
                  />
                </div>
                <div>
                  <label className="mb-1.5 block text-xs font-medium text-gray-700">Email</label>
                  <input
                    name="email"
                    type="email"
                    placeholder="you@clinic.com"
                    required
                    className="w-full rounded-lg border border-black/10 bg-white px-3 py-2.5 text-sm text-black placeholder:text-gray-400 focus:border-[#b275ff] focus:outline-none"
                  />
                </div>
              </div>
              <div>
                <label className="mb-1.5 block text-xs font-medium text-gray-700">Message</label>
                <textarea
                  name="message"
                  placeholder="Tell us about your practice..."
                  rows={5}
                  required
                  className="w-full rounded-lg border border-black/10 bg-white px-3 py-2.5 text-sm text-black placeholder:text-gray-400 focus:border-[#b275ff] focus:outline-none"
                />
              </div>
              <button
                type="submit"
                disabled={isSubmitting}
                className="flex w-full items-center justify-center gap-2 rounded-full bg-[#b275ff] px-5 py-3 text-sm font-semibold text-white transition hover:bg-[#a060f0] disabled:opacity-50"
              >
                {isSubmitting ? 'Sending...' : 'Send Message'}
                <ArrowRight className="size-4" />
              </button>
            </form>
          </div>
        </motion.div>
      </div>
    </div>
  );
}
