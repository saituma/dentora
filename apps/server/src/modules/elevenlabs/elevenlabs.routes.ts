import { Readable } from 'node:stream';
import { Router } from 'express';
import { z } from 'zod';
import { authenticateJwt, resolveTenant, validate, rateLimiter } from '../../middleware/index.js';
import { resolveApiKey } from '../api-keys/api-key.service.js';
import { ensureAgentPromptDates } from './ensure-agent-prompt.js';
import { elevenLabsFetch } from './elevenlabs-fetch.js';
import { isWithinBusinessHours } from '../telephony/telephony.service.js';
import { getClinicProfile } from '../config/config.service.js';
import { buildConvaiContext } from '../telephony/media-stream.js';
import { ProviderError, ValidationError } from '../../lib/errors.js';
import { logger } from '../../lib/logger.js';
import { env } from '../../config/env.js';
import { setActiveTenantContext } from '../../db/tenant-als.js';
import { db } from '../../db/index.js';
import { tenantRegistry, clinicProfile, voiceProfile, twilioNumbers } from '../../db/schema.js';
import { eq, and, sql } from 'drizzle-orm';

const convaiRateLimiter = rateLimiter({
  maxRequests: 60,
  windowSeconds: 60,
  keyPrefix: 'elevenlabs-convai',
});

async function buildSessionDynamicVars(tenantId: string): Promise<Record<string, string>> {
  try {
    const clinic = await getClinicProfile(tenantId).catch(() => null);

    const timezone = clinic?.timezone ?? 'Europe/London';
    const now = new Date();

    const dateFormatter = new Intl.DateTimeFormat('en-GB', {
      timeZone: timezone,
      weekday: 'long',
      day: 'numeric',
      month: 'long',
      year: 'numeric',
    });
    const timeFormatter = new Intl.DateTimeFormat('en-GB', {
      timeZone: timezone,
      hour: '2-digit',
      minute: '2-digit',
      hour12: true,
    });

    const currentDate = dateFormatter.format(now);
    const currentTime = timeFormatter.format(now);
    const currentDateTime = `${currentDate} at ${currentTime}`;

    const isOpen = isWithinBusinessHours(
      clinic?.businessHours as Record<string, { start: string; end: string } | null> | null,
      timezone,
    );

    const isAfterHoursText = isOpen
      ? `NOTE: The clinic is currently OPEN. Current date and time: ${currentDateTime}.`
      : `NOTE: The clinic is currently CLOSED. Current date and time: ${currentDateTime}. Do not offer same-day slots — offer tomorrow morning or the next business day.`;

    return {
      is_after_hours: isAfterHoursText,
      current_datetime: currentDateTime,
    };
  } catch (err) {
    logger.warn({ err, tenantId }, 'buildSessionDynamicVars failed, using defaults');
    return {
      is_after_hours: 'NOTE: Clinic status unknown.',
      current_datetime: new Date().toISOString(),
    };
  }
}

const createTokenSchema = z.object({
  agentId: z.string().min(1).max(120),
});

export const elevenlabsRouter = Router();

/**
 * POST /api/elevenlabs/convai/token
 *
 * Creates a short-lived conversation token for ElevenLabs Conversational AI.
 * Requires authenticated tenant context and resolves the ElevenLabs API key
 * server-side.
 */
elevenlabsRouter.post(
  '/convai/token',
  authenticateJwt,
  resolveTenant,
  convaiRateLimiter,
  validate({ body: createTokenSchema }),
  async (req, res, next) => {
    try {
      const { agentId } = req.body as z.infer<typeof createTokenSchema>;
      const tenantId = req.tenantContext!.tenantId;
      const { apiKey, resolvedVia } = await resolveApiKey(tenantId, 'elevenlabs');

      void ensureAgentPromptDates(tenantId, agentId);
      const sessionVars = await buildSessionDynamicVars(tenantId);

      const response = await elevenLabsFetch(
        `https://api.elevenlabs.io/v1/convai/conversation/token?agent_id=${encodeURIComponent(agentId)}`,
        { headers: { 'xi-api-key': apiKey } },
      );

      if (!response.ok) {
        const errorBody = await response.text();
        throw new ProviderError(
          `ElevenLabs ConvAI token error: ${response.status} ${errorBody}`,
          'elevenlabs',
          response.status,
        );
      }

      const payload = (await response.json()) as {
        token?: string;
        expires_at?: number;
        expiresAt?: string;
      };

      if (!payload.token) {
        throw new ValidationError('ElevenLabs token response missing token field');
      }

      req.audit?.({
        action: 'elevenlabs.conversation_token',
        entityType: 'elevenlabs_conversation',
        afterState: {
          agentId,
          keyResolvedVia: resolvedVia,
        },
      });

      res.json({
        data: {
          token: payload.token,
          expiresAt: payload.expires_at ?? payload.expiresAt ?? null,
          dynamicVariables: sessionVars,
        },
        meta: {
          agentId,
          keyResolvedVia: resolvedVia,
          correlationId: req.tenantContext!.correlationId,
        },
      });
    } catch (error) {
      logger.error({ err: error }, 'Failed to create ElevenLabs conversation token');
      next(error);
    }
  },
);

