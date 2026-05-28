import { randomUUID } from 'node:crypto';
import {
  getIntegrationByIdForTenant,
  getIntegrationByProvider,
} from '../../../integrations/integration-registry.js';
import type { Integration } from '../../../integrations/integration.types.js';
import {
  dentallyProviderRequestDuration,
  dentallyProviderRequestsTotal,
  dentallyProviderRetriesTotal,
} from '../../../../lib/metrics.js';
import {
  DentallyApiError,
  DentallyAuthError,
  DentallyCapabilityUnavailableError,
  DentallyConflictError,
  DentallyNetworkError,
  DentallyRateLimitError,
  DentallyValidationError,
  type DentallyRequestErrorContext,
} from './dentally.errors.js';
import { missingDentallyScopes, resolveDentallyAuthContext } from './dentally.auth.js';
import type {
  DentallyAppointment,
  DentallyAppointmentReason,
  DentallyAppointmentCreateRequest,
  DentallyAvailabilityRequest,
  DentallyAvailabilitySlot,
  DentallyClinician,
  DentallyListAppointmentsRequest,
  DentallyAppointmentUpdateRequest,
  DentallyAuthContext,
  DentallyPatient,
  DentallyPatientUpsertRequest,
  DentallyRequestMethod,
  DentallyRoom,
} from './dentally.types.js';

type FetchImplementation = (input: string | URL, init?: RequestInit) => Promise<Response>;

interface DentallyClientOptions {
  fetchImpl?: FetchImplementation;
  sleep?: (ms: number) => Promise<void>;
  requestIdGenerator?: () => string;
}

interface DentallyRequestInit {
  method: DentallyRequestMethod;
  body?: unknown;
  capability?: string;
}

type QueryValue = string | number | boolean | readonly string[] | undefined;

const RETRYABLE_STATUSES = new Set([429, 500, 502, 503, 504]);

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === 'object' && !Array.isArray(value));
}

function arrayFromPayload<T>(
  payload: unknown,
  keys: string[],
  guard: (value: unknown) => value is T,
): T[] {
  if (Array.isArray(payload)) {
    return payload.filter(guard);
  }
  if (!isRecord(payload)) return [];
  for (const key of keys) {
    const candidate = payload[key];
    if (Array.isArray(candidate)) {
      return candidate.filter(guard);
    }
  }
  const data = payload.data;
  if (Array.isArray(data)) {
    return data.filter(guard);
  }
  return [];
}

function objectFromPayload<T>(
  payload: unknown,
  keys: string[],
  guard: (value: unknown) => value is T,
): T {
  if (guard(payload)) return payload;
  if (isRecord(payload)) {
    for (const key of keys) {
      const candidate = payload[key];
      if (guard(candidate)) return candidate;
    }
    if (guard(payload.data)) return payload.data;
  }
  throw new DentallyValidationError('Dentally response did not contain the expected resource', {
    status: 502,
  });
}

function hasId(value: unknown): value is { id: string | number } {
  return isRecord(value) && (typeof value.id === 'string' || typeof value.id === 'number');
}

function isDentallyPatient(value: unknown): value is DentallyPatient {
  return hasId(value);
}

function isDentallyAppointment(value: unknown): value is DentallyAppointment {
  return hasId(value);
}

function isDentallyClinician(value: unknown): value is DentallyClinician {
  return hasId(value);
}

function isDentallyRoom(value: unknown): value is DentallyRoom {
  return hasId(value);
}

function isDentallyAppointmentReason(value: unknown): value is DentallyAppointmentReason {
  return hasId(value);
}

function isDentallyAvailabilitySlot(value: unknown): value is DentallyAvailabilitySlot {
  return (
    isRecord(value) &&
    (typeof value.start_time === 'string' || typeof value.start === 'string') &&
    (typeof value.finish_time === 'string' || typeof value.end === 'string')
  );
}

function joinUrl(baseUrl: string, path: string): string {
  return `${baseUrl.replace(/\/+$/, '')}${path.startsWith('/') ? path : `/${path}`}`;
}

function versionedPath(path: string): string {
  const normalized = path.startsWith('/') ? path : `/${path}`;
  return normalized === '/v1' || normalized.startsWith('/v1/') ? normalized : `/v1${normalized}`;
}

function appendQuery(path: string, query: Record<string, QueryValue>): string {
  const url = new URL(path, 'https://local.invalid');
  for (const [key, value] of Object.entries(query)) {
    if (Array.isArray(value)) {
      for (const item of value) {
        if (String(item).trim()) {
          url.searchParams.append(key, String(item));
        }
      }
    } else if (value !== undefined && String(value).trim()) {
      url.searchParams.set(key, String(value));
    }
  }
  return `${url.pathname}${url.search}`;
}

