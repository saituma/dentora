import express, { Router } from 'express';
import { apiRateLimiter } from '../../../middleware/index.js';
import { ValidationError } from '../../../lib/errors.js';
import { env } from '../../../config/env.js';
import { logger } from '../../../lib/logger.js';
import * as onboardingService from '../onboarding.service.js';

const LIVE_TRANSCRIBE_ALLOWED_MIME_TYPES = new Set(['audio/webm', 'audio/wav', 'audio/pcm']);
const LIVE_TRANSCRIBE_MAX_BYTES = 1024 * 1024;

const liveTranscribeRawParser = express.raw({
  type: ['audio/webm', 'audio/wav', 'audio/pcm', 'audio/webm;codecs=opus'],
  limit: '1mb',
});

type OnboardingAiChatMessage = { role: 'assistant' | 'user'; content: string };

function sanitizeAssistantReply(text: string): string {
  const trimmed = text.trim();
  if (!trimmed) return trimmed;
  const lines = trimmed
    .split('\n')
    .map((l) => l.trim())
    .filter(Boolean);
  if (lines.length > 1 && /^(noted|note|summary|observation)\s*:/i.test(lines[0])) {
    return lines.slice(1).join('\n').trim();
  }
  return trimmed;
}

export const onboardingAiRouter = Router();

// ─── AI chat ──────────────────────────────────────────────────────────────────

