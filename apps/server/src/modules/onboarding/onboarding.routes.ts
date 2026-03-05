
import { Router } from 'express';
import * as onboardingService from './onboarding.service.js';
import { authenticateJwt, resolveTenant, validate, apiRateLimiter } from '../../middleware/index.js';
import { z } from 'zod';

export const onboardingRouter = Router();

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
      speed: z.number().min(0.5).max(2.0).optional(),
      verbosityLevel: z.enum(['short', 'balanced', 'detailed']).optional(),
      empathyLevel: z.enum(['low', 'medium', 'high']).optional(),
      greetingStyle: z.enum(['formal', 'friendly']).optional(),
    }),
  }),
  async (req, res, next) => {
    try {
      await onboardingService.saveVoiceProfile(req.tenantContext!.tenantId, req.body);
      req.audit?.({
        action: 'onboarding.voice_saved',
        entityType: 'voice_profile',
        afterState: req.body,
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
  '/live-transcribe',
  apiRateLimiter,
  validate({
    body: z.object({
      audioBase64: z.string().min(1),
      mimeType: z.string().min(1).max(100).optional(),
      language: z.string().min(2).max(20).optional(),
    }),
  }),
  async (req, res, next) => {
    try {
      const transcript = await onboardingService.transcribeLiveAudio(
        req.tenantContext!.tenantId,
        req.body,
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
