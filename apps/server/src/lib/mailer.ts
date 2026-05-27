import nodemailer from 'nodemailer';
import { lookup as dnsLookup } from 'node:dns/promises';
import { env } from '../config/env.js';

export interface SendEmailInput {
  to: string;
  subject: string;
  text: string;
  html: string;
}

async function sendViaResend(input: SendEmailInput): Promise<void> {
  const res = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${env.RESEND_API_KEY}`,
    },
    body: JSON.stringify({
      from: env.SMTP_FROM || 'Dentora <noreply@resend.dev>',
      to: input.to,
      subject: input.subject,
      text: input.text,
      html: input.html,
    }),
  });
  if (!res.ok) {
    const body = await res.text().catch(() => '');
    throw new Error(`Resend API error ${res.status}: ${body.slice(0, 200)}`);
  }
}

async function sendViaSmtp(input: SendEmailInput): Promise<void> {
  // Heroku Common Runtime has no IPv6 outbound — pre-resolve to IPv4 so nodemailer
  // never attempts the AAAA address. tls.servername keeps cert validation correct.
  const ipv4Host = await dnsLookup(env.SMTP_HOST, { family: 4 })
    .then((r) => r.address)
    .catch(() => env.SMTP_HOST);

  const transporter = nodemailer.createTransport({
    host: ipv4Host,
    port: env.SMTP_PORT,
    secure: env.SMTP_SECURE,
    auth: { user: env.SMTP_USER, pass: env.SMTP_PASS },
    tls: { servername: env.SMTP_HOST },
  } as unknown as Parameters<typeof nodemailer.createTransport>[0]);
  await transporter.sendMail({
    from: env.SMTP_FROM,
    to: input.to,
    subject: input.subject,
    text: input.text,
    html: input.html,
  });
}

export function isEmailConfigured(): boolean {
  return (
    Boolean(env.RESEND_API_KEY) ||
    Boolean(env.SMTP_HOST && env.SMTP_USER && env.SMTP_PASS && env.SMTP_FROM)
  );
}

export async function sendEmail(input: SendEmailInput): Promise<void> {
  if (env.RESEND_API_KEY) {
    return sendViaResend(input);
  }
  if (env.SMTP_HOST && env.SMTP_USER && env.SMTP_PASS && env.SMTP_FROM) {
    return sendViaSmtp(input);
  }
  throw new Error('No email sender configured: set RESEND_API_KEY or SMTP_HOST/USER/PASS/FROM');
}