const createSignedUrlSchema = z.object({
  agentId: z.string().min(1).max(120),
});

const agentVoicePreviewSchema = z.object({
  agentId: z.string().min(1).max(120),
  text: z.string().min(1).max(400),
  speed: z.number().min(0.7).max(1.3).optional(),
});

/**
 * POST /api/elevenlabs/convai/signed-url
 *
 * Creates a signed URL for WebSocket conversations when the agent
 * requires authentication.
 */
elevenlabsRouter.post(
  '/convai/signed-url',
  authenticateJwt,
  resolveTenant,
  convaiRateLimiter,
  validate({ body: createSignedUrlSchema }),
  async (req, res, next) => {
    try {
      const { agentId } = req.body as z.infer<typeof createSignedUrlSchema>;
      const tenantId = req.tenantContext!.tenantId;
      const { apiKey, resolvedVia } = await resolveApiKey(tenantId, 'elevenlabs');

      void ensureAgentPromptDates(tenantId, agentId);
      const sessionVars = await buildSessionDynamicVars(tenantId);

      const response = await elevenLabsFetch(
        `https://api.elevenlabs.io/v1/convai/conversation/get-signed-url?agent_id=${encodeURIComponent(agentId)}`,
        { headers: { 'xi-api-key': apiKey } },
      );

      if (!response.ok) {
        const errorBody = await response.text();
        throw new ProviderError(
          `ElevenLabs ConvAI signed URL error: ${response.status} ${errorBody}`,
          'elevenlabs',
          response.status,
        );
      }

      const payload = (await response.json()) as { signed_url?: string };
      if (!payload.signed_url) {
        throw new ValidationError('ElevenLabs signed URL response missing signed_url field');
      }

      req.audit?.({
        action: 'elevenlabs.signed_url',
        entityType: 'elevenlabs_conversation',
        afterState: {
          agentId,
          keyResolvedVia: resolvedVia,
        },
      });

      res.json({
        data: {
          signedUrl: payload.signed_url,
          dynamicVariables: sessionVars,
        },
        meta: {
          agentId,
          keyResolvedVia: resolvedVia,
          correlationId: req.tenantContext!.correlationId,
        },
      });
    } catch (error) {
      logger.error({ err: error }, 'Failed to create ElevenLabs signed URL');
      next(error);
    }
  },
);

const testSessionSchema = z.object({
  callerPhoneNumber: z.string().optional(),
  tenantId: z.string().uuid().optional(),
});

/**
 * Middleware that accepts either a standard JWT (→ resolveTenant) or the
 * CALL_TEST_SECRET env var. When the secret is used, tenantId must be in the
 * request body. This avoids requiring a short-lived JWT for the local dev test page.
 */
function authenticateTestSessionRequest(
  req: import('express').Request,
  res: import('express').Response,
  next: import('express').NextFunction,
): void {
  const authHeader = req.headers.authorization ?? '';
  const secret = env.CALL_TEST_SECRET;

  if (secret && authHeader === `Bearer ${secret}`) {
    const tenantId = (req.body as { tenantId?: string }).tenantId;
    if (!tenantId) {
      res
        .status(400)
        .json({ error: 'tenantId is required when authenticating with CALL_TEST_SECRET' });
      return;
    }
    const correlationId = `test-${Date.now()}`;
    req.tenantContext = {
      tenantId,
      clinicSlug: '',
      status: 'active',
      activeConfigVersion: 0,
      resolvedVia: 'jwt',
      correlationId,
      requestedAt: new Date().toISOString(),
    };
    setActiveTenantContext({ tenantId, correlationId, source: 'request' });
    next();
    return;
  }

  authenticateJwt(req, res, (err?: unknown) => {
    if (err) {
      next(err);
      return;
    }
    resolveTenant(req, res, next);
  });
}

