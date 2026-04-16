
import express, { Router } from 'express';
import multer from 'multer';
import pdfParse from 'pdf-parse';
import * as mammoth from 'mammoth';
import * as XLSX from 'xlsx';
import * as onboardingService from './onboarding.service.js';
import { authenticateJwt, resolveTenant, validate, apiRateLimiter } from '../../middleware/index.js';
import { z } from 'zod';
import { ValidationError } from '../../lib/errors.js';
import { resolveApiKey } from '../api-keys/api-key.service.js';
import { logger } from '../../lib/logger.js';
import { db } from '../../db/index.js';
import {
  bookingRules,
  clinicProfile,
  faqLibrary,
  integrations,
  policies,
  services,
  tenantRegistry,
  voiceProfile,
} from '../../db/schema.js';
import { eq } from 'drizzle-orm';
import { env } from '../../config/env.js';
import PDFDocument from 'pdfkit';
import type { Readable } from 'stream';

export const onboardingRouter = Router();

type OnboardingAiChatMessage = {
  role: 'assistant' | 'user';
  content: string;
};

const LIVE_TRANSCRIBE_ALLOWED_MIME_TYPES = new Set(['audio/webm', 'audio/wav', 'audio/pcm']);
const LIVE_TRANSCRIBE_MAX_BYTES = 1024 * 1024;
const CONTEXT_DOC_MAX_BYTES = 5 * 1024 * 1024;
const CONTEXT_DOC_MAX_CHARS = 200000;

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: CONTEXT_DOC_MAX_BYTES, files: 10 },
});

const liveTranscribeRawParser = express.raw({
  type: ['audio/webm', 'audio/wav', 'audio/pcm', 'audio/webm;codecs=opus'],
  limit: '1mb',
});

function getFileExtension(fileName: string): string {
  const parts = fileName.toLowerCase().split('.');
  return parts.length > 1 ? parts[parts.length - 1] : '';
}

function sanitizeContextText(value: string): string {
  if (!value) return '';
  return value
    .replace(/\u0000/g, '')
    .replace(/[^\S\r\n]+$/gm, '')
    .trim();
}

function sanitizeAssistantReply(text: string): string {
  const trimmed = text.trim();
  if (!trimmed) return trimmed;

  const lines = trimmed
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean);

  if (lines.length > 1 && /^(noted|note|summary|observation)\s*:/i.test(lines[0])) {
    return lines.slice(1).join('\n').trim();
  }

  return trimmed;
}

function safeText(value: unknown): string {
  if (value === null || value === undefined) return '';
  if (typeof value === 'string') return value;
  if (typeof value === 'number' || typeof value === 'boolean') return String(value);
  try {
    return JSON.stringify(value, null, 2);
  } catch {
    return String(value);
  }
}

function writeHeading(doc: PDFKit.PDFDocument, text: string): void {
  doc.moveDown(0.8);
  doc.fontSize(14).fillColor('#111111').text(text, { underline: true });
  doc.moveDown(0.4);
  doc.fontSize(10).fillColor('#111111');
}

function writeKeyValue(doc: PDFKit.PDFDocument, key: string, value: unknown): void {
  const valueText = safeText(value).trim() || '—';
  doc.font('Helvetica-Bold').text(`${key}: `, { continued: true });
  doc.font('Helvetica').text(valueText);
}

function writeMultilineBlock(doc: PDFKit.PDFDocument, title: string, value: unknown): void {
  const valueText = safeText(value).trim();
  doc.font('Helvetica-Bold').text(`${title}:`);
  doc.font('Helvetica').text(valueText || '—', { indent: 12 });
}

