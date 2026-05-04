
import pino from 'pino';
import { Writable } from 'stream';
import { env } from '../config/env.js';
import { pushLogEntry, type LogEntry } from '../modules/admin/admin-log-stream.js';

/**
 * A writable stream that taps each pino log line and pushes it to the
 * admin live-log SSE emitter, then forwards it to stdout.
 */
const liveLogDestination = new Writable({
  write(chunk: Buffer, _encoding, callback) {
    try {
      const line = chunk.toString().trim();
      if (line) {
        const parsed = JSON.parse(line) as LogEntry;
        pushLogEntry(parsed);
      }
    } catch {
      // non-JSON line – ignore
    }
    process.stdout.write(chunk, callback);
  },
});

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

// When using a transport (dev mode), pino pipes through it, so we
// can't use a custom destination at the same time.  In that case the
// live-log stream won't receive entries (acceptable for dev).
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
      'apiKey',
      'api_key',
      'encryptedKey',
      'encrypted_key',
      'providerKeyContext.apiKey',
      'req.body.apiKey',
      'req.body.api_key',
      'email',
      'phone',
      'dob',
      'dateOfBirth',
      'firstName',
      'lastName',
      'patientName',
      'address',
      'insuranceId',
    ],
    censor: '[REDACTED]',
  },
}, transport ? undefined : liveLogDestination);

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
