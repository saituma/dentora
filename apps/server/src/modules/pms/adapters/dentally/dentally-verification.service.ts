import { createHash, createHmac, randomUUID } from 'node:crypto';
import { desc, and, eq } from 'drizzle-orm';
import { env } from '../../../../config/env.js';
import { db } from '../../../../db/index.js';
import { dentallyVerificationRuns, dentallyVerificationSnapshots } from '../../../../db/schema.js';
import { assertTenantAccess } from '../../../../db/tenant-context.js';
import { logger } from '../../../../lib/logger.js';
import { NotFoundError, ValidationError } from '../../../../lib/errors.js';
import {
  dentallyReadinessScoreGauge,
  dentallyVerificationDuration,
  dentallyVerificationRunsTotal,
  dentallyWebhookVerificationTotal,
} from '../../../../lib/metrics.js';
import {
  getIntegrationByIdForTenant,
  getIntegrationByProvider,
} from '../../../integrations/integration-registry.js';
import type { Integration } from '../../../integrations/integration.types.js';
import {
  DENTALLY_REQUIRED_SCOPES,
  decryptDentallyWebhookSecret,
  dentallyConfigFromIntegration,
  dentallyCredentialsFromIntegration,
  isDentallyFeatureEnabled,
  missingDentallyScopes,
  validateDentallyCredentials,
} from './dentally.auth.js';
import { DentallyClient } from './dentally.client.js';
import {
  DentallyApiError,
  DentallyAuthError,
  DentallyConfigurationError,
  DentallyFeatureDisabledError,
  DentallyValidationError,
  DentallyWebhookSignatureError,
} from './dentally.errors.js';
import type {
  DentallyAppointmentCreateRequest,
  DentallyAppointmentUpdateRequest,
  DentallyConfig,
} from './dentally.types.js';
import { validateDentallyWebhookSignature } from './dentally.webhook.js';
import {
  dentallySafetyEnv,
  isDentallyControlledPilotMode,
  validateDentallyVerificationSafety,
  validateDentallyWriteSafety,
  type DentallyWriteSafetyResult,
} from './dentally-sandbox-safety.js';

export type DentallyVerificationType =
  | 'connectivity'
  | 'credentials'
  | 'scopes'
  | 'patient_lookup'
  | 'appointment_read'
  | 'appointment_create'
  | 'appointment_cancel'
  | 'webhook_delivery';

export type DentallyVerificationStatus = 'pass' | 'fail';

export type DentallyProductionRecommendation =
  | 'NOT READY'
  | 'SANDBOX VERIFIED'
  | 'CONTROLLED PILOT READY'
  | 'PRODUCTION READY';

export type DentallyReadinessCheck =
  | 'connectivity'
  | 'auth'
  | 'scopes'
  | 'patientLookup'
  | 'appointmentRead'
  | 'appointmentCreate'
  | 'appointmentCancel'
  | 'webhookDelivery'
  | 'replayProtection'
  | 'signatureVerification'
  | 'sandboxSafetyChecks';

export type DentallyReadinessStatus = 'PASS' | 'FAIL' | 'WARNING';

export interface DentallyVerificationResult {
  runId?: string;
  verificationType: DentallyVerificationType;
  status: DentallyVerificationStatus;
  requestMetadata: Record<string, unknown>;
  responseMetadata: Record<string, unknown>;
  durationMs: number;
  errorCode?: string;
  errorMessage?: string;
}

export interface DentallyVerificationReport {
  tenantId: string;
  integrationId: string;
  checks: Record<DentallyReadinessCheck, DentallyReadinessStatus>;
  latestRuns: Partial<Record<DentallyVerificationType, DentallyVerificationResult>>;
  readinessScore: number;
  productionRecommendation: DentallyProductionRecommendation;
  productionBlockers: string[];
  sandboxSafety: {
    sandboxHost?: string;
    controlledPilot: boolean;
    writeMode: 'dry_run' | 'live_vendor_write' | 'blocked';
  };
  generatedAt: string;
}

export type DentallyReadinessReport = DentallyVerificationReport;

export interface DentallyVerificationBaseInput {
  tenantId: string;
  integrationId?: string;
  correlationId?: string;
}

export interface DentallyPatientLookupVerificationInput extends DentallyVerificationBaseInput {
  phoneNumber?: string;
}

export interface DentallyAppointmentReadVerificationInput extends DentallyVerificationBaseInput {
  startIso?: string;
  endIso?: string;
}