async function extractContextText(file: Express.Multer.File): Promise<string> {
  const extension = getFileExtension(file.originalname);
  const mimeType = String(file.mimetype || '').toLowerCase();

  if (mimeType.startsWith('text/') || ['txt', 'md', 'csv', 'json', 'xml', 'html'].includes(extension)) {
    return sanitizeContextText(file.buffer.toString('utf-8'));
  }

  if (extension === 'pdf') {
    const parsed = await pdfParse(file.buffer);
    return sanitizeContextText(parsed.text ?? '');
  }

  if (extension === 'docx') {
    const result = await mammoth.extractRawText({ buffer: file.buffer });
    return sanitizeContextText(result.value ?? '');
  }

  if (extension === 'xlsx') {
    const workbook = XLSX.read(file.buffer, { type: 'buffer' });
    const sheets = workbook.SheetNames.map((name) => {
      const sheet = workbook.Sheets[name];
      const csv = XLSX.utils.sheet_to_csv(sheet);
      return `# ${name}\n${csv}`;
    });
    return sanitizeContextText(sheets.join('\n'));
  }

  return '';
}

onboardingRouter.use(authenticateJwt, resolveTenant);

onboardingRouter.get('/status', async (req, res, next) => {
  try {
    const status = await onboardingService.getOnboardingStatus(req.tenantContext!.tenantId);
    res.json(status);
  } catch (err) {
    next(err);
  }
});

onboardingRouter.get('/readiness', async (req, res, next) => {
  try {
    const scorecard = await onboardingService.computeReadinessScore(req.tenantContext!.tenantId);
    res.json(scorecard);
  } catch (err) {
    next(err);
  }
});

onboardingRouter.get('/context-documents', async (req, res, next) => {
  try {
    const tenantId = req.tenantContext!.tenantId;
    const [policyRow] = await db.select().from(policies).where(eq(policies.tenantId, tenantId)).limit(1);
    const topics = Array.isArray(policyRow?.sensitiveTopics) ? policyRow!.sensitiveTopics as Array<Record<string, unknown>> : [];
    const documents = topics
      .filter((topic) => topic?.type === 'context_document')
      .map((topic, index) => {
        const title = typeof topic.title === 'string' && topic.title.trim() ? topic.title.trim() : `Document ${index + 1}`;
        const content = typeof topic.content === 'string' ? topic.content.trim() : '';
        const preview = content.length > 280 ? `${content.slice(0, 280)}…` : content;
        return {
          id: `${index}-${title}`,
          title,
          mimeType: typeof topic.mimeType === 'string' ? topic.mimeType : 'text/plain',
          charCount: content.length,
          preview,
        };
      });

    res.json({ data: documents });
  } catch (err) {
    next(err);
  }
});

