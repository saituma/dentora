
import { Router } from 'express';
import * as telephonyService from './telephony.service.js';
import {
  authenticateJwt,
  resolveTenant,
  validate,
  apiRateLimiter,
} from '../../middleware/index.js';
import { webhookRateLimiter } from '../../middleware/rateLimit.js';
import { z } from 'zod';

export const telephonyRouter = Router();

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
  '/webhook/voice',
  webhookRateLimiter,
  async (req, res, next) => {
    try {
      const { CallSid, To, From, AccountSid } = req.body;

      const result = await telephonyService.handleInboundCall({
        callSid: CallSid,
        to: To,
        from: From,
        accountSid: AccountSid,
      });

      res.type('text/xml').send(`
        <?xml version="1.0" encoding="UTF-8"?>
        <Response>
          <Connect>
            <Stream url="wss://${req.hostname}/api/telephony/media-stream/${result.callSessionId}">
              <Parameter name="tenantId" value="${result.tenantId}" />
              <Parameter name="configVersionId" value="${result.configVersionId}" />
              <Parameter name="callSessionId" value="${result.callSessionId}" />
            </Stream>
          </Connect>
        </Response>
      `);
    } catch (err) {
      next(err);
    }
  },
);

telephonyRouter.post(
  '/webhook/status',
  webhookRateLimiter,
  async (req, res, next) => {
    try {
      const { CallSid, CallStatus, CallDuration } = req.body;
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