/**
 * POST /api/elevenlabs/convai/test-session
 *
 * Returns a signed URL + the EXACT same dynamic variables the phone call injects
 * into the ConvAI agent (via buildConvaiContext). Use this to drive a browser-based
 * call test that is 100% contextually equivalent to a real inbound call.
 *
 * Accepts either a standard JWT bearer token OR the CALL_TEST_SECRET env var
 * (in which case tenantId must be provided in the request body).
 *
 * Optional callerPhoneNumber simulates the Twilio caller ID so the agent skips
 * asking for the patient's number.
 */
elevenlabsRouter.post(
  '/convai/test-session',
  authenticateTestSessionRequest,
  convaiRateLimiter,
  validate({ body: testSessionSchema }),
  async (req, res, next) => {
    try {
      const { callerPhoneNumber } = req.body as z.infer<typeof testSessionSchema>;
      const tenantId = req.tenantContext!.tenantId;
      const { apiKey, resolvedVia } = await resolveApiKey(tenantId, 'elevenlabs');

      const { dynamicVariables, contextualUpdate, voiceProfile } =
        await buildConvaiContext(tenantId);

      if (callerPhoneNumber?.trim()) {
        dynamicVariables.caller_phone_number = callerPhoneNumber.trim();
      }

      const vp = voiceProfile as Record<string, unknown> | null;
      const agentId = vp?.voiceAgentId as string | undefined;
      if (!agentId) {
        throw new ValidationError('No ElevenLabs agent ID configured for this tenant');
      }

      void ensureAgentPromptDates(tenantId, agentId);

      const response = await elevenLabsFetch(
        `https://api.elevenlabs.io/v1/convai/conversation/get-signed-url?agent_id=${encodeURIComponent(agentId)}`,
        { headers: { 'xi-api-key': apiKey } },
      );

      if (!response.ok) {
        const errorBody = await response.text();
        throw new ProviderError(
          `ElevenLabs ConvAI signed URL error: ${response.status} ${errorBody}`,
          'elevenlabs',
          response.status,
        );
      }

      const payload = (await response.json()) as { signed_url?: string };
      if (!payload.signed_url) {
        throw new ValidationError('ElevenLabs signed URL response missing signed_url field');
      }

      req.audit?.({
        action: 'elevenlabs.test_session',
        entityType: 'elevenlabs_conversation',
        afterState: { agentId, keyResolvedVia: resolvedVia },
      });

      const callerPhoneInstruction = callerPhoneNumber?.trim()
        ? `\n- The caller's inbound phone number is ${callerPhoneNumber.trim()}. Use this as their phone number for booking — do NOT ask them for it.`
        : '';

      res.json({
        data: {
          signedUrl: payload.signed_url,
          agentId,
          dynamicVariables,
          contextualUpdate: contextualUpdate + callerPhoneInstruction,
        },
        meta: {
          agentId,
          keyResolvedVia: resolvedVia,
          correlationId: req.tenantContext!.correlationId,
        },
      });
    } catch (error) {
      logger.error({ err: error }, 'Failed to create ElevenLabs test session');
      next(error);
    }
  },
);

const testVoiceSwitchSchema = z.object({
  voiceId: z.string().min(1).max(120),
});

/**
 * POST /api/elevenlabs/convai/test-voice-switch
 *
 * Temporarily switches the agent's voice for testing. CALL_TEST_SECRET auth only.
 */
