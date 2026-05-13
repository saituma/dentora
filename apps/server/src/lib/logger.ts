import pino from 'pino';
import { Writable } from 'stream';
import { trace } from '@opentelemetry/api';
import { env } from '../config/env.js';
import { pushLogEntry, type LogEntry } from '../modules/admin/admin-log-stream.js';
import { redactLogValue } from './log-redaction.js';

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

const pinoOptions: pino.LoggerOptions = {
  level: env.LOG_LEVEL,
  base: {
    service: 'dentora-api',
    env: env.PLATFORM_ENV,
    version: env.PLATFORM_VERSION,
  },
  // Inject active OTel trace/span IDs so Datadog can correlate logs ↔ traces
  mixin() {
    const span = trace.getActiveSpan();
    if (!span) return {};
    const ctx = span.spanContext();
    return { 'dd.trace_id': ctx.traceId, 'dd.span_id': ctx.spanId };
  },
  timestamp: pino.stdTimeFunctions.isoTime,
  serializers: {
    err: pino.stdSerializers.err,
    req: pino.stdSerializers.req,
    res: pino.stdSerializers.res,
  },
  formatters: {
    log(object) {
      return redactLogValue(object) as Record<string, unknown>;
    },
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
      'phoneNumber',
      'callerNumber',
      'fullName',
      'name',
      'from',
      'to',
      'text',
      'userText',
      'aiText',
      'transcription',
      'transcript',
      'fullTranscript',
      'content',
      'address',
      'insuranceId',
    ],
    censor: '[REDACTED]',
  },
};

function createLogger(): pino.Logger {
  if (env.NODE_ENV === 'development') {
    const prettyStream = pino.transport({
      target: 'pino-pretty',
      options: {
        colorize: true,
        translateTime: 'HH:MM:ss.l',
        ignore: 'pid,hostname',
      },
    });

    const multiStream = pino.multistream([
      { stream: liveLogDestination },
      { stream: prettyStream },
    ]);

    return pino(pinoOptions, multiStream);
  }

  return pino(pinoOptions, liveLogDestination);
}

export const logger = createLogger();

export function createTenantLogger(tenantId: string, correlationId: string) {
  return logger.child({ tenantId, correlationId });
}

export function createCallLogger(tenantId: string, correlationId: string, callSessionId: string) {
  return logger.child({ tenantId, correlationId, callSessionId });
}

export type Logger = pino.Logger;
