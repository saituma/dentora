
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
      const numbers = await telephonyService.fetchTwilioIncomingNumbers();
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
  async (req, res, next) => {
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

      const twiml = [
        '<Response>',
        '<Connect>',
        `<Stream url="${streamUrl}">`,
        `<Parameter name="tenantId" value="${result.tenantId}" />`,
        `<Parameter name="configVersionId" value="${result.configVersionId}" />`,
        `<Parameter name="callSessionId" value="${result.callSessionId}" />`,
        '</Stream>',
        '</Connect>',
        '</Response>',
      ].join('');

      logger.info(
        { callSid: CallSid, callSessionId: result.callSessionId, twimlBytes: twiml.length },
        'Client voice TwiML generated',
      );

      res.type('text/xml').send(twiml);
    } catch (err) {
      next(err);
    }
  },
);

telephonyRouter.post(
  '/webhook/voice',
  webhookRateLimiter,
  validateTwilioSignature,
  async (req, res, next) => {
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

      const twiml = [
        '<Response>',
        '<Connect>',
        `<Stream url="${streamUrl}">`,
        `<Parameter name="tenantId" value="${result.tenantId}" />`,
        `<Parameter name="configVersionId" value="${result.configVersionId}" />`,
        `<Parameter name="callSessionId" value="${result.callSessionId}" />`,
        '</Stream>',
        '</Connect>',
        '</Response>',
      ].join('');

      logger.info(
        { callSid: CallSid, callSessionId: result.callSessionId, twimlBytes: twiml.length },
        'Voice TwiML generated',
      );

      res.type('text/xml').send(twiml);
    } catch (err) {
      next(err);
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