function withResourceId(path: string, id: string): string {
  const base = path.replace(/\/+$/, '');
  return `${base}/${encodeURIComponent(id)}`;
}

export function sanitizeDentallyMetadata(
  metadata: Record<string, unknown> | undefined,
): Record<string, string> | undefined {
  if (!metadata) return undefined;
  const sanitized: Record<string, string> = {};
  for (const [rawKey, rawValue] of Object.entries(metadata)) {
    if (Object.keys(sanitized).length >= 3) break;
    const key = rawKey.trim().slice(0, 40);
    if (!key) continue;
    const value =
      typeof rawValue === 'string'
        ? rawValue
        : typeof rawValue === 'number' || typeof rawValue === 'boolean'
          ? String(rawValue)
          : JSON.stringify(rawValue);
    if (!value) continue;
    sanitized[key] = value.slice(0, 500);
  }
  return Object.keys(sanitized).length > 0 ? sanitized : undefined;
}

function sanitizePayloadMetadata<T extends { metadata?: Record<string, unknown> }>(input: T): T {
  if (!input.metadata) return input;
  return {
    ...input,
    metadata: sanitizeDentallyMetadata(input.metadata),
  };
}

function retryDelayMs(attempt: number, response?: Response): number {
  const retryAfter = response?.headers.get('retry-after');
  if (retryAfter) {
    const seconds = Number(retryAfter);
    if (Number.isFinite(seconds) && seconds >= 0) {
      return Math.min(seconds * 1000, 30_000);
    }
  }
  return Math.min(250 * 2 ** attempt, 2_000);
}

function retryAfterSeconds(response: Response): number | undefined {
  const value = response.headers.get('retry-after');
  if (!value) return undefined;
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : undefined;
}

function isAbortError(error: unknown): boolean {
  return (
    (error instanceof DOMException && error.name === 'AbortError') ||
    (error instanceof Error && error.name === 'AbortError')
  );
}

function extractOAuthScopes(headerValue: string | null): string[] | null {
  if (!headerValue) return null;
  const scopes = headerValue
    .split(/\s+/)
    .map((scope) => scope.trim())
    .filter(Boolean);
  return scopes.length > 0 ? scopes : null;
}

function capabilityLabel(init: DentallyRequestInit, path: string): string {
  return init.capability ?? `${init.method} ${path}`;
}

function recordProviderRequest(input: {
  tenantId: string;
  method: DentallyRequestMethod;
  capability: string;
  status: string;
  durationMs: number;
}): void {
  const labels = {
    tenant_id: input.tenantId,
    method: input.method,
    capability: input.capability,
    status: input.status,
  };
  dentallyProviderRequestsTotal.inc(labels);
  dentallyProviderRequestDuration.observe(labels, input.durationMs / 1000);
}

function recordProviderRetry(input: {
  tenantId: string;
  method: DentallyRequestMethod;
  capability: string;
  reason: string;
}): void {
  dentallyProviderRetriesTotal.inc({
    tenant_id: input.tenantId,
    method: input.method,
    capability: input.capability,
    reason: input.reason,
  });
}

export class DentallyClient {
  private readonly auth: DentallyAuthContext;
  private readonly fetchImpl: FetchImplementation;
  private readonly sleep: (ms: number) => Promise<void>;
  private readonly requestIdGenerator: () => string;

  public constructor(auth: DentallyAuthContext, options: DentallyClientOptions = {}) {
    this.auth = auth;
    this.fetchImpl = options.fetchImpl ?? fetch;
    this.sleep = options.sleep ?? ((ms) => new Promise((resolve) => setTimeout(resolve, ms)));
    this.requestIdGenerator = options.requestIdGenerator ?? randomUUID;
  }

  public static async forTenant(input: {
    tenantId: string;
    integrationId?: string;
    correlationId?: string;
    requestIdGenerator?: () => string;
  }): Promise<DentallyClient> {
    let integration: Integration | null = null;
    if (input.integrationId) {
      integration = await getIntegrationByIdForTenant(input.tenantId, input.integrationId);
    }

    integration ??= await getIntegrationByProvider({
      tenantId: input.tenantId,
      integrationType: 'scheduling',
      provider: 'dentally',
      status: 'active',
    });

    integration ??= await getIntegrationByProvider({
      tenantId: input.tenantId,
      integrationType: 'pms',
      provider: 'dentally',
      status: 'active',
    });

    if (!integration) {
      throw new DentallyApiError('Dentally integration is not connected for this clinic', 404);
    }

    const authContext = await resolveDentallyAuthContext(integration);
    return new DentallyClient(
      {
        ...authContext,
        correlationId: input.correlationId ?? authContext.correlationId,
      },
      {
        requestIdGenerator: input.requestIdGenerator,
      },
    );
  }