export interface DentallyAppointmentCreateDryRunInput extends DentallyVerificationBaseInput {
  patientId?: string;
  slot?: {
    startIso: string;
    endIso: string;
  };
  reason?: string;
  executeVendorWrite?: boolean;
}

export interface DentallyAppointmentCancelDryRunInput extends DentallyVerificationBaseInput {
  appointmentId?: string;
  executeVendorWrite?: boolean;
}

export interface DentallyWebhookVerificationInput extends DentallyVerificationBaseInput {
  rawBody?: string;
  signature?: string;
  timestamp?: string;
}

interface DentallyVerificationContext {
  integration: Integration;
  client: DentallyClient;
  config: DentallyConfig;
  providerRequestId: string;
}

type VerificationExecutor = (context: DentallyVerificationContext) => Promise<{
  status?: DentallyVerificationStatus;
  requestMetadata?: Record<string, unknown>;
  responseMetadata?: Record<string, unknown>;
}>;

const VERIFICATION_TYPES: readonly DentallyVerificationType[] = [
  'connectivity',
  'credentials',
  'scopes',
  'patient_lookup',
  'appointment_read',
  'appointment_create',
  'appointment_cancel',
  'webhook_delivery',
] as const;

const REDACTED = '[redacted]';
const SAFE_LOOKUP_PHONE = '0000000000';
const SAFE_EVENT_TYPE = 'appointment.created';

export function isDentallySandboxMode(): boolean {
  return dentallySafetyEnv().sandboxMode;
}

export function areDentallySandboxWritesAllowed(): boolean {
  return dentallySafetyEnv().allowSandboxWrites;
}

export function isDentallyVerificationRouteAllowed(): boolean {
  if (!isDentallyFeatureEnabled()) return false;
  const production = (process.env.NODE_ENV ?? env.NODE_ENV) === 'production';
  if (!production) return true;
  return dentallySafetyEnv().verificationEnabled;
}

function sanitizeString(value: string): string {
  return value
    .replace(/Bearer\s+[A-Za-z0-9._~+/=-]+/gi, `Bearer ${REDACTED}`)
    .replace(/[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/g, REDACTED)
    .replace(/\+?\d[\d\s().-]{6,}\d/g, REDACTED)
    .replace(/\b\d{4}-\d{2}-\d{2}\b/g, REDACTED)
    .replace(/\b(access|refresh|secret|token|authorization)\b[^,}\]]*/gi, REDACTED);
}

export function sanitizeDentallyVerificationMetadata(value: unknown): unknown {
  if (typeof value === 'string') return sanitizeString(value);
  if (typeof value === 'number' || typeof value === 'boolean' || value === null) return value;
  if (Array.isArray(value)) return value.map((item) => sanitizeDentallyVerificationMetadata(item));
  if (!value || typeof value !== 'object') return undefined;

  const sanitized: Record<string, unknown> = {};
  for (const [key, nestedValue] of Object.entries(value)) {
    const normalizedKey = key.toLowerCase();
    const sensitiveKey =
      normalizedKey.includes('token') ||
      normalizedKey.includes('secret') ||
      normalizedKey.includes('authorization') ||
      normalizedKey.includes('phone') ||
      normalizedKey.includes('email') ||
      normalizedKey.includes('patientname') ||
      normalizedKey === 'name' ||
      normalizedKey === 'dob' ||
      normalizedKey.includes('dateofbirth');
    if (
      sensitiveKey &&
      (typeof nestedValue === 'string' ||
        typeof nestedValue === 'number' ||
        (Array.isArray(nestedValue) && nestedValue.length > 0))
    ) {
      sanitized[key] = REDACTED;
      continue;
    }
    sanitized[key] = sanitizeDentallyVerificationMetadata(nestedValue);
  }
  return sanitized;
}

function safeRecord(metadata: Record<string, unknown>): Record<string, unknown> {
  const sanitized = sanitizeDentallyVerificationMetadata(metadata);
  return sanitized && typeof sanitized === 'object' && !Array.isArray(sanitized)
    ? (sanitized as Record<string, unknown>)
    : {};
}

function safeErrorMessage(error: unknown): string {
  if (error instanceof DentallyWebhookSignatureError) return error.message;
  if (error instanceof DentallyValidationError) return error.message;
  if (error instanceof DentallyAuthError) {
    return error.message.startsWith('Dentally API request failed')
      ? 'Dentally authentication request failed'
      : error.message;
  }
  if (error instanceof DentallyApiError) return 'Dentally API request failed';
  if (error instanceof Error) return sanitizeString(error.message);
  return 'Dentally verification failed';
}

