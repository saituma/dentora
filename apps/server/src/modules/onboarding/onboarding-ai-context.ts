import { db } from '../../db/index.js';
import { clinicProfile, policies } from '../../db/schema.js';
import { eq } from 'drizzle-orm';

/** Cap extracted document text so the onboarding chat system prompt stays within model limits. */
const MAX_SAVED_DOC_CHARS_FOR_AI_CHAT = 48_000;

/**
 * Loads persisted clinic profile + saved context documents from the database so
 * `/onboarding/ai-chat` can ground the model in server truth (not only the client snapshot).
 */
export async function buildOnboardingAiChatServerContext(tenantId: string): Promise<string> {
  const [[clinic], [policyRow]] = await Promise.all([
    db.select().from(clinicProfile).where(eq(clinicProfile.tenantId, tenantId)).limit(1),
    db.select().from(policies).where(eq(policies.tenantId, tenantId)).limit(1),
  ]);

  const sections: string[] = [];

  if (clinic) {
    const lines: string[] = ['## Saved clinic profile (database)'];
    if (clinic.clinicName) lines.push(`- Name: ${clinic.clinicName}`);
    if (clinic.address) lines.push(`- Address: ${clinic.address}`);
    const phone = clinic.phone || clinic.primaryPhone;
    if (phone) lines.push(`- Phone: ${phone}`);
    const email = clinic.email || clinic.supportEmail;
    if (email) lines.push(`- Email: ${email}`);
    if (clinic.timezone) lines.push(`- Timezone: ${clinic.timezone}`);
    if (clinic.website?.trim()) lines.push(`- Website: ${clinic.website.trim()}`);
    if (clinic.description?.trim()) {
      lines.push(`- About the clinic:\n${clinic.description.trim()}`);
    }
    const logo = typeof clinic.logo === 'string' ? clinic.logo.trim() : '';
    if (logo) {
      lines.push(
        logo.startsWith('data:image')
          ? '- Clinic photo/logo: image stored on the clinic profile (pixels not embedded in this text).'
          : `- Clinic logo URL: ${logo}`,
      );
    }
    if (lines.length > 1) sections.push(lines.join('\n'));
  }

  const topics = Array.isArray(policyRow?.sensitiveTopics)
    ? (policyRow!.sensitiveTopics as Array<Record<string, unknown>>)
    : [];
  const docTopics = topics.filter((t) => t?.type === 'context_document');
  if (docTopics.length > 0) {
    const parts: string[] = ['## Saved context documents (database)'];
    let used = 0;
    for (const [index, topic] of docTopics.entries()) {
      const title =
        typeof topic.title === 'string' && topic.title.trim()
          ? topic.title.trim()
          : `Document ${index + 1}`;
      const mimeType = typeof topic.mimeType === 'string' ? topic.mimeType : 'text/plain';
      const content = typeof topic.content === 'string' ? topic.content.replace(/\u0000/g, '').trim() : '';
      if (!content) continue;
      const block = `### ${title}\nMIME: ${mimeType}\n\n${content}\n\n`;
      if (used + block.length > MAX_SAVED_DOC_CHARS_FOR_AI_CHAT) {
        const remaining = MAX_SAVED_DOC_CHARS_FOR_AI_CHAT - used - 120;
        if (remaining > 400) {
          parts.push(`### ${title} (truncated)\nMIME: ${mimeType}\n\n${content.slice(0, remaining)}…\n`);
        }
        break;
      }
      parts.push(block);
      used += block.length;
    }
    if (parts.length > 1) sections.push(parts.join(''));
  }

  return sections.join('\n\n');
}