onboardingRouter.get('/export/pdf', apiRateLimiter, async (req, res, next) => {
  try {
    const tenantId = req.tenantContext!.tenantId;

    const [
      [tenantRow],
      [clinic],
      serviceList,
      [booking],
      [policy],
      [voice],
      faqList,
      integrationList,
    ] = await Promise.all([
      db.select().from(tenantRegistry).where(eq(tenantRegistry.id, tenantId)).limit(1),
      db.select().from(clinicProfile).where(eq(clinicProfile.tenantId, tenantId)).limit(1),
      db.select().from(services).where(eq(services.tenantId, tenantId)),
      db.select().from(bookingRules).where(eq(bookingRules.tenantId, tenantId)).limit(1),
      db.select().from(policies).where(eq(policies.tenantId, tenantId)).limit(1),
      db.select().from(voiceProfile).where(eq(voiceProfile.tenantId, tenantId)).limit(1),
      db.select().from(faqLibrary).where(eq(faqLibrary.tenantId, tenantId)),
      db.select().from(integrations).where(eq(integrations.tenantId, tenantId)),
    ]);

    const topics = Array.isArray(policy?.sensitiveTopics)
      ? (policy!.sensitiveTopics as Array<Record<string, unknown>>)
      : [];
    const contextDocuments = topics.filter((t) => t?.type === 'context_document');

    const fileSlug = (tenantRow?.clinicSlug || tenantRow?.clinicName || tenantId).toString().replace(/[^a-z0-9_-]+/gi, '-').toLowerCase();
    const filename = `clinic-context-${fileSlug}.pdf`;

    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    res.setHeader('Cache-Control', 'no-store');

    const doc = new PDFDocument({ size: 'A4', margin: 50 });
    (doc as unknown as Readable).pipe(res);

    doc.fontSize(18).fillColor('#111111').text('Clinic Context Export');
    doc.moveDown(0.2);
    doc.fontSize(10).fillColor('#444444').text(`Generated: ${new Date().toISOString()}`);
    doc.moveDown(0.4);

    writeHeading(doc, 'Tenant');
    writeKeyValue(doc, 'Tenant ID', tenantId);
    writeKeyValue(doc, 'Clinic Name', tenantRow?.clinicName ?? clinic?.clinicName ?? '—');
    writeKeyValue(doc, 'Clinic Slug', tenantRow?.clinicSlug ?? '—');
    writeKeyValue(doc, 'Plan', tenantRow?.plan ?? '—');
    writeKeyValue(doc, 'Status', tenantRow?.status ?? '—');

    writeHeading(doc, 'Clinic Profile');
    writeKeyValue(doc, 'Clinic name', clinic?.clinicName);
    writeKeyValue(doc, 'Legal entity', clinic?.legalEntityName);
    writeKeyValue(doc, 'Timezone', clinic?.timezone);
    writeKeyValue(doc, 'Primary phone', clinic?.primaryPhone ?? clinic?.phone);
    writeKeyValue(doc, 'Support email', clinic?.supportEmail ?? clinic?.email);
    writeKeyValue(doc, 'Address', clinic?.address);
    writeMultilineBlock(doc, 'Business hours', clinic?.businessHours);
    writeMultilineBlock(doc, 'Locations', clinic?.locations);
    writeMultilineBlock(doc, 'Specialties', clinic?.specialties);
    writeMultilineBlock(doc, 'Description', clinic?.description);

    writeHeading(doc, 'Services');
    if (serviceList.length === 0) {
      doc.text('—');
    } else {
      for (const service of serviceList) {
        doc.font('Helvetica-Bold').text(service.serviceName || 'Untitled service');
        doc.font('Helvetica').text(
          [
            service.category ? `Category: ${service.category}` : null,
            service.durationMinutes ? `Duration: ${service.durationMinutes} minutes` : null,
            service.price ? `Price: ${service.price}` : null,
            typeof service.isActive === 'boolean' ? `Active: ${service.isActive ? 'yes' : 'no'}` : null,
          ].filter(Boolean).join(' · ') || '—',
          { indent: 12 },
        );
        if (service.description) {
          doc.text(`Description: ${service.description}`, { indent: 12 });
        }
        doc.moveDown(0.3);
      }
    }

    writeHeading(doc, 'Booking Rules');
    if (!booking) {
      doc.text('—');
    } else {
      writeKeyValue(doc, 'Default appointment duration (minutes)', booking.defaultAppointmentDurationMinutes);
      writeKeyValue(doc, 'Buffer between appointments (minutes)', booking.bufferBetweenAppointmentsMinutes);
      writeKeyValue(doc, 'Min notice (hours)', booking.minNoticePeriodHours);
      writeKeyValue(doc, 'Cancellation cutoff (hours)', booking.cancellationCutoffHours);
      writeKeyValue(doc, 'Max advance booking (days)', booking.maxAdvanceBookingDays);
      writeMultilineBlock(doc, 'Operating schedule', booking.operatingSchedule);
      writeMultilineBlock(doc, 'Closed dates', booking.closedDates);
      writeKeyValue(doc, 'Double booking policy', booking.doubleBookingPolicy);
      writeMultilineBlock(doc, 'Emergency slot policy', booking.emergencySlotPolicy);
      writeMultilineBlock(doc, 'Reschedule limits', booking.rescheduleLimits);
      writeMultilineBlock(doc, 'After-hours policy', booking.afterHoursPolicy);
      writeKeyValue(doc, 'Validation state', booking.validationState);
    }

    writeHeading(doc, 'Policies & Escalation');
    if (!policy) {
      doc.text('—');
    } else {
      writeMultilineBlock(doc, 'Escalation conditions', policy.escalationConditions);
      writeMultilineBlock(doc, 'Emergency disclaimer', policy.emergencyDisclaimer);
    }

    writeHeading(doc, 'Voice Profile');
    if (!voice) {
      doc.text('—');
    } else {
      writeKeyValue(doc, 'Tone', voice.tone);
      writeKeyValue(doc, 'Voice ID', voice.voiceId);
      writeKeyValue(doc, 'Voice agent ID', voice.voiceAgentId);
      writeKeyValue(doc, 'Speaking speed', voice.speakingSpeed);
      writeMultilineBlock(doc, 'Greeting message', voice.greetingMessage);
      writeKeyValue(doc, 'Language', voice.language);
    }

    writeHeading(doc, 'FAQs');
    if (faqList.length === 0) {
      doc.text('—');
    } else {
      for (const faq of faqList) {
        doc.font('Helvetica-Bold').text(faq.question || 'Untitled FAQ');
        doc.font('Helvetica').text(faq.answer || '—', { indent: 12 });
        if (faq.category) {
          doc.font('Helvetica').fillColor('#444444').text(`Category: ${faq.category}`, { indent: 12 });
          doc.fillColor('#111111');
        }
        doc.moveDown(0.3);
      }
    }

    writeHeading(doc, 'Integrations');
    if (integrationList.length === 0) {
      doc.text('—');
    } else {
      for (const integration of integrationList) {
        doc.font('Helvetica-Bold').text(`${integration.integrationType} (${integration.provider})`);
        doc.font('Helvetica').text(
          [
            integration.status ? `Status: ${integration.status}` : null,
            integration.healthStatus ? `Health: ${integration.healthStatus}` : null,
            integration.lastSyncAt ? `Last sync: ${integration.lastSyncAt.toISOString()}` : null,
          ].filter(Boolean).join(' · ') || '—',
          { indent: 12 },
        );
        writeMultilineBlock(doc, 'Config', integration.config);
        writeMultilineBlock(doc, 'Capabilities', integration.capabilities);
        doc.moveDown(0.3);
      }
    }

    writeHeading(doc, 'Saved Context Documents');
    if (contextDocuments.length === 0) {
      doc.text('—');
    } else {
      for (const [index, documentTopic] of contextDocuments.entries()) {
        const title = typeof documentTopic.title === 'string' && documentTopic.title.trim()
          ? documentTopic.title.trim()
          : `Document ${index + 1}`;
        const mimeType = typeof documentTopic.mimeType === 'string' ? documentTopic.mimeType : 'text/plain';
        const content = typeof documentTopic.content === 'string' ? documentTopic.content : '';
        doc.font('Helvetica-Bold').text(title);
        doc.font('Helvetica').fillColor('#444444').text(`MIME: ${mimeType}`, { indent: 12 });
        doc.fillColor('#111111');
        doc.font('Helvetica').text(content.trim() || '—', { indent: 12 });
        doc.moveDown(0.6);
      }
    }

    doc.end();
  } catch (err) {
    next(err);
  }
});