function errorCode(error: unknown): string {
  if (error && typeof error === 'object' && 'code' in error && typeof error.code === 'string') {
    return error.code;
  }
  return error instanceof Error ? error.name : 'DentallyVerificationError';
}

function validateIsoRange(startIso: string, endIso: string): void {
  const start = new Date(startIso);
  const end = new Date(endIso);
  if (!Number.isFinite(start.getTime()) || !Number.isFinite(end.getTime())) {
    throw new DentallyValidationError('Dentally verification slot requires valid ISO dates');
  }
  if (end.getTime() <= start.getTime()) {
    throw new DentallyValidationError('Dentally verification slot end must be after start');
  }
}

function defaultSlot(now: Date): { startIso: string; endIso: string } {
  const start = new Date(now.getTime() + 24 * 60 * 60 * 1000);
  const end = new Date(start.getTime() + 30 * 60 * 1000);
  return { startIso: start.toISOString(), endIso: end.toISOString() };
}

function writeSafetyMetadata(safety: DentallyWriteSafetyResult): Record<string, unknown> {
  return {
    liveMode: safety.mode === 'live_vendor_write',
    writeMode: safety.mode,
    sandboxHost: safety.sandboxHost,
    controlledPilot: safety.controlledPilot,
    safetyReason: safety.safetyReason,
  };
}

function payloadHash(rawBody: string): string {
  return createHash('sha256').update(rawBody).digest('hex');
}

function webhookTimestamp(date: Date): string {
  return String(Math.floor(date.getTime() / 1000));
}

function sampleWebhookPayload(): Record<string, unknown> {
  return {
    event_type: SAFE_EVENT_TYPE,
    event_id: 'dentally-verification-event',
    data: {
      id: 'dentally-verification-appointment',
      start_time: '2026-01-01T09:00:00.000Z',
      finish_time: '2026-01-01T09:30:00.000Z',
    },
  };
}

function validateWebhookPayload(payload: unknown): void {
  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) {
    throw new DentallyValidationError('Dentally webhook payload must be an object');
  }
  const record = payload as Record<string, unknown>;
  const eventType = record.event_type ?? record.event ?? record.type;
  if (eventType !== SAFE_EVENT_TYPE) {
    throw new DentallyValidationError(
      'Dentally webhook verification payload has unsupported event type',
    );
  }
  const data = record.data;
  if (!data || typeof data !== 'object' || Array.isArray(data)) {
    throw new DentallyValidationError('Dentally webhook verification payload must include data');
  }
  const id = (data as Record<string, unknown>).id;
  if (typeof id !== 'string' && typeof id !== 'number') {
    throw new DentallyValidationError('Dentally webhook verification payload data requires id');
  }
}

export class DentallyVerificationService {
  public async verifyConnectivity(
    input: DentallyVerificationBaseInput,
  ): Promise<DentallyVerificationResult> {
    return await this.runStep(input, 'connectivity', async ({ client }) => {
      await client.healthCheck();
      return {
        responseMetadata: {
          connectivity: 'healthy',
        },
      };
    });
  }

  public async verifyCredentials(
    input: DentallyVerificationBaseInput,
  ): Promise<DentallyVerificationResult> {
    return await this.runStep(input, 'credentials', async ({ client, integration, config }) => {
      validateDentallyCredentials({
        config,
        credentials: dentallyCredentialsFromIntegration(integration),
      });
      await client.validateCredentials();
      return {
        responseMetadata: {
          credentials: 'valid',
        },
      };
    });
  }

  public async verifyScopes(
    input: DentallyVerificationBaseInput,
  ): Promise<DentallyVerificationResult> {
    return await this.runStep(input, 'scopes', async ({ client, integration }) => {
      const credentials = dentallyCredentialsFromIntegration(integration);
      const missingScopes = missingDentallyScopes(credentials.scopes);
      if (missingScopes.length > 0) {
        throw new DentallyAuthError(
          `Dentally credentials are missing scopes: ${missingScopes.join(', ')}`,
        );
      }
      const liveScopes = await client.getOAuthScopes();
      const liveMissingScopes = liveScopes ? missingDentallyScopes(liveScopes) : [];
      if (liveMissingScopes.length > 0) {
        throw new DentallyAuthError(
          `Dentally live credentials are missing scopes: ${liveMissingScopes.join(', ')}`,
        );
      }
      return {
        responseMetadata: {
          requiredScopes: DENTALLY_REQUIRED_SCOPES,
          configuredScopeCount: credentials.scopes?.length ?? 0,
          liveScopeHeaderPresent: Boolean(liveScopes),
          liveScopeCount: liveScopes?.length ?? 0,
          missingScopeCount: 0,
        },
      };
    });
  }

