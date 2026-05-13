import { beforeEach, describe, expect, it, vi } from 'vitest';
import { AuthorizationError, ValidationError } from '../../lib/errors.js';

const mockDb = vi.hoisted(() => ({
  select: vi.fn(),
}));

vi.mock('../../db/index.js', () => ({ db: mockDb }));
vi.mock('../../lib/cache.js', () => ({
  cache: {
    getTenantScoped: vi.fn().mockResolvedValue(null),
    setTenantScoped: vi.fn().mockResolvedValue(undefined),
    invalidateTenantDomain: vi.fn().mockResolvedValue(undefined),
  },
}));
vi.mock('../../lib/crypto.js', () => ({ generateId: () => 'generated-id' }));
vi.mock('../../lib/logger.js', () => ({
  logger: {
    info: vi.fn(),
    warn: vi.fn(),
  },
}));

import { runWithTenantContext } from '../../db/tenant-context.js';
import { assertTenantReadyForGoLive, computeOnboardingReadiness } from './readiness.js';

interface SelectLimitChain<T> {
  from: ReturnType<typeof vi.fn>;
  where: ReturnType<typeof vi.fn>;
  limit: ReturnType<typeof vi.fn>;
  result: T[];
}

interface SelectWhereChain<T> {
  from: ReturnType<typeof vi.fn>;
  where: ReturnType<typeof vi.fn>;
  result: T[];
}

function selectOne<T>(result: T[]): SelectLimitChain<T> {
  const chain: SelectLimitChain<T> = {
    from: vi.fn(),
    where: vi.fn(),
    limit: vi.fn().mockResolvedValue(result),
    result,
  };
  chain.from.mockReturnValue(chain);
  chain.where.mockReturnValue(chain);
  return chain;
}

function selectMany<T>(result: T[]): SelectWhereChain<T> {
  const chain: SelectWhereChain<T> = {
    from: vi.fn(),
    where: vi.fn().mockResolvedValue(result),
    result,
  };
  chain.from.mockReturnValue(chain);
  return chain;
}

const readyTenant = {
  id: 'tenant-a',
  clinicName: 'Bright Dental',
  clinicSlug: 'bright-dental',
  plan: 'starter',
  status: 'active',
};

const readyActiveConfig = {
  tenantId: 'tenant-a',
  activeVersion: 1,
  activatedBy: 'user-a',
};

const readyPublishedVersion = {
  id: 'version-a',
  tenantId: 'tenant-a',
  version: 1,
  status: 'published',
  createdBy: 'user-a',
};

const readyClinic = {
  tenantId: 'tenant-a',
  clinicName: 'Bright Dental',
  timezone: 'America/New_York',
  primaryPhone: '+15551234567',
  phone: '+15551234567',
  businessHours: { monday: [{ start: '09:00', end: '17:00' }] },
  staffMembers: [{ name: 'Front Desk', phone: '+15557654321' }],
};

const readyService = {
  tenantId: 'tenant-a',
  serviceName: 'Cleaning',
  durationMinutes: 30,
  isActive: true,
};

const readyBookingRules = {
  tenantId: 'tenant-a',
  minNoticePeriodHours: 2,
  maxAdvanceBookingDays: 30,
  defaultAppointmentDurationMinutes: 30,
  bufferBetweenAppointmentsMinutes: 5,
  operatingSchedule: { monday: [{ start: '09:00', end: '17:00' }] },
};

const readyPolicy = {
  tenantId: 'tenant-a',
  escalationConditions: { emergency: 'forward_to_human' },
  emergencyDisclaimer: 'Call 911 for life-threatening emergencies.',
};

const readyVoice = {
  tenantId: 'tenant-a',
  voiceId: 'voice-a',
  voiceAgentId: 'agent-a',
  greetingMessage: 'Thanks for calling Bright Dental.',
  tone: 'professional',
};

const readyPhoneNumber = {
  tenantId: 'tenant-a',
  phoneNumber: '+15551234567',
  twilioSid: 'PN123',
  status: 'active',
  capabilities: { voice: true, sms: true },
};

const readyCalendarIntegration = {
  tenantId: 'tenant-a',
  integrationType: 'calendar',
  provider: 'google_calendar',
  status: 'active',
  config: { calendarId: 'primary' },
  credentials: {
    encryptedAccessToken: 'secret-access-token',
    encryptedRefreshToken: 'secret-refresh-token',
  },
};

interface ReadyRows {
  tenant?: unknown | null;
  activeConfig?: unknown | null;
  publishedVersion?: unknown | null;
  clinic?: unknown | null;
  services?: unknown[];
  bookingRules?: unknown | null;
  policies?: unknown[];
  voice?: unknown | null;
  phoneNumbers?: unknown[];
  integrations?: unknown[];
  requirePublishedConfig?: boolean;
}