  public get integrationId(): string {
    return this.auth.integrationId;
  }

  public async validateCredentials(): Promise<void> {
    const liveScopes = await this.getOAuthScopes();
    if (liveScopes) {
      const missingScopes = missingDentallyScopes(liveScopes);
      if (missingScopes.length > 0) {
        throw new DentallyAuthError(
          `Dentally live credentials are missing scopes: ${missingScopes.join(', ')}`,
        );
      }
    }
  }

  public async getOAuthScopes(): Promise<string[] | null> {
    const response = await this.requestRaw(this.auth.config.authPath, { method: 'GET' });
    return extractOAuthScopes(response.headers.get('x-oauth-scopes'));
  }

  public async healthCheck(): Promise<void> {
    await this.request(this.auth.config.authPath, { method: 'GET' });
  }

  public async listPatientsByPhone(phone: string): Promise<DentallyPatient[]> {
    const payload = await this.request(
      appendQuery(this.auth.config.patientPath, {
        query: phone,
      }),
      { method: 'GET', capability: 'patient lookup' },
    );
    return arrayFromPayload(payload, ['patients'], isDentallyPatient);
  }

  public async createPatient(input: DentallyPatientUpsertRequest): Promise<DentallyPatient> {
    const payload = await this.request(this.auth.config.patientPath, {
      method: 'POST',
      body: { patient: sanitizePayloadMetadata(input) },
      capability: 'patient create',
    });
    return objectFromPayload(payload, ['patient'], isDentallyPatient);
  }

  public async updatePatient(
    patientId: string,
    input: DentallyPatientUpsertRequest,
  ): Promise<DentallyPatient> {
    const payload = await this.request(withResourceId(this.auth.config.patientPath, patientId), {
      method: 'PATCH',
      body: { patient: sanitizePayloadMetadata(input) },
      capability: 'patient update',
    });
    return objectFromPayload(payload, ['patient'], isDentallyPatient);
  }

  public async listAppointments(
    input: DentallyListAppointmentsRequest,
  ): Promise<DentallyAppointment[]> {
    const payload = await this.request(
      appendQuery(this.auth.config.appointmentPath, {
        on: input.on,
        before: input.before ?? input.endIso,
        after: input.after ?? input.startIso,
        practitioner_id: input.practitioner_id,
        patient_id: input.patient_id,
        room_id: input.room_id,
        site_id: input.site_id,
        state: input.state,
        cancelled: input.cancelled,
        per_page: input.per_page ?? input.limit ?? 100,
      }),
      { method: 'GET', capability: 'appointment list' },
    );
    return arrayFromPayload(payload, ['appointments'], isDentallyAppointment);
  }

  public async getAvailability(
    input: DentallyAvailabilityRequest,
  ): Promise<DentallyAvailabilitySlot[]> {
    const payload = await this.request(
      appendQuery(`${this.auth.config.appointmentPath}/availability`, {
        start_time: input.start_time,
        finish_time: input.finish_time,
        'practitioner_ids[]': input.practitioner_ids,
        duration: input.duration,
      }),
      { method: 'GET', capability: 'appointment availability' },
    );
    return arrayFromPayload(payload, ['availability', 'slots'], isDentallyAvailabilitySlot);
  }

  public async listAppointmentReasons(deleted = false): Promise<DentallyAppointmentReason[]> {
    const payload = await this.request(
      appendQuery('/appointment_reasons', {
        deleted,
      }),
      { method: 'GET', capability: 'appointment reasons read' },
    );
    return arrayFromPayload(payload, ['appointment_reasons'], isDentallyAppointmentReason);
  }

  public async listPractitioners(): Promise<DentallyClinician[]> {
    const payload = await this.request(this.auth.config.clinicianPath, {
      method: 'GET',
      capability: 'practitioners read',
    });
    return arrayFromPayload(payload, ['practitioners'], isDentallyClinician);
  }

  public async listRooms(): Promise<DentallyRoom[]> {
    const payload = await this.request(this.auth.config.roomPath, {
      method: 'GET',
      capability: 'rooms/sites read',
    });
    return arrayFromPayload(payload, ['rooms', 'sites'], isDentallyRoom);
  }

  public async createAppointment(
    input: DentallyAppointmentCreateRequest,
  ): Promise<DentallyAppointment> {
    const payload = await this.request(this.auth.config.appointmentPath, {
      method: 'POST',
      body: { appointment: input },
      capability: 'appointment create',
    });
    return objectFromPayload(payload, ['appointment'], isDentallyAppointment);
  }

