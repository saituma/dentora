import { Readable } from 'node:stream';
import { Router } from 'express';
import { z } from 'zod';
import { authenticateJwt, resolveTenant, validate, rateLimiter } from '../../middleware/index.js';
import { resolveApiKey } from '../api-keys/api-key.service.js';
import { ProviderError, ValidationError } from '../../lib/errors.js';
import { logger } from '../../lib/logger.js';

const convaiRateLimiter = rateLimiter({
  maxRequests: 60,
  windowSeconds: 60,
  keyPrefix: 'elevenlabs-convai',
});

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

      const response = await fetch(
        `https://api.elevenlabs.io/v1/convai/conversation/token?agent_id=${encodeURIComponent(agentId)}`,
        {
          headers: {
            'xi-api-key': apiKey,
          },
        },
      );

      if (!response.ok) {
        const errorBody = await response.text();
        throw new ProviderError(
          `ElevenLabs ConvAI token error: ${response.status} ${errorBody}`,
          'elevenlabs',
          response.status,
        );
      }

      const payload = await response.json() as {
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

      const response = await fetch(
        `https://api.elevenlabs.io/v1/convai/conversation/get-signed-url?agent_id=${encodeURIComponent(agentId)}`,
        {
          headers: {
            'xi-api-key': apiKey,
          },
        },
      );

      if (!response.ok) {
        const errorBody = await response.text();
        throw new ProviderError(
          `ElevenLabs ConvAI signed URL error: ${response.status} ${errorBody}`,
          'elevenlabs',
          response.status,
        );
      }

      const payload = await response.json() as { signed_url?: string };
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
      const { agentId, text } = req.body as z.infer<typeof agentVoicePreviewSchema>;
      const tenantId = req.tenantContext!.tenantId;
      const { apiKey, resolvedVia } = await resolveApiKey(tenantId, 'elevenlabs');

      const agentResponse = await fetch(
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

      const agentPayload = await agentResponse.json() as {
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

      const modelId = ttsConfig?.model_id && !/conversational/i.test(ttsConfig.model_id)
        ? ttsConfig.model_id
        : 'eleven_multilingual_v2';

      const ttsResponse = await fetch(
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
      const stream = Readable.fromWeb(ttsResponse.body as unknown as ReadableStream<Uint8Array>);
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
      const conversationId = req.params.conversationId;
      if (!conversationId) {
        throw new ValidationError('Conversation ID is required');
      }

      const tenantId = req.tenantContext!.tenantId;
      const { apiKey, resolvedVia } = await resolveApiKey(tenantId, 'elevenlabs');

      const response = await fetch(
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