onboardingRouter.get('/voices', async (_req, res, next) => {
  try {
    const voices = await onboardingService.listAvailableVoices();
    res.json({ data: voices });
  } catch (err) {
    next(err);
  }
});

onboardingRouter.post(
  '/ai-chat',
  apiRateLimiter,
  validate({
    body: z.object({
      messages: z
        .array(
          z.object({
            role: z.enum(['assistant', 'user']),
            content: z.string(),
          }),
        )
        .min(1),
      clinicContext: z.string().optional(),
    }),
  }),
  async (req, res, next) => {
    try {
      if (!env.OPENAI_API_KEY) {
        return res.status(500).json({ error: 'Missing OPENAI_API_KEY in environment.' });
      }

      const incomingMessages: OnboardingAiChatMessage[] = Array.isArray(req.body.messages)
        ? (req.body.messages as OnboardingAiChatMessage[])
        : [];
      const clinicContext = typeof req.body.clinicContext === 'string' ? req.body.clinicContext : '';

      const messages = incomingMessages
        .filter((message: OnboardingAiChatMessage) => message && (message.role === 'assistant' || message.role === 'user'))
        .map((message: OnboardingAiChatMessage) => ({
          role: message.role,
          content: String(message.content ?? '').trim(),
        }))
        .filter((message: OnboardingAiChatMessage) => message.content.length > 0)
        .slice(-20);

      if (messages.length === 0) {
        return res.status(400).json({ error: 'No chat messages provided.' });
      }

      const systemPrompt = [
        'You are helping a dental clinic configure an AI receptionist.',
        'Respond in a natural conversational style.',
        'Do not include meta commentary, labels, or analysis prefixes.',
        'Never start with phrases like "Noted:", "Summary:", "Observation:", or "User said:".',
        'Ask for missing operational details when useful.',
        'Keep responses practical and short (2-5 sentences).',
        clinicContext ? `Clinic context snapshot:\n${clinicContext}` : '',
      ]
        .filter(Boolean)
        .join('\n\n');

      const response = await fetch('https://api.openai.com/v1/chat/completions', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${env.OPENAI_API_KEY}`,
          ...(process.env.OPENAI_ORG_ID ? { 'OpenAI-Organization': process.env.OPENAI_ORG_ID } : {}),
        },
        body: JSON.stringify({
          model: process.env.ONBOARDING_AI_CHAT_MODEL ?? 'gpt-4o-mini',
          temperature: 0.3,
          messages: [
            { role: 'system', content: systemPrompt },
            ...messages.map((message) => ({
              role: message.role,
              content: message.content,
            })),
          ],
        }),
      });

      const payload = await response.json();
      if (!response.ok) {
        const message =
          payload?.error?.message ||
          `OpenAI request failed with status ${response.status}.`;
        return res.status(response.status).json({ error: message });
      }

      const reply = sanitizeAssistantReply(String(payload?.choices?.[0]?.message?.content ?? ''));
      if (!reply) {
        return res.status(502).json({ error: 'The AI returned an empty response. Please try again.' });
      }

      res.json({ reply });
    } catch (err) {
      next(err);
    }
  },
);

onboardingRouter.post(
  '/clinic-profile',
  validate({
    body: z.object({
      clinicName: z.string().min(2).max(120),
      address: z.string().optional(),
      phone: z.string().optional(),
      email: z.string().email().optional(),
      timezone: z.string().optional(),
      operatingHours: z.record(z.string(), z.unknown()).optional(),
      afterHoursBehavior: z.enum(['voicemail', 'callback', 'emergency_routing']).optional(),
    }),
  }),
  async (req, res, next) => {
    try {
      await onboardingService.saveClinicIdentity(req.tenantContext!.tenantId, req.body);
      req.audit?.({
        action: 'onboarding.clinic_profile_saved',
        entityType: 'clinic_profile',
        afterState: req.body,
      });
      res.json({ success: true, step: 'clinic-profile' });
    } catch (err) {
      next(err);
    }
  },
);

onboardingRouter.post(
  '/services',
  validate({
    body: z.object({
      services: z.array(
        z.object({
          id: z.string().optional(),
          serviceName: z.string().min(1),
          category: z.string(),
          description: z.string().optional(),
          durationMinutes: z.number().int().min(5).max(240),
          price: z.string().optional(),
          isActive: z.boolean().optional(),
        }),
      ).min(1),
    }),
  }),
  async (req, res, next) => {
    try {
      await onboardingService.saveServices(req.tenantContext!.tenantId, req.body.services);
      req.audit?.({
        action: 'onboarding.services_saved',
        entityType: 'services',
        afterState: { count: req.body.services.length },
      });
      res.json({ success: true, step: 'services' });
    } catch (err) {
      next(err);
    }
  },
);

onboardingRouter.post(
  '/booking-rules',
  validate({
    body: z.object({
      advanceBookingDays: z.number().int().optional(),
      cancellationHours: z.number().int().optional(),
      minNoticeHours: z.number().int().optional(),
      maxFutureDays: z.number().int().optional(),
      defaultAppointmentDurationMinutes: z.number().int().min(5).max(240).optional(),
      bufferBetweenAppointmentsMinutes: z.number().int().min(0).max(120).optional(),
      operatingSchedule: z.record(z.string(), z.unknown()).optional(),
      closedDates: z.array(z.string()).optional(),
      allowedChannels: z.array(z.string()).optional(),
      doubleBookingPolicy: z.enum(['forbid', 'conditional', 'manual-review']).optional(),
      emergencySlotPolicy: z.enum(['reserved', 'normal', 'manual-review']).optional(),
    }),
  }),
  async (req, res, next) => {
    try {
      await onboardingService.saveBookingRules(req.tenantContext!.tenantId, req.body);
      req.audit?.({
        action: 'onboarding.booking_rules_saved',
        entityType: 'booking_rules',
        afterState: req.body,
      });
      res.json({ success: true, step: 'booking-rules' });
    } catch (err) {
      next(err);
    }
  },
);

onboardingRouter.post(
  '/policies',
  validate({
    body: z.object({
      policies: z.array(
        z.object({
          id: z.string().optional(),
          policyType: z.string(),
          content: z.string().min(1),
        }),
      ).min(1),
    }),
  }),
  async (req, res, next) => {
    try {
      await onboardingService.savePolicies(req.tenantContext!.tenantId, req.body.policies);
      req.audit?.({
        action: 'onboarding.policies_saved',
        entityType: 'policies',
        afterState: { count: req.body.policies.length },
      });
      res.json({ success: true, step: 'policies' });
    } catch (err) {
      next(err);
    }
  },
);

onboardingRouter.post(
  '/voice',
  validate({
    body: z.object({
      tone: z.enum(['professional', 'warm', 'friendly', 'calm']).optional(),
      language: z.string().optional(),
      greeting: z.string().optional(),
      voiceId: z.string().optional(),
      agentId: z.string().optional(),
      speed: z.number().min(0.5).max(2.0).optional(),
      verbosityLevel: z.enum(['short', 'balanced', 'detailed']).optional(),
      empathyLevel: z.enum(['low', 'medium', 'high']).optional(),
      greetingStyle: z.enum(['formal', 'friendly']).optional(),
    }),
  }),
  async (req, res, next) => {
    try {
      const tenantId = req.tenantContext!.tenantId;
      const body = { ...req.body } as typeof req.body & { voiceId?: string };

      if (body.agentId) {
        try {
          const { apiKey } = await resolveApiKey(tenantId, 'elevenlabs');
          const agentResponse = await fetch(
            `https://api.elevenlabs.io/v1/convai/agents/${encodeURIComponent(body.agentId)}`,
            {
              headers: { 'xi-api-key': apiKey },
            },
          );

          if (agentResponse.ok) {
            const agentPayload = await agentResponse.json() as {
              conversation_config?: { tts?: { voice_id?: string } };
            };
            const agentVoiceId = agentPayload.conversation_config?.tts?.voice_id;
            if (agentVoiceId) {
              body.voiceId = agentVoiceId;
            }
          } else {
            const errorBody = await agentResponse.text();
            logger.warn({ errorBody, agentId: body.agentId }, 'Failed to resolve ElevenLabs agent voice_id');
          }
        } catch (error) {
          logger.warn({ err: error, agentId: body.agentId }, 'Failed to resolve ElevenLabs agent voice_id');
        }
      }

      await onboardingService.saveVoiceProfile(tenantId, body);
      req.audit?.({
        action: 'onboarding.voice_saved',
        entityType: 'voice_profile',
        afterState: body,
      });
      res.json({ success: true, step: 'voice' });
    } catch (err) {
      next(err);
    }
  },
);

