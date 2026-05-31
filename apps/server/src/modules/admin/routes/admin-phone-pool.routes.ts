import { Router } from 'express';
import { validate } from '../../../middleware/index.js';
import { z } from 'zod';
import { db } from '../../../db/index.js';
import { twilioNumbers, tenantRegistry } from '../../../db/schema.js';
import { eq, desc } from 'drizzle-orm';
import {
  assignPhoneNumber,
  releasePhoneNumber,
  buyPoolNumber,
} from '../../telephony/telephony.service.js';

export const adminPhonePoolRouter = Router();

// ─── List pool ────────────────────────────────────────────────────────────────

adminPhonePoolRouter.get('/', async (_req, res, next) => {
  try {
    const rows = await db
      .select({
        id: twilioNumbers.id,
        phoneNumber: twilioNumbers.phoneNumber,
        friendlyName: twilioNumbers.friendlyName,
        status: twilioNumbers.status,
        capabilities: twilioNumbers.capabilities,
        tenantId: twilioNumbers.tenantId,
        clinicName: tenantRegistry.clinicName,
        createdAt: twilioNumbers.createdAt,
      })
      .from(twilioNumbers)
      .leftJoin(tenantRegistry, eq(twilioNumbers.tenantId, tenantRegistry.id))
      .orderBy(desc(twilioNumbers.createdAt));
    res.json({ data: rows, total: rows.length });
  } catch (err) {
    next(err);
  }
});

// ─── Buy number ───────────────────────────────────────────────────────────────

adminPhonePoolRouter.post(
  '/buy',
  validate({ body: z.object({ countryCode: z.string().length(2).optional() }) }),
  async (req, res, next) => {
    try {
      const number = await buyPoolNumber(req.body.countryCode);
      res.status(201).json({ number });
    } catch (err) {
      next(err);
    }
  },
);

// ─── Assign number ────────────────────────────────────────────────────────────

adminPhonePoolRouter.post(
  '/:numberId/assign',
  validate({ body: z.object({ tenantId: z.string().uuid() }) }),
  async (req, res, next) => {
    try {
      const numberId = req.params.numberId as string;
      const { tenantId } = req.body as { tenantId: string };
      const [number] = await db
        .select()
        .from(twilioNumbers)
        .where(eq(twilioNumbers.id, numberId))
        .limit(1);
      if (!number) {
        res.status(404).json({ error: 'Number not found' });
        return;
      }
      const assigned = await assignPhoneNumber({
        tenantId,
        phoneNumber: number.phoneNumber,
        twilioSid: number.twilioSid,
        friendlyName: number.friendlyName ?? undefined,
        capabilities: number.capabilities as Record<string, boolean>,
      });
      req.audit?.({
        action: 'admin.phone_number_assigned',
        entityType: 'twilio_number',
        entityId: numberId,
        afterState: { tenantId },
      });
      res.json({ data: assigned });
    } catch (err) {
      next(err);
    }
  },
);

// ─── Release number ───────────────────────────────────────────────────────────

adminPhonePoolRouter.post('/:numberId/release', async (req, res, next) => {
  try {
    const numberId = req.params.numberId as string;
    const [number] = await db
      .select()
      .from(twilioNumbers)
      .where(eq(twilioNumbers.id, numberId))
      .limit(1);
    if (!number) {
      res.status(404).json({ error: 'Number not found' });
      return;
    }
    if (number.tenantId) {
      await releasePhoneNumber(number.tenantId, numberId);
    } else {
      await db
        .update(twilioNumbers)
        .set({ status: 'released', updatedAt: new Date() })
        .where(eq(twilioNumbers.id, numberId));
    }
    req.audit?.({
      action: 'admin.phone_number_released',
      entityType: 'twilio_number',
      entityId: numberId,
      beforeState: { tenantId: number.tenantId, status: number.status },
    });
    res.json({ message: 'Number released' });
  } catch (err) {
    next(err);
  }
});