  public async updateAppointment(
    appointmentId: string,
    input: DentallyAppointmentUpdateRequest,
  ): Promise<DentallyAppointment> {
    const payload = await this.request(
      withResourceId(this.auth.config.appointmentPath, appointmentId),
      {
        method: 'PATCH',
        body: { appointment: input },
        capability: 'appointment update',
      },
    );
    return objectFromPayload(payload, ['appointment'], isDentallyAppointment);
  }

  public async cancelAppointment(appointmentId: string): Promise<void> {
    await this.updateAppointment(appointmentId, { state: 'Cancelled' });
  }

  private async request(path: string, init: DentallyRequestInit): Promise<unknown> {
    const response = await this.requestRaw(path, init);
    if (response.status === 204) return {};
    return await response.json();
  }

  private async requestRaw(path: string, init: DentallyRequestInit): Promise<Response> {
    const response = await this.fetchDentally(path, init);
    if (response.status === 405 || response.status === 501) {
      throw new DentallyCapabilityUnavailableError(init.capability ?? `${init.method} ${path}`);
    }
    if (!response.ok) {
      throw await this.errorFromResponse(response, init);
    }
    return response;
  }

  private async fetchDentally(path: string, init: DentallyRequestInit): Promise<Response> {
    const url = joinUrl(this.auth.baseUrl, versionedPath(path));
    const method = init.method;
    const retryLimit = method === 'GET' ? this.auth.config.maxRetries : 0;
    const body = init.body ? JSON.stringify(init.body) : undefined;
    const capability = capabilityLabel(init, path);

    for (let attempt = 0; attempt <= retryLimit; attempt += 1) {
      const requestId = this.requestIdGenerator();
      const headers: Record<string, string> = {
        Accept: 'application/json',
        Authorization: this.auth.authorizationHeader,
        'User-Agent': 'DentalFlow-Dentally-Integration/1.0',
        'X-Request-Id': requestId,
        'X-Correlation-Id': this.auth.correlationId,
      };
      if (body) {
        headers['Content-Type'] = 'application/json';
      }

      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), this.auth.config.timeoutMs);
      const startedAt = Date.now();
      try {
        const response = await this.fetchImpl(url, {
          method,
          headers,
          body,
          signal: controller.signal,
        });
        recordProviderRequest({
          tenantId: this.auth.tenantId,
          method,
          capability,
          status: String(response.status),
          durationMs: Date.now() - startedAt,
        });
        if (attempt < retryLimit && RETRYABLE_STATUSES.has(response.status)) {
          recordProviderRetry({
            tenantId: this.auth.tenantId,
            method,
            capability,
            reason: String(response.status),
          });
          await this.sleep(retryDelayMs(attempt, response));
          continue;
        }
        return response;
      } catch (error) {
        const context: DentallyRequestErrorContext = {
          method,
          url,
          requestId,
          correlationId: this.auth.correlationId,
        };
        if (attempt < retryLimit) {
          recordProviderRetry({
            tenantId: this.auth.tenantId,
            method,
            capability,
            reason: isAbortError(error) ? 'timeout' : 'network',
          });
          await this.sleep(retryDelayMs(attempt));
          continue;
        }
        recordProviderRequest({
          tenantId: this.auth.tenantId,
          method,
          capability,
          status: isAbortError(error) ? 'timeout' : 'network_error',
          durationMs: Date.now() - startedAt,
        });
        if (isAbortError(error)) {
          throw new DentallyNetworkError('Dentally request timed out', context);
        }
        throw new DentallyNetworkError('Dentally network request failed', context);
      } finally {
        clearTimeout(timeout);
      }
    }

    throw new DentallyNetworkError('Dentally request retry loop exhausted', {
      method,
      url,
      correlationId: this.auth.correlationId,
    });
  }

  private async errorFromResponse(
    response: Response,
    init: DentallyRequestInit,
  ): Promise<DentallyApiError | DentallyAuthError> {
    const responseBody = (await response.text()).slice(0, 500);
    const context: DentallyRequestErrorContext = {
      status: response.status,
      method: init.method,
      url: response.url,
      correlationId: this.auth.correlationId,
      responseBody,
      retryAfterSeconds: retryAfterSeconds(response),
    };
    const message = `Dentally API request failed with ${response.status}: ${responseBody}`;

    if (response.status === 401) {
      return new DentallyAuthError(message, context);
    }
    if (response.status === 403) {
      if (responseBody.toLowerCase().includes('rate')) {
        return new DentallyRateLimitError(message, context);
      }
      return new DentallyAuthError(message, context);
    }
    if (response.status === 409) {
      return new DentallyConflictError(message, context);
    }
    if (response.status === 422) {
      return new DentallyValidationError(message, context);
    }
    if (response.status === 429) {
      return new DentallyRateLimitError(message, context);
    }
    return new DentallyApiError(message, response.status, context);
  }
}
