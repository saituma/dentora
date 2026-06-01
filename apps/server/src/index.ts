import 'dotenv/config';

import { initSentry, closeSentry } from './instrument-sentry.js';
initSentry();

import { initTelemetry, shutdownTelemetry } from './lib/telemetry.js';
if (process.env.OTEL_ENABLED === 'true') {
  initTelemetry();
}

import * as Sentry from '@sentry/node';
import { app } from './app.js';
import { env, shouldFailStartupOnRedisError } from './config/env.js';
import { logger } from './lib/logger.js';
import { checkDbHealth, closeDb, runMigrations } from './db/index.js';
import { initRedis, closeRedis } from './lib/cache.js';
import { registerTelegramWebhook } from './lib/telegram.js';
import {
  attachMediaStreamWebSocket,
  clearSessionTimeoutInterval,
  closeAllSessions,
} from './modules/telephony/index.js';
import { attachReceptionistLiveWebSocket } from './modules/llm/index.js';
import { initTelegramDispatcher, notifyOps } from './modules/ops-telegram/index.js';

const port = env.PORT;

// Set when background workers are started in-process (no separate worker dyno).
let stopWorkers: (() => Promise<void>) | null = null;

async function waitForDatabase(maxAttempts = 5, delayMs = 3000): Promise<boolean> {
  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    const dbOk = await checkDbHealth();
    if (dbOk) return true;
    if (attempt < maxAttempts) {
      logger.warn({ attempt, maxAttempts }, 'Database not ready yet, retrying');
      await new Promise((resolve) => setTimeout(resolve, delayMs));
    }
  }
  return false;
}

async function start() {
  initTelegramDispatcher();

  try {
    try {
      await initRedis();
    } catch (err) {
      if (shouldFailStartupOnRedisError(env.NODE_ENV)) {
        logger.error({ err }, 'Redis connection failed at startup');
        process.exit(1);
      }
      logger.warn({ err }, 'Redis connection failed — continuing without cache');
    }

    const dbOk = await waitForDatabase();
    if (!dbOk) {
      logger.error('Database health check failed at startup');
      process.exit(1);
    }
    logger.info('Database connected');

    await runMigrations();

    registerTelegramWebhook().catch(() => undefined);

    const server = app.listen(port, '0.0.0.0', () => {
      logger.info({ port, env: env.NODE_ENV }, `Dentora API listening on 0.0.0.0:${port}`);
      notifyOps({
        category: 'LIFECYCLE',
        title: `🚀 Server started on port ${port} (${env.NODE_ENV})`,
      }).catch(() => undefined);
    });

    attachMediaStreamWebSocket(server);
    attachReceptionistLiveWebSocket(server);

    // No separate worker dyno (cost) — run BullMQ consumers + scheduled tasks
    // (post-call notifications, cost attribution, data retention, health watch) in
    // this process. A failure here must not take down the call-serving API.
    if (process.env.RUN_WORKERS_IN_WEB !== 'false') {
      try {
        const { startBackgroundWorkers, stopBackgroundWorkers } = await import('./worker.js');
        await startBackgroundWorkers();
        stopWorkers = stopBackgroundWorkers;
        logger.info('Background workers started in web process');
      } catch (err) {
        logger.error({ err }, 'Background workers failed to start in web process');
        notifyOps({
          category: 'ERROR',
          title: 'Background workers failed to start in web process',
          detail: String(err).slice(0, 300),
        }).catch(() => undefined);
      }
    }

    server.on('clientError', (err, socket) => {
      const code = (err as NodeJS.ErrnoException).code;
      if (code === 'ECONNRESET' || code === 'EPIPE') {
        socket.destroy();
        return;
      }
      logger.warn({ err }, 'HTTP client error');
      socket.destroy();
    });

    // Prevent Neon compute autosuspend (triggers a ~1-3s cold start after 5 min idle)
    const dbKeepAlive = setInterval(
      async () => {
        try {
          await checkDbHealth();
        } catch {
          /* non-fatal */
        }
      },
      4 * 60 * 1000,
    );
    dbKeepAlive.unref();

    let isShuttingDown = false;

    const shutdown = async (signal: string) => {
      if (isShuttingDown) {
        logger.warn({ signal }, 'Shutdown already in progress');
        return;
      }
      isShuttingDown = true;
      logger.info({ signal }, 'Shutdown signal received');
      notifyOps({ category: 'LIFECYCLE', title: `🛑 Server shutting down (${signal})` }).catch(
        () => undefined,
      );

      clearInterval(dbKeepAlive);
      clearSessionTimeoutInterval();
      await closeAllSessions();
      if (stopWorkers) {
        await stopWorkers().catch((err) =>
          logger.error({ err }, 'Failed to stop background workers'),
        );
      }
      server.close(async () => {
        logger.info('HTTP server closed');
        await closeDb();
        await closeRedis();
        await closeSentry();
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
      if (env.SENTRY_DSN) {
        Sentry.captureException(reason instanceof Error ? reason : new Error(String(reason)));
      }
      logger.error({ err: reason }, 'Unhandled rejection');
      notifyOps({
        category: 'ERROR',
        title: 'Unhandled rejection in API server',
        detail: String(reason).slice(0, 300),
      }).catch(() => undefined);
    });

    process.on('uncaughtException', (err) => {
      if (env.SENTRY_DSN) {
        Sentry.captureException(err);
      }
      logger.fatal({ err }, 'Uncaught exception — shutting down');
      notifyOps({
        category: 'ERROR',
        title: 'Uncaught exception — server exiting',
        detail: err.message,
      }).catch(() => undefined);
      process.exit(1);
    });
  } catch (err) {
    logger.fatal({ err }, 'Failed to start server');
    process.exit(1);
  }
}

start();

export { app };