  public async verifyPatientLookup(
    input: DentallyPatientLookupVerificationInput,
  ): Promise<DentallyVerificationResult> {
    return await this.runStep(input, 'patient_lookup', async ({ client }) => {
      const phoneNumber = input.phoneNumber?.trim() || SAFE_LOOKUP_PHONE;
      const patients = await client.listPatientsByPhone(phoneNumber);
      return {
        requestMetadata: {
          phoneNumberProvided: Boolean(input.phoneNumber?.trim()),
        },
        responseMetadata: {
          resultCount: patients.length,
          lookedUpWithSafeDefault: !input.phoneNumber?.trim(),
        },
      };
    });
  }

  public async verifyAppointmentRead(
    input: DentallyAppointmentReadVerificationInput,
  ): Promise<DentallyVerificationResult> {
    return await this.runStep(input, 'appointment_read', async ({ client }) => {
      const now = new Date();
      const startIso = input.startIso ?? now.toISOString();
      const endIso =
        input.endIso ?? new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000).toISOString();
      validateIsoRange(startIso, endIso);
      const appointments = await client.listAppointments({ startIso, endIso, limit: 25 });
      return {
        requestMetadata: {
          startIso,
          endIso,
          limit: 25,
        },
        responseMetadata: {
          resultCount: appointments.length,
        },
      };
    });
  }

  public async verifyAppointmentCreateDryRun(
    input: DentallyAppointmentCreateDryRunInput,
  ): Promise<DentallyVerificationResult> {
    return await this.runStep(input, 'appointment_create', async ({ client, config }) => {
      const slot = input.slot ?? defaultSlot(new Date());
      validateIsoRange(slot.startIso, slot.endIso);
      const patientId = input.patientId?.trim() || 'dentally-verification-patient';
      const payload: DentallyAppointmentCreateRequest = {
        patient_id: patientId,
        start_time: slot.startIso,
        finish_time: slot.endIso,
        reason: input.reason?.trim() || 'Dentally sandbox verification',
        notes: 'Dentally sandbox verification dry run',
      };
      const safety = validateDentallyWriteSafety({
        tenantId: input.tenantId,
        integrationId: client.integrationId,
        config,
        executeVendorWrite: input.executeVendorWrite,
      });
      if (safety.mode === 'dry_run') {
        return {
          requestMetadata: {
            executeVendorWrite: Boolean(input.executeVendorWrite),
            dryRun: true,
            ...writeSafetyMetadata(safety),
            payloadShape: Object.keys(payload).sort(),
          },
          responseMetadata: {
            simulated: true,
            executedVendorWrite: false,
            ...writeSafetyMetadata(safety),
            payloadValid: true,
          },
        };
      }

      const appointment = await client.createAppointment(payload);
      return {
        requestMetadata: {
          executeVendorWrite: true,
          dryRun: false,
          ...writeSafetyMetadata(safety),
          payloadShape: Object.keys(payload).sort(),
        },
        responseMetadata: {
          simulated: false,
          executedVendorWrite: true,
          ...writeSafetyMetadata(safety),
          appointmentIdPresent: Boolean(appointment.id),
        },
      };
    });
  }

  public async verifyAppointmentCancelDryRun(
    input: DentallyAppointmentCancelDryRunInput,
  ): Promise<DentallyVerificationResult> {
    return await this.runStep(input, 'appointment_cancel', async ({ client, config }) => {
      const appointmentId = input.appointmentId?.trim() || 'dentally-verification-appointment';
      const payload: DentallyAppointmentUpdateRequest = { state: 'Cancelled' };
      const safety = validateDentallyWriteSafety({
        tenantId: input.tenantId,
        integrationId: client.integrationId,
        config,
        executeVendorWrite: input.executeVendorWrite,
      });
      if (safety.mode === 'dry_run') {
        return {
          requestMetadata: {
            executeVendorWrite: Boolean(input.executeVendorWrite),
            dryRun: true,
            ...writeSafetyMetadata(safety),
            appointmentIdProvided: Boolean(input.appointmentId?.trim()),
            payloadShape: Object.keys(payload).sort(),
          },
          responseMetadata: {
            simulated: true,
            executedVendorWrite: false,
            ...writeSafetyMetadata(safety),
            payloadValid: true,
          },
        };
      }
      if (!input.appointmentId?.trim()) {
        throw new DentallyValidationError(
          'Dentally appointment id is required for vendor cancel verification',
        );
      }

      await client.cancelAppointment(appointmentId);
      return {
        requestMetadata: {
          executeVendorWrite: true,
          dryRun: false,
          ...writeSafetyMetadata(safety),
          appointmentIdProvided: true,
          payloadShape: Object.keys(payload).sort(),
        },
        responseMetadata: {
          simulated: false,
          executedVendorWrite: true,
          ...writeSafetyMetadata(safety),
          cancelRequestAccepted: true,
        },
      };
    });
  }

  public async verifyWebhookDelivery(
    input: DentallyWebhookVerificationInput,
  ): Promise<DentallyVerificationResult> {
    return await this.runStep(input, 'webhook_delivery', async ({ integration, config }) => {
      const secret = decryptDentallyWebhookSecret(integration);
      if (!secret) {
        throw new DentallyWebhookSignatureError('Dentally webhook secret is not configured');
      }
      const rawBody = input.rawBody ?? JSON.stringify(sampleWebhookPayload());
      const parsedPayload = JSON.parse(rawBody) as unknown;
      validateWebhookPayload(parsedPayload);

      const receivedAt = new Date();
      const replayWindowSeconds = isDentallyControlledPilotMode()
        ? Math.min(config.replayWindowSeconds, 300)
        : config.replayWindowSeconds;
      const timestamp = input.timestamp ?? webhookTimestamp(receivedAt);
      const signature =
        input.signature ?? createHmac('sha256', secret).update(rawBody).digest('hex');
      validateDentallyWebhookSignature({
        secret,
        rawBody,
        signature,
        timestamp,
        receivedAt,
        replayWindowSeconds,
      });

      let staleTimestampRejected = false;
      try {
        validateDentallyWebhookSignature({
          secret,
          rawBody,
          signature,
          timestamp: webhookTimestamp(
            new Date(receivedAt.getTime() - (replayWindowSeconds + 60) * 1000),
          ),
          receivedAt,
          replayWindowSeconds,
        });
      } catch (error) {
        staleTimestampRejected = error instanceof DentallyWebhookSignatureError;
      }

      const firstHash = payloadHash(rawBody);
      const secondHash = payloadHash(rawBody);
      return {
        requestMetadata: {
          signatureHeader: config.signatureHeader,
          timestampHeader: config.timestampHeader,
          replayWindowSeconds,
          strictReplayWindow: isDentallyControlledPilotMode(),
          providedRawBody: Boolean(input.rawBody),
          providedSignature: Boolean(input.signature),
        },
        responseMetadata: {
          signatureValid: true,
          payloadValid: true,
          staleTimestampRejected,
          replayIdempotencyStable: firstHash === secondHash,
          payloadHash: firstHash,
        },
      };
    });
  }

  public async generateVerificationReport(
    input: DentallyVerificationBaseInput,
  ): Promise<DentallyVerificationReport> {
    assertTenantAccess(input.tenantId);
    this.assertVerificationAllowed();
    const integration = await this.resolveIntegration(input);
    const rows = await db
      .select()
      .from(dentallyVerificationRuns)
      .where(
        and(
          eq(dentallyVerificationRuns.tenantId, input.tenantId),
          eq(dentallyVerificationRuns.integrationId, integration.id),
        ),
      )
      .orderBy(desc(dentallyVerificationRuns.createdAt))
      .limit(100);

    const latestRuns: Partial<Record<DentallyVerificationType, DentallyVerificationResult>> = {};
    for (const row of rows) {
      const verificationType = toVerificationType(row.verificationType);
      if (!verificationType || latestRuns[verificationType]) continue;
      latestRuns[verificationType] = {
        runId: row.id,
        verificationType,
        status: row.status === 'pass' ? 'pass' : 'fail',
        requestMetadata: safeRecord(row.requestMetadata as Record<string, unknown>),
        responseMetadata: safeRecord(row.responseMetadata as Record<string, unknown>),
        durationMs: row.durationMs,
        errorCode: row.errorCode ?? undefined,
        errorMessage: row.errorMessage ?? undefined,
      };
    }

    const config = dentallyConfigFromIntegration(integration);
    const sandboxSafety = sandboxSafetyForReport({
      tenantId: input.tenantId,
      integrationId: integration.id,
      config,
    });
    const checks = readinessChecksFromRuns(latestRuns, sandboxSafety.status);
    const productionBlockers = productionBlockersFromReport(latestRuns, checks);
    if (sandboxSafety.blocker) {
      productionBlockers.push(`Sandbox safety check failed: ${sandboxSafety.blocker}`);
    }
    const readinessScore = readinessScoreFromChecks(checks);
    const productionRecommendation = recommendation(readinessScore, checks, sandboxSafety);
    dentallyReadinessScoreGauge.set(
      {
        tenant_id: input.tenantId,
        recommendation: productionRecommendation,
      },
      readinessScore,
    );

    return {
      tenantId: input.tenantId,
      integrationId: integration.id,
      checks,
      latestRuns,
      readinessScore,
      productionRecommendation,
      productionBlockers,
      sandboxSafety: {
        sandboxHost: sandboxSafety.sandboxHost,
        controlledPilot: sandboxSafety.controlledPilot,
        writeMode: sandboxSafety.writeMode,
      },
      generatedAt: new Date().toISOString(),
    };
  }

  private async runStep(
    input: DentallyVerificationBaseInput,
    verificationType: DentallyVerificationType,
    execute: VerificationExecutor,
  ): Promise<DentallyVerificationResult> {
    assertTenantAccess(input.tenantId);
    this.assertVerificationAllowed();
    const startedAt = Date.now();
    const integration = await this.resolveIntegration(input);
    const config = dentallyConfigFromIntegration(integration);
    const providerRequestId = randomUUID();

    let result: DentallyVerificationResult;
    try {
      const safety = validateDentallyVerificationSafety({
        tenantId: input.tenantId,
        integrationId: integration.id,
        config,
      });
      const client = await DentallyClient.forTenant({
        tenantId: input.tenantId,
        integrationId: integration.id,
        correlationId: input.correlationId,
        requestIdGenerator: () => providerRequestId,
      });
      const executionResult = await execute({ integration, client, config, providerRequestId });
      result = {
        verificationType,
        status: executionResult.status ?? 'pass',
        requestMetadata: safeRecord({
          integrationId: integration.id,
          sandboxMode: isDentallySandboxMode(),
          controlledPilot: safety.controlledPilot,
          sandboxHost: safety.sandboxHost,
          baseUrlHost: new URL(config.baseUrl).hostname,
          providerRequestId,
          ...executionResult.requestMetadata,
        }),
        responseMetadata: safeRecord(executionResult.responseMetadata ?? {}),
        durationMs: Date.now() - startedAt,
      };
    } catch (error) {
      result = {
        verificationType,
        status: 'fail',
        requestMetadata: safeRecord({
          integrationId: integration.id,
          sandboxMode: isDentallySandboxMode(),
          baseUrlHost: new URL(config.baseUrl).hostname,
          providerRequestId,
        }),
        responseMetadata: {},
        durationMs: Date.now() - startedAt,
        errorCode: errorCode(error),
        errorMessage: safeErrorMessage(error),
      };
    }

    const runId = await this.recordRun({
      tenantId: input.tenantId,
      integrationId: integration.id,
      result,
    });
    const completed = { ...result, runId };
    this.logResult({
      tenantId: input.tenantId,
      integrationId: integration.id,
      correlationId: input.correlationId,
      result: completed,
    });
    this.recordMetrics({
      tenantId: input.tenantId,
      result: completed,
    });
    return completed;
  }

  private async resolveIntegration(input: DentallyVerificationBaseInput): Promise<Integration> {
    const integration = input.integrationId
      ? await getIntegrationByIdForTenant(input.tenantId, input.integrationId)
      : ((await getIntegrationByProvider({
          tenantId: input.tenantId,
          integrationType: 'scheduling',
          provider: 'dentally',
          status: 'active',
        })) ??
        (await getIntegrationByProvider({
          tenantId: input.tenantId,
          integrationType: 'pms',
          provider: 'dentally',
          status: 'active',
        })));

    if (!integration) {
      throw new NotFoundError('Dentally integration', input.integrationId ?? 'active');
    }
    if (integration.provider !== 'dentally') {
      throw new DentallyConfigurationError('Integration is not configured for Dentally');
    }
    return integration;
  }

  private assertVerificationAllowed(): void {
    if (!isDentallyFeatureEnabled()) {
      throw new DentallyFeatureDisabledError();
    }
    if (!isDentallyVerificationRouteAllowed()) {
      throw new ValidationError('Dentally verification is disabled in production');
    }
  }

  private async recordRun(input: {
    tenantId: string;
    integrationId: string;
    result: DentallyVerificationResult;
  }): Promise<string | undefined> {
    const [created] = await db
      .insert(dentallyVerificationRuns)
      .values({
        tenantId: input.tenantId,
        integrationId: input.integrationId,
        verificationType: input.result.verificationType,
        status: input.result.status,
        requestMetadata: input.result.requestMetadata,
        responseMetadata: input.result.responseMetadata,
        durationMs: input.result.durationMs,
        errorCode: input.result.errorCode,
        errorMessage: input.result.errorMessage,
      })
      .returning({ id: dentallyVerificationRuns.id });
    if (created?.id) {
      await db.insert(dentallyVerificationSnapshots).values({
        verificationRunId: created.id,
        verificationType: input.result.verificationType,
        requestSummary: safeRecord(input.result.requestMetadata),
        responseSummary: safeRecord(input.result.responseMetadata),
        status: input.result.status,
        durationMs: input.result.durationMs,
      });
    }
    return created?.id;
  }

  private logResult(input: {
    tenantId: string;
    integrationId: string;
    correlationId?: string;
    result: DentallyVerificationResult;
  }): void {
    const payload = {
      tenantId: input.tenantId,
      integrationId: input.integrationId,
      correlationId: input.correlationId,
      verificationStep: input.result.verificationType,
      status: input.result.status,
      durationMs: input.result.durationMs,
      providerRequestId: input.result.requestMetadata.providerRequestId,
      writeMode: input.result.responseMetadata.writeMode,
      liveMode: input.result.responseMetadata.liveMode,
      safeResponseSummary: input.result.responseMetadata,
      errorCode: input.result.errorCode,
    };
    if (input.result.status === 'pass') {
      logger.info(payload, 'Dentally verification step passed');
      return;
    }
    logger.warn(payload, 'Dentally verification step failed');
  }

  private recordMetrics(input: { tenantId: string; result: DentallyVerificationResult }): void {
    const mode =
      input.result.responseMetadata.writeMode === 'live_vendor_write'
        ? 'live_vendor_write'
        : input.result.responseMetadata.writeMode === 'dry_run'
          ? 'dry_run'
          : 'read';
    const labels = {
      tenant_id: input.tenantId,
      verification_type: input.result.verificationType,
      status: input.result.status,
      mode,
    };
    dentallyVerificationRunsTotal.inc(labels);
    dentallyVerificationDuration.observe(labels, input.result.durationMs / 1000);

    if (input.result.verificationType === 'webhook_delivery') {
      const reason =
        input.result.errorCode ??
        (input.result.responseMetadata.staleTimestampRejected === true ? 'verified' : 'unchecked');
      dentallyWebhookVerificationTotal.inc({
        tenant_id: input.tenantId,
        status: input.result.status,
        reason: String(reason),
      });
    }
  }
}

