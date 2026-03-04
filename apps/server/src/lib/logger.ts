
import pino from 'pino';
import { env } from '../config/env.js';

const transport = env.NODE_ENV === 'development'
  ? {
      target: 'pino-pretty',
      options: {
        colorize: true,
        translateTime: 'HH:MM:ss.l',
        ignore: 'pid,hostname',
      },
    }
  : undefined;

export const logger = pino({
  level: env.LOG_LEVEL,
  transport,
  base: {
    service: 'dental-flow-api',
    env: env.PLATFORM_ENV,
    version: env.PLATFORM_VERSION,
  },
  timestamp: pino.stdTimeFunctions.isoTime,
  serializers: {
    err: pino.stdSerializers.err,
    req: pino.stdSerializers.req,
    res: pino.stdSerializers.res,
  },
  redact: {
    paths: [
      'req.headers.authorization',
      'req.headers.cookie',
      'password',
      'callerPhone',
      'ssn',
      'creditCard',
    ],
    censor: '[REDACTED]',
  },
});

export function createTenantLogger(tenantId: string, correlationId: string) {
  return logger.child({ tenantId, correlationId });
}

export function createCallLogger(
  tenantId: string,
  correlationId: string,
  callSessionId: string,
) {
  return logger.child({ tenantId, correlationId, callSessionId });
}

export type Logger = pino.Logger;