onboardingRouter.post(
  '/faqs',
  validate({
    body: z.object({
      faqs: z.array(
        z.object({
          id: z.string().optional(),
          question: z.string().min(1),
          answer: z.string().min(1),
          category: z.string().optional(),
        }),
      ),
    }),
  }),
  async (req, res, next) => {
    try {
      await onboardingService.saveFaqs(req.tenantContext!.tenantId, req.body.faqs);
      req.audit?.({
        action: 'onboarding.faqs_saved',
        entityType: 'faq_library',
        afterState: { count: req.body.faqs.length },
      });
      res.json({ success: true, step: 'knowledge-base' });
    } catch (err) {
      next(err);
    }
  },
);

onboardingRouter.post(
  '/voice-preview',
  apiRateLimiter,
  validate({
    body: z.object({
      voiceId: z.string().min(1),
      text: z.string().min(1).max(500),
      speed: z.number().min(0.5).max(2.0).optional(),
      language: z.string().optional(),
    }),
  }),
  async (req, res, next) => {
    try {
      const audio = await onboardingService.generateVoicePreview(
        req.tenantContext!.tenantId,
        req.body,
      );
      res.set({
        'Content-Type': 'audio/mpeg',
        'Content-Length': String(audio.length),
        'Cache-Control': 'no-store',
      });
      res.send(audio);
    } catch (err) {
      next(err);
    }
  },
);