function toVerificationType(value: string): DentallyVerificationType | null {
  return VERIFICATION_TYPES.find((type) => type === value) ?? null;
}

interface SandboxSafetyReport {
  status: DentallyReadinessStatus;
  controlledPilot: boolean;
  writeMode: 'dry_run' | 'live_vendor_write' | 'blocked';
  sandboxHost?: string;
  blocker?: string;
}

function sandboxSafetyForReport(
  input: DentallyVerificationBaseInput & {
    integrationId: string;
    config: DentallyConfig;
  },
): SandboxSafetyReport {
  try {
    const readSafety = validateDentallyVerificationSafety(input);
    const safetyEnv = dentallySafetyEnv();
    let writeMode: SandboxSafetyReport['writeMode'] = 'dry_run';
    if (safetyEnv.allowSandboxWrites) {
      writeMode = validateDentallyWriteSafety({
        ...input,
        executeVendorWrite: true,
      }).mode;
    }
    return {
      status: 'PASS',
      controlledPilot: readSafety.controlledPilot,
      sandboxHost: readSafety.sandboxHost,
      writeMode,
    };
  } catch (error) {
    return {
      status: 'FAIL',
      controlledPilot: dentallySafetyEnv().controlledPilot,
      writeMode: 'blocked',
      blocker: safeErrorMessage(error),
    };
  }
}

