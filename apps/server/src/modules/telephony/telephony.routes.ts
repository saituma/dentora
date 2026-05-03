
import { Router } from 'express';
import * as telephonyService from './telephony.service.js';
import {
  authenticateJwt,
  resolveTenant,
  validate,
  apiRateLimiter,
} from '../../middleware/index.js';
import { webhookRateLimiter } from '../../middleware/rateLimit.js';
import { validateTwilioSignature } from '../../middleware/twilio.js';
import { z } from 'zod';
import { env } from '../../config/env.js';
import { ValidationError } from '../../lib/errors.js';
import { logger } from '../../lib/logger.js';

export const telephonyRouter = Router();

function twimlXml(parts: string[]): string {
  return parts.join('');
}

function twimlEscape(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

function isOnboardingNotPublishedError(error: unknown): boolean {
  if (!(error instanceof Error)) return false;
  return /No active config version for tenant/i.test(error.message);
}

telephonyRouter.get(
  '/webhook-base',
  authenticateJwt,
  resolveTenant,
  async (_req, res, next) => {
    try {
      const baseUrl = env.TWILIO_WEBHOOK_BASE_URL.replace(/\/$/, '');
      res.json({ baseUrl });
    } catch (err) {
      next(err);
    }
  },
);

telephonyRouter.get(
  '/public/status',
  webhookRateLimiter,
  validate({
    query: z.object({
      phoneNumber: z.string().regex(/^\+[1-9]\d{1,14}$/, 'Must be E.164 format'),
    }),
  }),
  async (req, res, next) => {
    try {
      const { phoneNumber } = req.query as { phoneNumber: string };
      const status = await telephonyService.getPublicNumberStatus({ phoneNumber });
      res.json(status);
    } catch (err) {
      next(err);
    }
  },
);

telephonyRouter.post(
  '/numbers',
  authenticateJwt,
  resolveTenant,
  apiRateLimiter,
  validate({
    body: z.object({
      phoneNumber: z.string().regex(/^\+[1-9]\d{1,14}$/, 'Must be E.164 format'),
      twilioSid: z.string().min(1),
      friendlyName: z.string().optional(),
    }),
  }),
  async (req, res, next) => {
    try {
      const number = await telephonyService.assignPhoneNumber({
        tenantId: req.tenantContext!.tenantId,
        ...req.body,
      });
      req.audit?.({
        action: 'telephony.number_assigned',
        entityType: 'twilio_number',
        entityId: number.id,
        afterState: { phoneNumber: req.body.phoneNumber },
      });
      res.status(201).json(number);
    } catch (err) {
      next(err);
    }
  },
);

telephonyRouter.post(
  '/numbers/auto-assign',
  authenticateJwt,
  resolveTenant,
  apiRateLimiter,
  async (req, res, next) => {
    try {
      const number = await telephonyService.autoAssignPhoneNumberForTenant(
        req.tenantContext!.tenantId,
      );
      req.audit?.({
        action: 'telephony.number_auto_assigned',
        entityType: 'twilio_number',
        entityId: number.id,
        afterState: { phoneNumber: number.phoneNumber },
      });
      res.status(201).json(number);
    } catch (err) {
      next(err);
    }
  },
);

telephonyRouter.get(
  '/numbers',
  authenticateJwt,
  resolveTenant,
  async (req, res, next) => {
    try {
      const numbers = await telephonyService.listPhoneNumbers(req.tenantContext!.tenantId);
      res.json({ data: numbers });
    } catch (err) {
      next(err);
    }
  },
);

telephonyRouter.get(
  '/twilio/numbers',
  authenticateJwt,
  resolveTenant,
  async (req, res, next) => {
    try {
      const numbers = await telephonyService.fetchTwilioIncomingNumbers(req.tenantId);
      res.json({ data: numbers });
    } catch (err) {
      next(err);
    }
  },
);

telephonyRouter.post(
  '/client/token',
  authenticateJwt,
  resolveTenant,
  async (req, res, next) => {
    try {
      const identity = `tenant:${req.tenantContext!.tenantId}:user:${req.user?.userId ?? 'unknown'}`;
      const token = telephonyService.createClientAccessToken({ identity });
      res.json({ data: token });
    } catch (err) {
      next(err);
    }
  },
);

telephonyRouter.delete(
  '/numbers/:numberId',
  authenticateJwt,
  resolveTenant,
  async (req, res, next) => {
    try {
      await telephonyService.releasePhoneNumber(
        req.tenantContext!.tenantId,
        req.params.numberId as string,
      );
      req.audit?.({
        action: 'telephony.number_released',
        entityType: 'twilio_number',
        entityId: req.params.numberId as string,
      });
      res.json({ message: 'Phone number released' });
    } catch (err) {
      next(err);
    }
  },
);

telephonyRouter.post(
  '/webhook/client-voice',
  webhookRateLimiter,
  validateTwilioSignature,
  async (req, res) => {
    try {
      const { CallSid, To, From, AccountSid } = req.body;
      const destination = To || req.body?.ToNumber;

      if (!destination) {
        logger.warn({ callSid: CallSid }, 'Missing destination number for client voice webhook');
        throw new ValidationError('Missing destination number');
      }

      const result = await telephonyService.handleInboundCall({
        callSid: CallSid,
        to: destination,
        from: From,
        accountSid: AccountSid,
      });

      logger.info(
        {
          callSid: CallSid,
          callSessionId: result.callSessionId,
          tenantId: result.tenantId,
          configVersionId: result.configVersionId,
        },
        'Client voice webhook processed',
      );

      const baseUrl = env.TWILIO_WEBHOOK_BASE_URL.replace(/\/$/, '');
      const wsBase = baseUrl.replace(/^http/i, 'ws');
      const streamUrl = `${wsBase}/api/telephony/media-stream/${result.callSessionId}`;

      const twiml = twimlXml([
        '<Response>',
        '<Connect>',
        `<Stream url="${streamUrl}">`,
        `<Parameter name="tenantId" value="${result.tenantId}" />`,
        `<Parameter name="configVersionId" value="${result.configVersionId}" />`,
        `<Parameter name="callSessionId" value="${result.callSessionId}" />`,
        '</Stream>',
        '</Connect>',
        '</Response>',
      ]);

      logger.info(
        { callSid: CallSid, callSessionId: result.callSessionId, twimlBytes: twiml.length },
        'Client voice TwiML generated',
      );

      res.type('text/xml').send(twiml);
    } catch (err) {
      const correlationId = (req.headers['x-correlation-id'] as string | undefined) ?? 'unknown';
      logger.error(
        {
          err,
          correlationId,
          path: req.originalUrl,
          callSid: req.body?.CallSid,
          to: req.body?.To,
          from: req.body?.From,
        },
        'Client voice webhook failed',
      );
      const fallbackTwiml = isOnboardingNotPublishedError(err)
        ? twimlXml([
            '<Response>',
            '<Say voice="alice">Test call succeeded.</Say>',
            '<Say voice="alice">Please finish onboarding and publish your setup to enable the AI receptionist.</Say>',
            '<Hangup/>',
            '</Response>',
          ])
        : twimlXml([
            '<Response>',
            '<Say voice="alice">We are having trouble connecting your call right now. Please try again shortly.</Say>',
            `<Say voice="alice">Reference ${twimlEscape(correlationId)}</Say>`,
            '<Hangup/>',
            '</Response>',
          ]);
      res.setHeader('X-Correlation-Id', correlationId);
      res.status(200).type('text/xml').send(fallbackTwiml);
    }
  },
);

telephonyRouter.post(
  '/webhook/voice',
  webhookRateLimiter,
  validateTwilioSignature,
  async (req, res) => {
    try {
      const { CallSid, To, From, AccountSid } = req.body;

      logger.info(
        {
          callSid: CallSid,
          to: To,
          from: From,
          accountSid: AccountSid,
          bodyKeys: Object.keys(req.body ?? {}),
          path: req.originalUrl,
          signature: req.headers['x-twilio-signature'] ? 'present' : 'missing',
        },
        'Twilio voice webhook received',
      );

      const tenantId = await telephonyService.resolveTenantByPhone(To);

      const afterHours = await telephonyService.getAfterHoursInfo(tenantId);
      if (afterHours.isAfterHours) {
        logger.info({ callSid: CallSid, tenantId }, 'After-hours call — playing message and recording voicemail');
        const baseUrl = env.TWILIO_WEBHOOK_BASE_URL.replace(/\/$/, '');
        const afterHoursTwiml = twimlXml([
          '<Response>',
          `<Say voice="alice">${twimlEscape(afterHours.message)}</Say>`,
          '<Pause length="1"/>',
          '<Say voice="alice">Please leave a message after the tone.</Say>',
          `<Record maxLength="180" action="${baseUrl}/api/telephony/webhook/voicemail?tenantId=${encodeURIComponent(tenantId)}" transcribe="true" />`,
          '</Response>',
        ]);
        res.type('text/xml').send(afterHoursTwiml);
        return;
      }

      const callLimit = await telephonyService.checkConcurrentCallLimit(tenantId);
      if (!callLimit.allowed) {
        logger.warn(
          { callSid: CallSid, tenantId, current: callLimit.current, limit: callLimit.limit },
          'Concurrent call limit reached',
        );
        const busyTwiml = twimlXml([
          '<Response>',
          '<Say voice="alice">All of our lines are currently busy. Please try again in a few minutes or leave a message after the tone.</Say>',
          `<Record maxLength="120" action="${env.TWILIO_WEBHOOK_BASE_URL.replace(/\/$/, '')}/api/telephony/webhook/voicemail?tenantId=${encodeURIComponent(tenantId)}" transcribe="true" />`,
          '</Response>',
        ]);
        res.type('text/xml').send(busyTwiml);
        return;
      }

      const result = await telephonyService.handleInboundCall({
        callSid: CallSid,
        to: To,
        from: From,
        accountSid: AccountSid,
      });

      const baseUrl = env.TWILIO_WEBHOOK_BASE_URL.replace(/\/$/, '');
      const wsBase = baseUrl.replace(/^http/i, 'ws');
      const streamUrl = `${wsBase}/api/telephony/media-stream/${result.callSessionId}`;

      logger.info(
        {
          callSid: CallSid,
          callSessionId: result.callSessionId,
          streamUrl,
          tenantId: result.tenantId,
          configVersionId: result.configVersionId,
        },
        'Twilio stream response generated',
      );

      const twiml = twimlXml([
        '<Response>',
        '<Connect>',
        `<Stream url="${streamUrl}">`,
        `<Parameter name="tenantId" value="${result.tenantId}" />`,
        `<Parameter name="configVersionId" value="${result.configVersionId}" />`,
        `<Parameter name="callSessionId" value="${result.callSessionId}" />`,
        '</Stream>',
        '</Connect>',
        '</Response>',
      ]);

      logger.info(
        { callSid: CallSid, callSessionId: result.callSessionId, twimlBytes: twiml.length },
        'Voice TwiML generated',
      );

      res.type('text/xml').send(twiml);
    } catch (err) {
      const correlationId = (req.headers['x-correlation-id'] as string | undefined) ?? 'unknown';
      logger.error(
        {
          err,
          correlationId,
          path: req.originalUrl,
          callSid: req.body?.CallSid,
          to: req.body?.To,
          from: req.body?.From,
        },
        'Twilio voice webhook failed',
      );
      const fallbackTwiml = isOnboardingNotPublishedError(err)
        ? twimlXml([
            '<Response>',
            '<Say voice="alice">Test call succeeded.</Say>',
            '<Say voice="alice">Please finish onboarding and publish your setup to enable the AI receptionist.</Say>',
            '<Hangup/>',
            '</Response>',
          ])
        : twimlXml([
            '<Response>',
            '<Say voice="alice">We are having trouble connecting your call right now. Please try again shortly.</Say>',
            `<Say voice="alice">Reference ${twimlEscape(correlationId)}</Say>`,
            '<Hangup/>',
            '</Response>',
          ]);
      res.setHeader('X-Correlation-Id', correlationId);
      res.status(200).type('text/xml').send(fallbackTwiml);
    }
  },
);

telephonyRouter.post(
  '/webhook/voicemail',
  webhookRateLimiter,
  validateTwilioSignature,
  async (req, res) => {
    try {
      const { RecordingUrl, RecordingSid, RecordingDuration, TranscriptionText, CallSid } = req.body;
      const tenantId = (req.query.tenantId as string) || '';
      const callSessionId = (req.query.callSessionId as string) || '';

      logger.info(
        {
          callSid: CallSid,
          tenantId,
          callSessionId,
          recordingSid: RecordingSid,
          recordingDuration: RecordingDuration,
          hasTranscription: Boolean(TranscriptionText),
        },
        'Voicemail received',
      );

      if (callSessionId && tenantId) {
        const { logCallEvent } = await import('../calls/call.service.js');
        await logCallEvent({
          tenantId,
          callSessionId,
          eventType: 'voicemail.received',
          actor: 'system',
          payload: {
            recordingUrl: RecordingUrl,
            recordingSid: RecordingSid,
            durationSeconds: RecordingDuration ? parseInt(RecordingDuration, 10) : null,
            transcription: TranscriptionText || null,
          },
        });
      }

      res.type('text/xml').send('<Response><Hangup/></Response>');
    } catch (err) {
      logger.error({ err }, 'Voicemail webhook failed');
      res.type('text/xml').send('<Response><Hangup/></Response>');
    }
  },
);

telephonyRouter.post(
  '/webhook/forward-status',
  webhookRateLimiter,
  validateTwilioSignature,
  async (req, res) => {
    try {
      const { DialCallStatus, DialCallDuration, CallSid } = req.body;
      const callSessionId = (req.query.callSessionId as string) || '';
      const tenantId = (req.query.tenantId as string) || '';

      logger.info(
        {
          callSid: CallSid,
          callSessionId,
          dialStatus: DialCallStatus,
          dialDuration: DialCallDuration,
        },
        'Call forward status received',
      );

      if (callSessionId && tenantId) {
        const { logCallEvent, updateCallStatus } = await import('../calls/call.service.js');
        await logCallEvent({
          tenantId,
          callSessionId,
          eventType: 'call.forwarded',
          actor: 'system',
          payload: {
            dialStatus: DialCallStatus,
            dialDuration: DialCallDuration,
          },
        });

        if (DialCallStatus === 'completed') {
          await updateCallStatus(tenantId, callSessionId, 'completed', {
            endReason: 'forwarded_completed',
          });
        }
      }

      if (DialCallStatus !== 'completed') {
        const baseUrl = env.TWILIO_WEBHOOK_BASE_URL.replace(/\/$/, '');
        const voicemailTwiml = twimlXml([
          '<Response>',
          '<Say voice="alice">The person you are trying to reach is not available. Please leave a message after the tone.</Say>',
          `<Record maxLength="120" action="${baseUrl}/api/telephony/webhook/voicemail?callSessionId=${encodeURIComponent(callSessionId)}&amp;tenantId=${encodeURIComponent(tenantId)}" transcribe="true" />`,
          '</Response>',
        ]);
        res.type('text/xml').send(voicemailTwiml);
      } else {
        res.type('text/xml').send('<Response/>');
      }
    } catch (err) {
      logger.error({ err }, 'Forward status webhook failed');
      res.type('text/xml').send('<Response><Hangup/></Response>');
    }
  },
);

telephonyRouter.post(
  '/webhook/status',
  webhookRateLimiter,
  validateTwilioSignature,
  async (req, res, next) => {
    try {
      const { CallSid, CallStatus, CallDuration } = req.body;
      logger.info(
        {
          callSid: CallSid,
          status: CallStatus,
          duration: CallDuration,
          bodyKeys: Object.keys(req.body ?? {}),
          path: req.originalUrl,
          signature: req.headers['x-twilio-signature'] ? 'present' : 'missing',
        },
        'Twilio status webhook received',
      );
      await telephonyService.handleCallStatusUpdate({
        callSid: CallSid,
        callStatus: CallStatus,
        callDuration: CallDuration,
      });
      res.status(204).send();
    } catch (err) {
      next(err);
    }
  },
);