onboardingRouter.post(
  '/context-documents',
  validate({
    body: z.object({
      documents: z.array(
        z.object({
          name: z.string().min(1).max(200),
          content: z.string().min(1).max(CONTEXT_DOC_MAX_CHARS),
          mimeType: z.string().optional(),
        }),
      ).min(1).max(10),
    }),
  }),
  async (req, res, next) => {
    try {
      await onboardingService.saveContextDocuments(req.tenantContext!.tenantId, req.body.documents);
      res.json({ success: true, count: req.body.documents.length });
    } catch (err) {
      next(err);
    }
  },
);

onboardingRouter.post(
  '/context-documents/upload',
  upload.array('files', 10),
  async (req, res, next) => {
    try {
      const files = (req.files ?? []) as Express.Multer.File[];
      if (!files.length) {
        throw new ValidationError('No files uploaded.');
      }

      const documents: Array<{ name: string; content: string; mimeType?: string }> = [];
      for (const file of files) {
        const content = await extractContextText(file);
        if (!content) continue;
        documents.push({
          name: file.originalname,
          content: content.slice(0, CONTEXT_DOC_MAX_CHARS),
          mimeType: file.mimetype || 'text/plain',
        });
      }

      if (documents.length === 0) {
        throw new ValidationError('No supported content extracted from uploaded files.');
      }

      await onboardingService.saveContextDocuments(req.tenantContext!.tenantId, documents);
      res.json({ success: true, count: documents.length });
    } catch (err) {
      next(err);
    }
  },
);