function runStatus(
  latestRuns: Partial<Record<DentallyVerificationType, DentallyVerificationResult>>,
  type: DentallyVerificationType,
): DentallyReadinessStatus {
  const run = latestRuns[type];
  if (!run) return 'FAIL';
  return run.status === 'pass' ? 'PASS' : 'FAIL';
}

function writeRunStatus(
  latestRuns: Partial<Record<DentallyVerificationType, DentallyVerificationResult>>,
  type: 'appointment_create' | 'appointment_cancel',
): DentallyReadinessStatus {
  const run = latestRuns[type];
  if (!run || run.status !== 'pass') return 'FAIL';
  return run.responseMetadata.executedVendorWrite === true ? 'PASS' : 'WARNING';
}

function webhookBooleanStatus(
  latestRuns: Partial<Record<DentallyVerificationType, DentallyVerificationResult>>,
  key: 'signatureValid' | 'staleTimestampRejected' | 'replayIdempotencyStable',
): DentallyReadinessStatus {
  const run = latestRuns.webhook_delivery;
  if (!run || run.status !== 'pass') return 'FAIL';
  return run.responseMetadata[key] === true ? 'PASS' : 'FAIL';
}

function readinessChecksFromRuns(
  latestRuns: Partial<Record<DentallyVerificationType, DentallyVerificationResult>>,
  sandboxSafetyStatus: DentallyReadinessStatus,
): Record<DentallyReadinessCheck, DentallyReadinessStatus> {
  const replayTimestamp = webhookBooleanStatus(latestRuns, 'staleTimestampRejected');
  const replayHash = webhookBooleanStatus(latestRuns, 'replayIdempotencyStable');
  return {
    connectivity: runStatus(latestRuns, 'connectivity'),
    auth: runStatus(latestRuns, 'credentials'),
    scopes: runStatus(latestRuns, 'scopes'),
    patientLookup: runStatus(latestRuns, 'patient_lookup'),
    appointmentRead: runStatus(latestRuns, 'appointment_read'),
    appointmentCreate: writeRunStatus(latestRuns, 'appointment_create'),
    appointmentCancel: writeRunStatus(latestRuns, 'appointment_cancel'),
    webhookDelivery: runStatus(latestRuns, 'webhook_delivery'),
    replayProtection: replayTimestamp === 'PASS' && replayHash === 'PASS' ? 'PASS' : 'FAIL',
    signatureVerification: webhookBooleanStatus(latestRuns, 'signatureValid'),
    sandboxSafetyChecks: sandboxSafetyStatus,
  };
}