onboardingAiRouter.post('/ai-chat', apiRateLimiter, async (req, res, next) => {
  try {
    if (!env.OPENAI_API_KEY) {
      return res.status(500).json({ error: 'Missing OPENAI_API_KEY in environment.' });
    }

    const incomingMessages: OnboardingAiChatMessage[] = Array.isArray(req.body.messages)
      ? (req.body.messages as OnboardingAiChatMessage[])
      : [];
    const clinicContext = typeof req.body.clinicContext === 'string' ? req.body.clinicContext : '';
    const screenContext = typeof req.body.screenContext === 'string' ? req.body.screenContext : '';
    const isOnboarding = screenContext.startsWith('onboarding');

    let serverContext = '';
    try {
      serverContext = await onboardingService.buildOnboardingAiChatServerContext(
        req.tenantContext!.tenantId,
      );
    } catch (ctxErr) {
      logger.warn(
        { err: ctxErr, tenantId: req.tenantContext!.tenantId },
        'Failed to load server context for AI chat, proceeding without it',
      );
    }

    const mergedClinicContext = [
      serverContext.trim(),
      clinicContext.trim()
        ? `## Live wizard snapshot (includes unsaved edits in this browser session)\n${clinicContext.trim()}`
        : '',
    ]
      .filter((block) => block.length > 0)
      .join('\n\n');

    const messages = incomingMessages
      .filter((m) => m && (m.role === 'assistant' || m.role === 'user'))
      .map((m) => ({ role: m.role, content: String(m.content ?? '').trim() }))
      .filter((m) => m.content.length > 0)
      .slice(-20);

    if (messages.length === 0) {
      return res.status(400).json({ error: 'No chat messages provided.' });
    }

    const systemPromptParts: string[] = [
      'You are Dentora AI — a smart, versatile AI assistant built into the Dentora dental clinic platform.',
      'You are knowledgeable, helpful, and friendly. You can help with ANYTHING the user asks.',
      '',
      '## Your capabilities',
      '- **Dentora platform expert**: You know everything about how Dentora works — dashboard, AI receptionist, calls, appointments, patients, analytics, integrations, settings, billing, and onboarding.',
      '- **Dental industry knowledge**: You understand dental practice operations — scheduling best practices, common procedures, insurance, patient communication, compliance (HIPAA), and dental terminology.',
      '- **General knowledge**: You can answer general questions, explain concepts, do calculations, give advice, write text, brainstorm ideas, and help with anything a smart assistant should handle.',
      '- **Contextual awareness**: You know which screen the user is on and can give relevant guidance.',
      '',
      '## Dentora platform overview',
      'Dentora is an AI-powered dental clinic management platform. Key features:',
      '- **AI Receptionist**: Handles inbound phone calls, books appointments, answers patient questions 24/7',
      '- **Dentora Agent**: AI agent for complex patient interactions',
      '- **Browser Call**: Make calls directly from the browser',
      '- **Dashboard**: Overview of call volume, sentiment, intents, recent calls, upcoming appointments',
      '- **Appointments**: View and manage patient appointments, Google Calendar integration',
      '- **Patients**: Patient records and history',
      '- **Calls**: Call logs, recordings, transcripts, sentiment analysis',
      '- **Analytics**: Call analytics, performance metrics, trends',
      '- **Staff**: Team member management',
      '- **Integrations**: Google Calendar, and more coming soon',
      '- **Settings**: Clinic profile, voice settings, booking rules, AI behavior configuration',
      '',
      `## Current context`,
      `The user is on the "${screenContext || 'unknown'}" screen.`,
      '',
    ];

    if (isOnboarding) {
      systemPromptParts.push(
        '## Onboarding mode',
        'The user is setting up their clinic in the onboarding wizard. Help them configure their AI receptionist.',
        'Extract clinic details they provide into extractedFields. Ask for missing details when useful.',
        '',
      );
    } else {
      systemPromptParts.push(
        '## Dashboard mode — you can TAKE ACTIONS',
        'The user has already set up their clinic and is using the main dashboard.',
        'Help them with anything — platform questions, dental advice, general questions, data interpretation, troubleshooting, or just casual conversation.',
        'Be proactive and smart. If they ask about a feature, explain how to use it. If they ask about data, help interpret it.',
        '',
        '### Actions you can perform',
        'You can take real actions on behalf of the user! When the user asks you to do something (change a setting, navigate, update a field, save), include the appropriate actions in your response.',
        '',
        'Available actions:',
        '- **updateFields**: Update form fields on the current page. Provide an object of field key-value pairs.',
        '  Settings page fields: clinicName, address, phone, email, website, timezone, description',
        '- **save**: Trigger saving the current form (e.g. after updating fields). Set to true.',
        '- **navigate**: Navigate to a different page. Provide the path (e.g. "/dashboard/settings", "/dashboard/calls", "/dashboard/analytics", "/dashboard/appointments", "/dashboard/patients", "/dashboard/staff", "/dashboard/integrations", "/dashboard/ai-receptionist", "/dashboard/browser-call").',
        '- **showToast**: Show a notification message. Provide { message: string, type: "success" | "error" | "info" }.',
        '',
        'IMPORTANT: When the user asks you to change/update/set a value, DO IT — include the action. Do NOT just explain how to do it. You are capable of doing it directly.',
        'If the user says "change address to 345", you MUST include updateFields with { "address": "345" } AND save: true.',
        'If the user says "go to calls", include navigate with "/dashboard/calls".',
        'Always confirm what you did in your message.',
        '',
      );
    }

    systemPromptParts.push(
      '## Response style',
      '- Be conversational, warm, and natural — like a smart colleague, not a robot.',
      '- Keep responses concise but thorough (2-6 sentences typically, more if the question needs it).',
      '- Use markdown formatting when helpful (bold, lists, etc.).',
      '- If you do not know something specific to their clinic data, say so honestly.',
      '- Never use meta prefixes like "Noted:", "Summary:", "Observation:".',
      '',
      'IMPORTANT: You MUST respond in JSON format with this structure:',
      '{',
      '  "message": "Your conversational reply to the user (supports markdown)",',
      '  "extractedFields": {},',
      '  "actions": []',
      '}',
      '',
    );

    if (isOnboarding) {
      systemPromptParts.push(
        'extractedFields: Include any configuration values the user explicitly provides. Allowed keys:',
        '- clinicName, address, phone, email, timezone, greeting, defaultDuration, cancellationHours, advanceBookingDays',
        'If no field values are provided, return empty {}.',
        'actions: should be an empty array [] during onboarding.',
      );
    } else {
      systemPromptParts.push(
        'extractedFields should always be an empty object {} when the user is on the dashboard.',
        '',
        'actions: An array of action objects. Each action has a "type" and relevant data:',
        '- { "type": "updateFields", "fields": { "fieldKey": "value" } }',
        '- { "type": "save" }',
        '- { "type": "navigate", "path": "/dashboard/..." }',
        '- { "type": "showToast", "message": "...", "toastType": "success" | "error" | "info" }',
        '',
        'If no actions are needed, return an empty array [].',
        'You can chain multiple actions — e.g. updateFields + save together.',
      );
    }

    if (mergedClinicContext) {
      systemPromptParts.push(`\n## Clinic data\n${mergedClinicContext}`);
    }

    const systemPrompt = systemPromptParts.filter(Boolean).join('\n');

    const response = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${env.OPENAI_API_KEY}`,
        ...(process.env.OPENAI_ORG_ID ? { 'OpenAI-Organization': process.env.OPENAI_ORG_ID } : {}),
      },
      body: JSON.stringify({
        model: process.env.ONBOARDING_AI_CHAT_MODEL ?? 'gpt-4o',
        temperature: 0.5,
        response_format: { type: 'json_object' },
        messages: [
          { role: 'system', content: systemPrompt },
          ...messages.map((m) => ({ role: m.role, content: m.content })),
        ],
      }),
    });

    const payload = await response.json();
    if (!response.ok) {
      const message =
        payload?.error?.message || `OpenAI request failed with status ${response.status}.`;
      return res.status(response.status).json({ error: message });
    }

    const rawContent = String(payload?.choices?.[0]?.message?.content ?? '');
    let reply = '';
    let extractedFields: Record<string, unknown> = {};
    let actions: unknown[] = [];

    try {
      const parsed = JSON.parse(rawContent);
      reply = sanitizeAssistantReply(String(parsed.message ?? parsed.reply ?? ''));
      extractedFields =
        parsed.extractedFields && typeof parsed.extractedFields === 'object'
          ? parsed.extractedFields
          : {};
      actions = Array.isArray(parsed.actions) ? parsed.actions : [];
    } catch {
      reply = sanitizeAssistantReply(rawContent);
    }

    if (!reply) {
      return res
        .status(502)
        .json({ error: 'The AI returned an empty response. Please try again.' });
    }

    res.json({ reply, extractedFields, actions });
  } catch (err) {
    next(err);
  }
});

// ─── Live transcribe ──────────────────────────────────────────────────────────

onboardingAiRouter.post(
  '/live-transcribe',
  apiRateLimiter,
  liveTranscribeRawParser,
  async (req, res, next) => {
    try {
      const receivedContentType = String(req.header('content-type') || '').toLowerCase();
      const mimeType = (receivedContentType.split(';')[0] || '').trim();
      const language = typeof req.query.language === 'string' ? req.query.language : undefined;

      if (!mimeType)
        throw new ValidationError('Missing Content-Type for live transcription audio chunk');
      if (
        mimeType.startsWith('video/') ||
        mimeType.startsWith('application/') ||
        mimeType === 'audio/mp4'
      ) {
        throw new ValidationError(`Unsupported live transcription mime type: ${mimeType}`);
      }
      if (!LIVE_TRANSCRIBE_ALLOWED_MIME_TYPES.has(mimeType)) {
        throw new ValidationError(`Unsupported live transcription mime type: ${mimeType}`);
      }

      const audioBuffer = Buffer.isBuffer(req.body) ? req.body : Buffer.alloc(0);
      if (!audioBuffer.length) throw new ValidationError('Empty audio payload');
      if (audioBuffer.length > LIVE_TRANSCRIBE_MAX_BYTES)
        throw new ValidationError('Audio chunk too large; max size is 1MB');

      const transcript = await onboardingService.transcribeLiveAudio(req.tenantContext!.tenantId, {
        audioBuffer,
        mimeType,
        language,
      });
      res.json({ transcript });
    } catch (err) {
      next(err);
    }
  },
);