function queueReadinessRows(overrides: ReadyRows = {}): void {
  const requirePublishedConfig = overrides.requirePublishedConfig ?? true;
  mockDb.select.mockReturnValueOnce(selectOne([overrides.tenant ?? readyTenant]));
  if (requirePublishedConfig) {
    const activeConfig =
      overrides.activeConfig === null ? [] : [overrides.activeConfig ?? readyActiveConfig];
    mockDb.select.mockReturnValueOnce(selectOne(activeConfig));
    if (activeConfig.length > 0) {
      const publishedVersion =
        overrides.publishedVersion === null
          ? []
          : [overrides.publishedVersion ?? readyPublishedVersion];
      mockDb.select.mockReturnValueOnce(selectOne(publishedVersion));
    }
  }
  mockDb.select.mockReturnValueOnce(
    selectOne(overrides.clinic === null ? [] : [overrides.clinic ?? readyClinic]),
  );
  mockDb.select.mockReturnValueOnce(selectMany(overrides.services ?? [readyService]));
  mockDb.select.mockReturnValueOnce(
    selectOne(overrides.bookingRules === null ? [] : [overrides.bookingRules ?? readyBookingRules]),
  );
  mockDb.select.mockReturnValueOnce(selectMany(overrides.policies ?? [readyPolicy]));
  mockDb.select.mockReturnValueOnce(
    selectOne(overrides.voice === null ? [] : [overrides.voice ?? readyVoice]),
  );
  mockDb.select.mockReturnValueOnce(selectMany(overrides.phoneNumbers ?? [readyPhoneNumber]));
  mockDb.select.mockReturnValueOnce(
    selectMany(overrides.integrations ?? [readyCalendarIntegration]),
  );
}

function withTenant<T>(callback: () => T): T {
  return runWithTenantContext({ tenantId: 'tenant-a', source: 'test' }, callback);
}

async function readiness(overrides: ReadyRows = {}) {
  queueReadinessRows(overrides);
  return await withTenant(() =>
    computeOnboardingReadiness('tenant-a', {
      requirePublishedConfig: overrides.requirePublishedConfig,
    }),
  );
}

function codes(result: { blockingIssues: Array<{ code: string }> }): string[] {
  return result.blockingIssues.map((item) => item.code);
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe('onboarding readiness gate', () => {
  it('returns ready for a fully configured tenant', async () => {
    const result = await readiness();

    expect(result.ready).toBe(true);
    expect(result.blockingIssues).toEqual([]);
    expect(result.checkedAt).toEqual(expect.any(String));
  });

  it('blocks when active published config is missing', async () => {
    const result = await readiness({ activeConfig: null });

    expect(result.ready).toBe(false);
    expect(codes(result)).toContain('ACTIVE_PUBLISHED_CONFIG_MISSING');
  });

  it('blocks when clinic profile is missing', async () => {
    const result = await readiness({ clinic: null });

    expect(result.ready).toBe(false);
    expect(codes(result)).toContain('CLINIC_PROFILE_MISSING');
  });

  it('blocks when no active service exists', async () => {
    const result = await readiness({ services: [{ ...readyService, isActive: false }] });

    expect(result.ready).toBe(false);
    expect(codes(result)).toContain('ACTIVE_SERVICE_MISSING');
  });

  it('blocks when booking rules are missing', async () => {
    const result = await readiness({ bookingRules: null });

    expect(result.ready).toBe(false);
    expect(codes(result)).toContain('BOOKING_RULES_MISSING');
  });

  it('blocks when booking is enabled without active Google Calendar integration', async () => {
    const result = await readiness({ integrations: [] });

    expect(result.ready).toBe(false);
    expect(codes(result)).toContain('GOOGLE_CALENDAR_INTEGRATION_MISSING');
  });

  it('blocks when voice profile or voice agent is missing', async () => {
    const missingVoiceProfile = await readiness({ voice: null });
    expect(codes(missingVoiceProfile)).toContain('VOICE_PROFILE_MISSING');

    const missingAgent = await readiness({ voice: { ...readyVoice, voiceAgentId: '' } });
    expect(codes(missingAgent)).toContain('VOICE_AGENT_ID_MISSING');
  });

  it('blocks when active phone number is missing', async () => {
    const result = await readiness({ phoneNumbers: [] });

    expect(result.ready).toBe(false);
    expect(codes(result)).toContain('ACTIVE_PHONE_NUMBER_MISSING');
  });

  it('blocks when emergency or escalation policy is missing', async () => {
    const result = await readiness({ policies: [{ ...readyPolicy, emergencyDisclaimer: '' }] });

    expect(result.ready).toBe(false);
    expect(codes(result)).toContain('EMERGENCY_POLICY_MISSING');
  });

  it('warns when privacy acknowledgement is not represented and warnings do not block readiness', async () => {
    const result = await readiness();

    expect(result.ready).toBe(true);
    expect(result.warnings.map((item) => item.code)).toContain('PRIVACY_ACK_NOT_REPRESENTED');
  });

  it('rejects cross-tenant readiness checks before reading readiness data', async () => {
    await expect(
      runWithTenantContext({ tenantId: 'tenant-a', source: 'test' }, () =>
        computeOnboardingReadiness('tenant-b'),
      ),
    ).rejects.toThrow(AuthorizationError);
    expect(mockDb.select).not.toHaveBeenCalled();
  });

  it('go-live guard rejects blocking issues', async () => {
    queueReadinessRows({ requirePublishedConfig: false, phoneNumbers: [] });

    await expect(withTenant(() => assertTenantReadyForGoLive('tenant-a'))).rejects.toThrow(
      ValidationError,
    );
  });

  it('go-live guard succeeds when tenant is ready for first publish', async () => {
    queueReadinessRows({ requirePublishedConfig: false });

    await expect(withTenant(() => assertTenantReadyForGoLive('tenant-a'))).resolves.toMatchObject({
      ready: true,
      blockingIssues: [],
    });
  });

  it('does not expose OAuth token material in readiness response', async () => {
    const result = await readiness();
    const serialized = JSON.stringify(result);

    expect(serialized).not.toContain('secret-access-token');
    expect(serialized).not.toContain('secret-refresh-token');
    expect(serialized).not.toContain('encryptedAccessToken');
    expect(serialized).not.toContain('encryptedRefreshToken');
  });
});
