import compression from 'compression';
import cors from 'cors';
import express from 'express';
import helmet from 'helmet';
import { env } from './config/env.js';
import { logger } from './lib/logger.js';
import { checkDbHealth } from './db/index.js';
import { getRedis } from './lib/cache.js';
import { getMetrics, getMetricsContentType } from './lib/metrics.js';

import { requestId } from './middleware/requestId.js';
import { auditMiddleware } from './middleware/audit.js';
import { errorHandler, notFoundHandler } from './middleware/errorHandler.js';
import { metricsMiddleware } from './middleware/metrics.js';
import { csrfProtection, csrfTokenRouter, cookieParser } from './middleware/csrf.js';
import { captureRawBodyForPmsWebhooks } from './middleware/rawBody.js';

import { tenantRouter } from './modules/tenants/index.js';
import { authRouter } from './modules/auth/index.js';
import { callRouter } from './modules/calls/index.js';
import { telephonyRouter } from './modules/telephony/index.js';
import { aiRouter } from './modules/ai/index.js';
import { providerRouter } from './modules/providers/index.js';
import { integrationRouter } from './modules/integrations/index.js';
import { analyticsRouter } from './modules/analytics/index.js';
import { configRouter } from './modules/config/index.js';
import { adminRouter } from './modules/admin/index.js';
import { onboardingRouter } from './modules/onboarding/index.js';
import { aiChatRouter } from './modules/ai-chat/index.js';
import { llmRouter } from './modules/llm/index.js';
import { apiKeyRouter } from './modules/api-keys/index.js';
import { elevenlabsRouter } from './modules/elevenlabs/index.js';
import { appointmentsRouter } from './modules/appointments/index.js';
import { patientsRouter } from './modules/patients/index.js';
import { depositsRouter, stripeWebhookRouter } from './modules/deposits/deposits.routes.js';
import { remindersRouter } from './modules/reminders/reminders.routes.js';
import { staffReviewRouter } from './modules/staff-review/index.js';
import { uploadsRouter } from './modules/uploads/uploads.routes.js';
import { pmsDashboardRouter } from './modules/pms/index.js';
import { opsTelegramRouter } from './modules/ops-telegram/index.js';

export const app = express();

app.set('trust proxy', 1);

// ─── CORS ────────────────────────────────────────────────────────────────────

let allowedOrigins = env.CORS_ORIGIN.split(',')
  .map((s) => s.trim())
  .filter(Boolean);
if (env.NODE_ENV === 'development') {
  const devOrigins = ['http://localhost:3000', 'http://localhost:3001'];
  allowedOrigins = [...new Set([...allowedOrigins, ...devOrigins])];
}

const allowedOriginSet = new Set(allowedOrigins);
const vercelDentoraOriginPattern =
  /^https:\/\/dentora-(?:client|admin)(?:-[a-z0-9-]+)?\.vercel\.app$/i;
const renderWebOriginPattern = /^https:\/\/[a-z0-9-][a-z0-9-]*\.onrender\.com$/i;

app.use(
  cors({
    origin: (origin, callback) => {
      if (!origin) return callback(null, true);
      if (allowedOriginSet.has(origin)) return callback(null, true);
      if (vercelDentoraOriginPattern.test(origin)) return callback(null, true);
      if (env.CORS_ALLOW_ONRENDER && renderWebOriginPattern.test(origin)) {
        return callback(null, true);
      }
      return callback(null, false);
    },
    credentials: true,
    optionsSuccessStatus: 204,
  }),
);

// ─── Core middleware ──────────────────────────────────────────────────────────

app.use(
  helmet({
    contentSecurityPolicy: false,
    crossOriginEmbedderPolicy: false,
    crossOriginResourcePolicy: false,
    crossOriginOpenerPolicy: false,
  }),
);
app.use(compression());
app.use(express.json({ limit: '1mb', verify: captureRawBodyForPmsWebhooks }));
app.use(express.urlencoded({ extended: true, verify: captureRawBodyForPmsWebhooks }));
app.use(cookieParser());
app.use(requestId);
app.use(auditMiddleware);
app.use(metricsMiddleware);

app.use((req, res, next) => {
  const start = Date.now();
  res.on('finish', () => {
    if (req.path === '/api/health' || req.path === '/api/health/ready') return;
    const duration = Date.now() - start;
    logger.info(
      {
        method: req.method,
        path: req.path,
        status: res.statusCode,
        duration,
        correlationId: req.headers['x-correlation-id'],
      },
      `${req.method} ${req.path} ${res.statusCode} ${duration}ms`,
    );
  });
  next();
});

// ─── CSRF ─────────────────────────────────────────────────────────────────────

app.use(csrfTokenRouter);
app.use(csrfProtection);

// ─── Health + metrics ─────────────────────────────────────────────────────────

app.get('/api/health', (_req, res) => {
  res.json({
    status: 'ok',
    service: 'dental-flow-api',
    timestamp: new Date().toISOString(),
    version: process.env.npm_package_version ?? '0.0.0',
  });
});

app.get('/api/health/ready', async (_req, res) => {
  const [dbOk, redisOk] = await Promise.all([
    checkDbHealth(),
    getRedis()
      .ping()
      .then(() => true)
      .catch(() => false),
  ]);
  const ok = dbOk && redisOk;
  res
    .status(ok ? 200 : 503)
    .json({ status: ok ? 'ready' : 'not_ready', database: dbOk, redis: redisOk });
});

app.get('/metrics', async (_req, res) => {
  res.set('Content-Type', getMetricsContentType());
  res.end(await getMetrics());
});

// ─── Routes ──────────────────────────────────────────────────────────────────

app.use('/api/auth', authRouter);
app.use('/api/tenants', tenantRouter);
app.use('/api/calls', callRouter);
app.use('/api/telephony', telephonyRouter);
app.use('/api/ai', aiRouter);
app.use('/api/providers', providerRouter);
app.use('/api/integrations', integrationRouter);
app.use('/integrations', integrationRouter);
app.use('/api/analytics', analyticsRouter);
app.use('/api/config', configRouter);
app.use('/api/admin', adminRouter);
app.use('/api/onboarding', onboardingRouter);
app.use('/api/ai-chat', aiChatRouter);
app.use('/api/llm', llmRouter);
app.use('/api/api-keys', apiKeyRouter);
app.use('/api/elevenlabs', elevenlabsRouter);
app.use('/api/appointments', appointmentsRouter);
app.use('/api/patients', patientsRouter);
app.use('/api/deposits', depositsRouter);
app.use('/api/reminders', remindersRouter);
app.use('/api/webhooks', stripeWebhookRouter);
app.use('/api/staff-review', staffReviewRouter);
app.use('/api/uploads', uploadsRouter);
app.use('/api/pms', pmsDashboardRouter);
app.use('/api/telegram', opsTelegramRouter);

// ─── Error handling ───────────────────────────────────────────────────────────

app.use(notFoundHandler);
app.use(errorHandler);
