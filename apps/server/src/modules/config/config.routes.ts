
import { Router } from 'express';
import * as configService from './config.service.js';
import { authenticateJwt, resolveTenant, validate, apiRateLimiter } from '../../middleware/index.js';
import { configWriteRateLimiter } from '../../middleware/rateLimit.js';
import { z } from 'zod';

export const configRouter = Router();

configRouter.use(authenticateJwt, resolveTenant);

configRouter.get('/clinic', async (req, res, next) => {
  try {
    const profile = await configService.getClinicProfile(req.tenantContext!.tenantId);
    res.json(profile ?? { message: 'No clinic profile configured' });
  } catch (err) { next(err); }
});

configRouter.put('/clinic', configWriteRateLimiter, async (req, res, next) => {
  try {
    const profile = await configService.upsertClinicProfile(req.tenantContext!.tenantId, req.body);
    req.audit?.({ action: 'config.clinic_updated', entityType: 'clinic_profile', afterState: req.body });
    res.json(profile);
  } catch (err) { next(err); }
});

configRouter.get('/services', async (req, res, next) => {
  try {
    const items = await configService.getServices(req.tenantContext!.tenantId);
    res.json({ data: items });
  } catch (err) { next(err); }
});

configRouter.post(
  '/services',
  configWriteRateLimiter,
  validate({
    body: z.object({
      serviceName: z.string().min(1).max(200),
      category: z.string().optional(),
      description: z.string().optional(),
      durationMinutes: z.number().int().min(5).optional(),
      price: z.string().optional(),
      isActive: z.boolean().optional(),
    }),
  }),
  async (req, res, next) => {
    try {
      const svc = await configService.addService(req.tenantContext!.tenantId, req.body);
      req.audit?.({ action: 'config.service_added', entityType: 'service', entityId: svc.id });
      res.status(201).json(svc);
    } catch (err) { next(err); }
  },
);

configRouter.put('/services/:id', configWriteRateLimiter, async (req, res, next) => {
  try {
    const id = req.params.id as string;
    const svc = await configService.updateService(req.tenantContext!.tenantId, id, req.body);
    req.audit?.({ action: 'config.service_updated', entityType: 'service', entityId: id });
    res.json(svc);
  } catch (err) { next(err); }
});

configRouter.delete('/services/:id', configWriteRateLimiter, async (req, res, next) => {
  try {
    const id = req.params.id as string;
    await configService.deleteService(req.tenantContext!.tenantId, id);
    req.audit?.({ action: 'config.service_deleted', entityType: 'service', entityId: id });
    res.json({ message: 'Service deleted' });
  } catch (err) { next(err); }
});

configRouter.get('/booking-rules', async (req, res, next) => {
  try {
    const rules = await configService.getBookingRules(req.tenantContext!.tenantId);
    res.json(rules ?? { message: 'No booking rules configured' });
  } catch (err) { next(err); }
});

configRouter.put('/booking-rules', configWriteRateLimiter, async (req, res, next) => {
  try {
    const rules = await configService.upsertBookingRules(req.tenantContext!.tenantId, req.body);
    req.audit?.({ action: 'config.booking_rules_updated', entityType: 'booking_rules', afterState: req.body });
    res.json(rules);
  } catch (err) { next(err); }
});

configRouter.get('/policies', async (req, res, next) => {
  try {
    const items = await configService.getPolicies(req.tenantContext!.tenantId);
    res.json({ data: items });
  } catch (err) { next(err); }
});

configRouter.post(
  '/policies',
  configWriteRateLimiter,
  validate({
    body: z.object({
      policyType: z.string().min(1),
      content: z.string().min(1),
    }),
  }),
  async (req, res, next) => {
    try {
      const policy = await configService.addPolicy(req.tenantContext!.tenantId, req.body);
      req.audit?.({ action: 'config.policy_added', entityType: 'policy', entityId: policy.id });
      res.status(201).json(policy);
    } catch (err) { next(err); }
  },
);