elevenlabsRouter.post(
  '/convai/test-voice-switch',
  convaiRateLimiter,
  validate({ body: testVoiceSwitchSchema }),
  async (req, res, next) => {
    try {
      const secret = env.CALL_TEST_SECRET;
      const authHeader = req.headers.authorization ?? '';
      if (!secret || authHeader !== `Bearer ${secret}`) {
        res.status(401).json({ error: 'Unauthorized' });
        return;
      }

      const { voiceId } = req.body as z.infer<typeof testVoiceSwitchSchema>;

      // Find the first tenant with a voice agent (for now, use the first available)
      const [vp] = await db
        .select({ voiceAgentId: voiceProfile.voiceAgentId })
        .from(voiceProfile)
        .where(sql`${voiceProfile.voiceAgentId} IS NOT NULL`)
        .limit(1);

      const agentId = vp?.voiceAgentId;
      if (!agentId) {
        throw new ValidationError('No voice agent configured');
      }

      const { apiKey } = await resolveApiKey('', 'elevenlabs').catch(() => ({
        apiKey: env.ELEVENLABS_API_KEY,
        resolvedVia: 'platform' as const,
      }));

      const patchRes = await elevenLabsFetch(
        `https://api.elevenlabs.io/v1/convai/agents/${encodeURIComponent(agentId)}`,
        {
          method: 'PATCH',
          headers: { 'xi-api-key': apiKey, 'Content-Type': 'application/json' },
          body: JSON.stringify({
            conversation_config: { tts: { voice_id: voiceId } },
          }),
        },
      );

      if (!patchRes.ok) {
        const body = await patchRes.text();
        throw new ProviderError(
          `Voice switch failed: ${patchRes.status} ${body}`,
          'elevenlabs',
          patchRes.status,
        );
      }

      res.json({ data: { agentId, voiceId, success: true } });
    } catch (error) {
      logger.error({ err: error }, 'Failed to switch test voice');
      next(error);
    }
  },
);

/**
 * GET /api/elevenlabs/convai/test-tenants
 *
 * Returns all active tenants with their clinic name, Twilio inbound number,
 * clinic forward number, and voice agent info. CALL_TEST_SECRET auth only.
 */
elevenlabsRouter.get('/convai/test-tenants', convaiRateLimiter, async (req, res, next) => {
  try {
    const authHeader = req.headers.authorization ?? '';
    const secret = env.CALL_TEST_SECRET;
    if (!secret || authHeader !== `Bearer ${secret}`) {
      res.status(401).json({ error: 'Unauthorized' });
      return;
    }

    const rows = await db
      .select({
        tenantId: tenantRegistry.id,
        clinicName: clinicProfile.clinicName,
        forwardPhone: clinicProfile.phone,
        primaryPhone: clinicProfile.primaryPhone,
        twilioNumber: twilioNumbers.phoneNumber,
        voiceAgentId: voiceProfile.voiceAgentId,
        voiceId: voiceProfile.voiceId,
        status: tenantRegistry.status,
      })
      .from(tenantRegistry)
      .leftJoin(clinicProfile, eq(clinicProfile.tenantId, tenantRegistry.id))
      .leftJoin(voiceProfile, eq(voiceProfile.tenantId, tenantRegistry.id))
      .leftJoin(
        twilioNumbers,
        and(eq(twilioNumbers.tenantId, tenantRegistry.id), eq(twilioNumbers.status, 'active')),
      )
      .where(eq(tenantRegistry.status, 'active'));

    const tenants = rows.map((r) => ({
      tenantId: r.tenantId,
      clinicName: r.clinicName ?? r.tenantId,
      twilioNumber: r.twilioNumber ?? null,
      forwardPhone: r.forwardPhone ?? r.primaryPhone ?? null,
      voiceAgentId: r.voiceAgentId ?? null,
      voiceId: r.voiceId ?? null,
    }));

    res.json({ data: tenants });
  } catch (error) {
    logger.error({ err: error }, 'Failed to list test tenants');
    next(error);
  }
});

/**
 * POST /api/elevenlabs/convai/agent-voice-preview
 *
 * Generates a short text-to-speech preview using the agent's configured voice.
 */