onboardingRouter.post(
  '/live-transcribe',
  apiRateLimiter,
  liveTranscribeRawParser,
  async (req, res, next) => {
    try {
      const receivedContentType = String(req.header('content-type') || '').toLowerCase();
      const mimeType = (receivedContentType.split(';')[0] || '').trim();
      const language = typeof req.query.language === 'string' ? req.query.language : undefined;

      if (!mimeType) {
        throw new ValidationError('Missing Content-Type for live transcription audio chunk');
      }

      if (mimeType.startsWith('video/') || mimeType.startsWith('application/') || mimeType === 'audio/mp4') {
        throw new ValidationError(`Unsupported live transcription mime type: ${mimeType}`);
      }

      if (!LIVE_TRANSCRIBE_ALLOWED_MIME_TYPES.has(mimeType)) {
        throw new ValidationError(`Unsupported live transcription mime type: ${mimeType}`);
      }

      const audioBuffer = Buffer.isBuffer(req.body) ? req.body : Buffer.alloc(0);
      if (!audioBuffer.length) {
        throw new ValidationError('Empty audio payload');
      }

      if (audioBuffer.length > LIVE_TRANSCRIBE_MAX_BYTES) {
        throw new ValidationError('Audio chunk too large; max size is 1MB');
      }

      const transcript = await onboardingService.transcribeLiveAudio(
        req.tenantContext!.tenantId,
        {
          audioBuffer,
          mimeType,
          language,
        },
      );
      res.json({ transcript });
    } catch (err) {
      next(err);
    }
  },
);

onboardingRouter.post('/publish', async (req, res, next) => {
  try {
    const result = await onboardingService.publishOnboardingConfig(
      req.tenantContext!.tenantId,
      req.user!.userId,
    );
    req.audit?.({
      action: 'onboarding.config_published',
      entityType: 'config_version',
      entityId: result.configVersionId,
    });
    res.json(result);
  } catch (err) {
    next(err);
  }
});