configRouter.put('/policies/:id', configWriteRateLimiter, async (req, res, next) => {
  try {
    const id = req.params.id as string;
    const policy = await configService.updatePolicy(req.tenantContext!.tenantId, id, req.body);
    req.audit?.({ action: 'config.policy_updated', entityType: 'policy', entityId: id });
    res.json(policy);
  } catch (err) { next(err); }
});

configRouter.delete('/policies/:id', configWriteRateLimiter, async (req, res, next) => {
  try {
    const id = req.params.id as string;
    await configService.deletePolicy(req.tenantContext!.tenantId, id);
    req.audit?.({ action: 'config.policy_deleted', entityType: 'policy', entityId: id });
    res.json({ message: 'Policy deleted' });
  } catch (err) { next(err); }
});

configRouter.get('/voice', async (req, res, next) => {
  try {
    const profile = await configService.getVoiceProfile(req.tenantContext!.tenantId);
    res.json(profile ?? { message: 'No voice profile configured' });
  } catch (err) { next(err); }
});

configRouter.put('/voice', configWriteRateLimiter, async (req, res, next) => {
  try {
    const profile = await configService.upsertVoiceProfile(req.tenantContext!.tenantId, req.body);
    req.audit?.({ action: 'config.voice_updated', entityType: 'voice_profile', afterState: req.body });
    res.json(profile);
  } catch (err) { next(err); }
});

configRouter.get('/faqs', async (req, res, next) => {
  try {
    const items = await configService.getFaqs(req.tenantContext!.tenantId);
    res.json({ data: items });
  } catch (err) { next(err); }
});

configRouter.post(
  '/faqs',
  configWriteRateLimiter,
  validate({
    body: z.object({
      question: z.string().min(1),
      answer: z.string().min(1),
      category: z.string().optional(),
    }),
  }),
  async (req, res, next) => {
    try {
      const faq = await configService.addFaq(req.tenantContext!.tenantId, req.body);
      req.audit?.({ action: 'config.faq_added', entityType: 'faq', entityId: faq.id });
      res.status(201).json(faq);
    } catch (err) { next(err); }
  },
);

configRouter.put('/faqs/:id', configWriteRateLimiter, async (req, res, next) => {
  try {
    const id = req.params.id as string;
    const faq = await configService.updateFaq(req.tenantContext!.tenantId, id, req.body);
    req.audit?.({ action: 'config.faq_updated', entityType: 'faq', entityId: id });
    res.json(faq);
  } catch (err) { next(err); }
});

configRouter.delete('/faqs/:id', configWriteRateLimiter, async (req, res, next) => {
  try {
    const id = req.params.id as string;
    await configService.deleteFaq(req.tenantContext!.tenantId, id);
    req.audit?.({ action: 'config.faq_deleted', entityType: 'faq', entityId: id });
    res.json({ message: 'FAQ deleted' });
  } catch (err) { next(err); }
});

configRouter.get('/versions', async (req, res, next) => {
  try {
    const versions = await configService.getConfigVersions(req.tenantContext!.tenantId);
    res.json({ data: versions });
  } catch (err) { next(err); }
});

configRouter.post('/versions', configWriteRateLimiter, async (req, res, next) => {
  try {
    const version = await configService.createConfigVersion(
      req.tenantContext!.tenantId,
      req.user!.userId,
    );
    req.audit?.({ action: 'config.version_created', entityType: 'config_version', entityId: version.id });
    res.status(201).json(version);
  } catch (err) { next(err); }
});

configRouter.post('/versions/:id/publish', configWriteRateLimiter, async (req, res, next) => {
  try {
    const id = req.params.id as string;
    const version = await configService.publishConfigVersion(
      req.tenantContext!.tenantId,
      id,
    );
    req.audit?.({ action: 'config.version_published', entityType: 'config_version', entityId: id });
    res.json(version);
  } catch (err) { next(err); }
});
