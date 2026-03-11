import type { TenantAIContext } from './ai.service.js';
import { clinicName, findStaffMember } from './receptionist-booking.context.js';
import { buildDirectResponseTokens, normalizeMessage } from './receptionist-booking.utils.js';

export function buildDirectReceptionistResponse(context: TenantAIContext, message: string): string | null {
  const normalized = normalizeMessage(message);
  const clinic = context.clinic as {
    phone?: string;
    primaryPhone?: string;
    email?: string;
    supportEmail?: string;
    address?: string;
  };
  const { GREETING_PATTERNS, SMALL_TALK_PATTERNS } = buildDirectResponseTokens();

  if (SMALL_TALK_PATTERNS.some((pattern) => pattern.test(normalized))) {
    return /\bthanks\b/i.test(normalized) || /\bthank you\b/i.test(normalized)
      ? 'You’re welcome. Is there anything else I can help you with today?'
      : 'I’m doing well, thank you for asking. How can I help you today?';
  }
  if (GREETING_PATTERNS.some((pattern) => pattern.test(normalized))) {
    return `Hello, thank you for calling ${clinicName(context)}. How can I help you today?`;
  }
  if (/\b(staff|doctor|dentist|assistant|receptionist|front desk|team member|provider)\b/i.test(normalized)) {
    const staff = findStaffMember(context, message);
    if (staff) {
      const phone = staff.phone ? ` at ${staff.phone}` : '';
      return `I’m forwarding you to ${staff.name}${phone} now. Please hold. How else can I help while I connect you?`;
    }
    return 'I can help with that. Who would you like to speak with, or would you like me to take a message for our team?';
  }
  if ((/\bclinic phone\b/i.test(normalized) || /\bphone number\b/i.test(normalized) || /\bcall the clinic\b/i.test(normalized)) && (clinic.phone ?? clinic.primaryPhone)) {
    return `The clinic phone number is ${clinic.phone ?? clinic.primaryPhone}. Is there anything else I can help you with?`;
  }
  if ((/\bemail\b/i.test(normalized) || /\bmail\b/i.test(normalized)) && (clinic.email ?? clinic.supportEmail)) {
    return `The clinic email is ${clinic.email ?? clinic.supportEmail}. Is there anything else I can help you with?`;
  }
  if ((/\baddress\b/i.test(normalized) || /\blocated\b/i.test(normalized) || /\blocation\b/i.test(normalized)) && clinic.address) {
    return `The clinic is located at ${clinic.address}. Is there anything else I can help you with?`;
  }
  return null;
}