elevenlabsRouter.post(
  '/convai/agent-voice-preview',
  authenticateJwt,
  resolveTenant,
  convaiRateLimiter,
  validate({ body: agentVoicePreviewSchema }),
  async (req, res, next) => {
    try {
      const { agentId, text, speed } = req.body as z.infer<typeof agentVoicePreviewSchema>;
      const tenantId = req.tenantContext!.tenantId;
      const { apiKey, resolvedVia } = await resolveApiKey(tenantId, 'elevenlabs');

      const agentResponse = await elevenLabsFetch(
        `https://api.elevenlabs.io/v1/convai/agents/${encodeURIComponent(agentId)}`,
        {
          headers: {
            'xi-api-key': apiKey,
          },
        },
      );

      if (!agentResponse.ok) {
        const errorBody = await agentResponse.text();
        throw new ProviderError(
          `ElevenLabs agent fetch error: ${agentResponse.status} ${errorBody}`,
          'elevenlabs',
          agentResponse.status,
        );
      }

      const agentPayload = (await agentResponse.json()) as {
        conversation_config?: {
          tts?: {
            voice_id?: string;
            model_id?: string;
            stability?: number;
            similarity_boost?: number;
            style?: number;
          };
        };
      };

      const ttsConfig = agentPayload.conversation_config?.tts;
      const voiceId = ttsConfig?.voice_id;
      if (!voiceId) {
        throw new ValidationError('Agent voice_id not found');
      }

      const modelId =
        ttsConfig?.model_id && !/conversational/i.test(ttsConfig.model_id)
          ? ttsConfig.model_id
          : 'eleven_multilingual_v2';

      const ttsResponse = await elevenLabsFetch(
        `https://api.elevenlabs.io/v1/text-to-speech/${encodeURIComponent(voiceId)}/stream?output_format=mp3_44100_128`,
        {
          method: 'POST',
          headers: {
            'xi-api-key': apiKey,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            text,
            model_id: modelId,
            voice_settings: {
              stability: ttsConfig?.stability ?? 0.5,
              similarity_boost: ttsConfig?.similarity_boost ?? 0.8,
              style: ttsConfig?.style ?? 0,
              use_speaker_boost: true,
              speed: speed ?? 1.0,
            },
          }),
        },
      );

      if (!ttsResponse.ok || !ttsResponse.body) {
        const errorBody = await ttsResponse.text();
        throw new ProviderError(
          `ElevenLabs TTS error: ${ttsResponse.status} ${errorBody}`,
          'elevenlabs',
          ttsResponse.status,
        );
      }

      req.audit?.({
        action: 'elevenlabs.agent_voice_preview',
        entityType: 'elevenlabs_tts',
        afterState: {
          agentId,
          voiceId,
          keyResolvedVia: resolvedVia,
        },
      });

      res.setHeader('Content-Type', ttsResponse.headers.get('Content-Type') ?? 'audio/mpeg');
      res.setHeader('Cache-Control', 'no-store');
      const stream = Readable.fromWeb(
        ttsResponse.body as unknown as import('node:stream/web').ReadableStream,
      );
      stream.pipe(res);
    } catch (error) {
      logger.error({ err: error }, 'Failed to generate ElevenLabs voice preview');
      next(error);
    }
  },
);

/**
 * GET /api/elevenlabs/convai/conversations/:conversationId
 *
 * Fetches conversation details for troubleshooting.
 */
elevenlabsRouter.get(
  '/convai/conversations/:conversationId',
  authenticateJwt,
  resolveTenant,
  convaiRateLimiter,
  async (req, res, next) => {
    try {
      const conversationId = Array.isArray(req.params.conversationId)
        ? req.params.conversationId[0]
        : req.params.conversationId;
      if (!conversationId) {
        throw new ValidationError('Conversation ID is required');
      }

      const tenantId = req.tenantContext!.tenantId;
      const { apiKey, resolvedVia } = await resolveApiKey(tenantId, 'elevenlabs');

      const response = await elevenLabsFetch(
        `https://api.elevenlabs.io/v1/convai/conversations/${encodeURIComponent(conversationId)}`,
        {
          headers: {
            'xi-api-key': apiKey,
          },
        },
      );

      if (!response.ok) {
        const errorBody = await response.text();
        throw new ProviderError(
          `ElevenLabs conversation details error: ${response.status} ${errorBody}`,
          'elevenlabs',
          response.status,
        );
      }

      const payload = await response.json();

      res.json({
        data: payload,
        meta: {
          conversationId,
          keyResolvedVia: resolvedVia,
          correlationId: req.tenantContext!.correlationId,
        },
      });
    } catch (error) {
      logger.error({ err: error }, 'Failed to fetch ElevenLabs conversation details');
      next(error);
    }
  },
);