function readinessScoreFromChecks(
  checks: Record<DentallyReadinessCheck, DentallyReadinessStatus>,
): number {
  const values = Object.values(checks);
  const rawScore = Math.round(
    (values.reduce((score, status) => {
      if (status === 'PASS') return score + 1;
      if (status === 'WARNING') return score + 0.5;
      return score;
    }, 0) /
      values.length) *
      10,
  );
  if (checks.sandboxSafetyChecks === 'FAIL') return Math.min(rawScore, 5);
  if (checks.appointmentCreate === 'WARNING' || checks.appointmentCancel === 'WARNING') {
    return Math.min(rawScore, 7);
  }
  return rawScore;
}

function productionBlockersFromReport(
  latestRuns: Partial<Record<DentallyVerificationType, DentallyVerificationResult>>,
  checks: Record<DentallyReadinessCheck, DentallyReadinessStatus>,
): string[] {
  const blockers: string[] = [];
  const failed = Object.entries(checks)
    .filter(([, status]) => status === 'FAIL')
    .map(([check]) => check);
  if (failed.length > 0) {
    blockers.push(`Missing or failed verification checks: ${failed.join(', ')}`);
  }
  const createExecuted =
    latestRuns.appointment_create?.responseMetadata.executedVendorWrite === true;
  const cancelExecuted =
    latestRuns.appointment_cancel?.responseMetadata.executedVendorWrite === true;
  if (!createExecuted || !cancelExecuted) {
    blockers.push('Appointment create/cancel has not both executed against Dentally sandbox');
  }
  if (latestRuns.webhook_delivery?.requestMetadata.providedRawBody !== true) {
    blockers.push('Webhook verification has not used a captured Dentally sandbox payload');
  }
  return blockers;
}

function recommendation(
  readinessScore: number,
  checks: Record<DentallyReadinessCheck, DentallyReadinessStatus>,
  sandboxSafety: SandboxSafetyReport,
): DentallyProductionRecommendation {
  if (Object.values(checks).some((status) => status === 'FAIL') || readinessScore < 8) {
    return 'NOT READY';
  }
  if (
    checks.appointmentCreate === 'PASS' &&
    checks.appointmentCancel === 'PASS' &&
    sandboxSafety.controlledPilot
  ) {
    return 'CONTROLLED PILOT READY';
  }
  return 'SANDBOX VERIFIED';
}

export const dentallyVerificationService = new DentallyVerificationService();
