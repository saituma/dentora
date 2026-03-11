import 'dotenv/config';

import { initTelemetry, shutdownTelemetry } from './lib/telemetry.js';
if (process.env.OTEL_ENABLED === 'true') {
  initTelemetry();
}

import cors from 'cors';
import express from 'express';
import { env } from './config/env.js';
import { logger } from './lib/logger.js';
import { db, checkDbHealth, closeDb } from './db/index.js';
import { initRedis, closeRedis } from './lib/cache.js';
import { getMetrics, getMetricsContentType } from './lib/metrics.js';

import { requestId } from './middleware/requestId.js';
import { auditMiddleware } from './middleware/audit.js';
import { errorHandler, notFoundHandler } from './middleware/errorHandler.js';
import { apiRateLimiter } from './middleware/rateLimit.js';
import { metricsMiddleware } from './middleware/metrics.js';

import { tenantRouter } from './modules/tenants/index.js';
import { authRouter } from './modules/auth/index.js';
import { callRouter } from './modules/calls/index.js';
import { telephonyRouter } from './modules/telephony/index.js';
import { attachMediaStreamWebSocket } from './modules/telephony/index.js';
import { aiRouter } from './modules/ai/index.js';
import { providerRouter } from './modules/providers/index.js';
import { integrationRouter } from './modules/integrations/index.js';
import { billingRouter } from './modules/billing/index.js';
import { analyticsRouter } from './modules/analytics/index.js';
import { configRouter } from './modules/config/index.js';
import { adminRouter } from './modules/admin/index.js';
import { onboardingRouter } from './modules/onboarding/index.js';
import { aiChatRouter } from './modules/ai-chat/index.js';
import { llmRouter, attachReceptionistLiveWebSocket } from './modules/llm/index.js';
import { apiKeyRouter } from './modules/api-keys/index.js';
import { elevenlabsRouter } from './modules/elevenlabs/index.js';
import { appointmentsRouter } from './modules/appointments/index.js';
import { patientsRouter } from './modules/patients/index.js';

const app = express();

app.set('trust proxy', 1);
let allowedOrigins = env.CORS_ORIGIN.split(',').map((s) => s.trim()).filter(Boolean);
if (env.NODE_ENV === 'development') {
  const devOrigins = ['http://localhost:3000', 'http://localhost:3001'];
  allowedOrigins = [...new Set([...allowedOrigins, ...devOrigins])];
}
app.use(
  cors({
    origin: allowedOrigins.length > 0 ? allowedOrigins : false,
    credentials: true,
    optionsSuccessStatus: 204,
  }),
);
app.use(express.json({ limit: '1mb' }));
app.use(express.urlencoded({ extended: true }));
app.use(requestId);
app.use(auditMiddleware);
app.use(metricsMiddleware);

app.use((req, res, next) => {
  const start = Date.now();
  res.on('finish', () => {
    const duration = Date.now() - start;
    logger.info({
      method: req.method,
      path: req.path,
      status: res.statusCode,
      duration,
      correlationId: req.headers['x-correlation-id'],
    }, `${req.method} ${req.path} ${res.statusCode} ${duration}ms`);
  });
  next();
});

app.get('/api/health', (_req, res) => {
  res.json({
    status: 'ok',
    service: 'dental-flow-api',
    timestamp: new Date().toISOString(),
    version: process.env.npm_package_version ?? '0.0.0',
  });
});

app.get('/api/health/ready', async (_req, res) => {
  const dbOk = await checkDbHealth();
  const status = dbOk ? 'ready' : 'not_ready';
  res.status(dbOk ? 200 : 503).json({ status, database: dbOk });
});

app.get('/metrics', async (_req, res) => {
  res.set('Content-Type', getMetricsContentType());
  res.end(await getMetrics());
});

app.use('/api/auth', authRouter);
app.use('/api/tenants', tenantRouter);
app.use('/api/calls', callRouter);
app.use('/api/telephony', telephonyRouter);
app.use('/api/ai', aiRouter);
app.use('/api/providers', providerRouter);
app.use('/api/integrations', integrationRouter);
app.use('/integrations', integrationRouter);
app.use('/api/billing', billingRouter);
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

app.use(notFoundHandler);
app.use(errorHandler);

const port = env.PORT;

async function waitForDatabase(maxAttempts = 5, delayMs = 3000): Promise<boolean> {
  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    const dbOk = await checkDbHealth();
    if (dbOk) {
      return true;
    }

    if (attempt < maxAttempts) {
      logger.warn({ attempt, maxAttempts }, 'Database not ready yet, retrying');
      await new Promise((resolve) => setTimeout(resolve, delayMs));
    }
  }

  return false;
}

async function start() {
  try {
    try {
      await initRedis();
      logger.info('Redis connected');
    } catch (err) {
      logger.warn({ err }, 'Redis connection failed — continuing without cache');
    }

    const dbOk = await waitForDatabase();
    if (!dbOk) {
      logger.error('Database health check failed at startup');
      process.exit(1);
    }
    logger.info('Database connected');

    const server = app.listen(port, () => {
      logger.info({ port, env: env.NODE_ENV }, `Dental Flow API listening on port ${port}`);
    });

    attachMediaStreamWebSocket(server);
    attachReceptionistLiveWebSocket(server);

    let isShuttingDown = false;

    const shutdown = async (signal: string) => {
      if (isShuttingDown) {
        logger.warn({ signal }, 'Shutdown already in progress');
        return;
      }
      isShuttingDown = true;
      logger.info({ signal }, 'Shutdown signal received');

      server.close(async () => {
        logger.info('HTTP server closed');
        await closeDb();
        await closeRedis();
        if (process.env.OTEL_ENABLED === 'true') {
          await shutdownTelemetry();
        }
        logger.info('All connections closed — exiting');
        process.exit(0);
      });

      setTimeout(() => {
        logger.error('Forced shutdown after timeout');
        process.exit(1);
      }, 30_000);
    };

    process.on('SIGTERM', () => shutdown('SIGTERM'));
    process.on('SIGINT', () => shutdown('SIGINT'));

    process.on('unhandledRejection', (reason) => {
      logger.error({ err: reason }, 'Unhandled rejection');
    });

    process.on('uncaughtException', (err) => {
      logger.fatal({ err }, 'Uncaught exception — shutting down');
      process.exit(1);
    });
  } catch (err) {
    logger.fatal({ err }, 'Failed to start server');
    process.exit(1);
  }
}

start();

export { app };
