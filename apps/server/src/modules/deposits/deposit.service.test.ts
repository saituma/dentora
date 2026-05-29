import { beforeEach, describe, expect, it, vi } from 'vitest';

const mockFeatures = vi.hoisted(() => ({ depositCollection: true }));
const mockIsStripeConfigured = vi.hoisted(() => vi.fn(() => true));
const mockCreateCheckoutSession = vi.hoisted(() => vi.fn());
const mockSendPatientMessage = vi.hoisted(() => vi.fn());
const mockGetPatientProfileById = vi.hoisted(() => vi.fn());
const mockGetClinicProfile = vi.hoisted(() => vi.fn());

const mockInsertReturning = vi.hoisted(() => vi.fn());
const mockOnConflictDoNothing = vi.hoisted(() => vi.fn(() => ({ returning: mockInsertReturning })));
const mockValues = vi.hoisted(() =>
  vi.fn(() => ({ onConflictDoNothing: mockOnConflictDoNothing })),
);
const mockInsert = vi.hoisted(() => vi.fn(() => ({ values: mockValues })));

const mockSelectLimit = vi.hoisted(() => vi.fn());
const mockSelectWhere = vi.hoisted(() => vi.fn(() => ({ limit: mockSelectLimit })));
const mockFrom = vi.hoisted(() => vi.fn(() => ({ where: mockSelectWhere })));
const mockSelect = vi.hoisted(() => vi.fn(() => ({ from: mockFrom })));

const mockUpdateWhere = vi.hoisted(() => vi.fn(() => Promise.resolve()));
const mockSet = vi.hoisted(() => vi.fn(() => ({ where: mockUpdateWhere })));
const mockUpdate = vi.hoisted(() => vi.fn(() => ({ set: mockSet })));

vi.mock('../../config/features.js', () => ({ features: mockFeatures }));
vi.mock('../../config/env.js', () => ({ env: { CLIENT_URL: 'http://localhost:3000' } }));
vi.mock('../../lib/stripe.js', () => ({
  isStripeConfigured: mockIsStripeConfigured,
  createCheckoutSession: mockCreateCheckoutSession,
}));
vi.mock('../../lib/twilio-messaging.js', () => ({ sendPatientMessage: mockSendPatientMessage }));
vi.mock('../patients/patients.service.js', () => ({
  getPatientProfileById: mockGetPatientProfileById,
}));
vi.mock('../config/config.service.js', () => ({ getClinicProfile: mockGetClinicProfile }));
vi.mock('../../db/tenant-context.js', () => ({
  assertTenantAccess: (tenantId: string) => tenantId,
  runWithTenantContext: (_ctx: unknown, cb: () => unknown) => cb(),
}));
vi.mock('../../db/index.js', () => ({
  db: { insert: mockInsert, select: mockSelect, update: mockUpdate },
}));
vi.mock('../../lib/logger.js', () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}));

import { createAndSendDeposit, handleStripeEvent } from './deposit.service.js';

const TENANT = 'tenant-a';

function depositConfig(overrides: Record<string, unknown> = {}) {
  return {
    depositEnabled: true,
    depositAmount: '50.00',
    depositCurrency: 'gbp',
    stripeConnectAccountId: 'acct_1',
    ...overrides,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  mockSelectLimit.mockReset();
  mockFeatures.depositCollection = true;
  mockIsStripeConfigured.mockReturnValue(true);
  mockInsertReturning.mockResolvedValue([{ id: 'dep-a' }]);
  mockGetPatientProfileById.mockResolvedValue({
    id: 'patient-a',
    phoneNumber: '+447700900123',
    preferredReminderChannel: 'sms',
  });
  mockGetClinicProfile.mockResolvedValue({ clinicName: 'Smile Dental' });
  mockCreateCheckoutSession.mockResolvedValue({
    id: 'cs_1',
    url: 'https://pay.example/cs_1',
    paymentIntentId: 'pi_1',
    expiresAt: 1893456000,
  });
  mockSendPatientMessage.mockResolvedValue({ sent: true, dryRun: false });
});

describe('createAndSendDeposit', () => {
  const args = {
    tenantId: TENANT,
    appointmentId: 'appt-a',
    patientId: 'patient-a',
    startAt: new Date(Date.now() + 48 * 60 * 60 * 1000),
  };

  it('is a no-op when the feature flag is off', async () => {
    mockFeatures.depositCollection = false;
    await createAndSendDeposit(args);
    expect(mockSelect).not.toHaveBeenCalled();
    expect(mockCreateCheckoutSession).not.toHaveBeenCalled();
  });

  it('does nothing when deposits are disabled for the tenant', async () => {
    mockSelectLimit.mockResolvedValueOnce([depositConfig({ depositEnabled: false })]);
    await createAndSendDeposit(args);
    expect(mockInsert).not.toHaveBeenCalled();
    expect(mockCreateCheckoutSession).not.toHaveBeenCalled();
  });

  it('stays dormant when Stripe is not configured', async () => {
    mockIsStripeConfigured.mockReturnValue(false);
    mockSelectLimit.mockResolvedValueOnce([depositConfig()]);
    await createAndSendDeposit(args);
    expect(mockInsert).not.toHaveBeenCalled();
    expect(mockCreateCheckoutSession).not.toHaveBeenCalled();
  });

  it('creates a deposit, opens a checkout session, and texts the link', async () => {
    mockSelectLimit.mockResolvedValueOnce([depositConfig()]);
    await createAndSendDeposit(args);

    expect(mockInsert).toHaveBeenCalledTimes(1);
    expect(mockValues).toHaveBeenCalledWith(
      expect.objectContaining({ tenantId: TENANT, appointmentId: 'appt-a', amount: '50.00' }),
    );
    expect(mockCreateCheckoutSession).toHaveBeenCalledWith(
      expect.objectContaining({ connectedAccountId: 'acct_1', amount: 50, currency: 'gbp' }),
    );
    expect(mockSet).toHaveBeenCalledWith(
      expect.objectContaining({ status: 'link_sent', stripeCheckoutSessionId: 'cs_1' }),
    );
    expect(mockSendPatientMessage).toHaveBeenCalledWith(
      expect.objectContaining({ channel: 'sms', to: '+447700900123' }),
    );
    const body = (mockSendPatientMessage.mock.calls[0][0] as { body: string }).body;
    expect(body).toContain('https://pay.example/cs_1');
    expect(body).toContain('£50.00');
  });

  it('skips when an existing deposit is already past pending', async () => {
    mockSelectLimit
      .mockResolvedValueOnce([depositConfig()]) // config
      .mockResolvedValueOnce([{ id: 'dep-a', status: 'link_sent' }]); // existing, already sent
    mockInsertReturning.mockResolvedValue([]); // onConflictDoNothing → no row
    await createAndSendDeposit(args);
    expect(mockCreateCheckoutSession).not.toHaveBeenCalled();
  });

  it('resumes a still-pending deposit on retry and creates the checkout', async () => {
    mockSelectLimit
      .mockResolvedValueOnce([depositConfig()]) // config
      .mockResolvedValueOnce([{ id: 'dep-a', status: 'pending' }]); // existing, not yet sent
    mockInsertReturning.mockResolvedValue([]); // onConflictDoNothing → no row
    await createAndSendDeposit(args);
    expect(mockCreateCheckoutSession).toHaveBeenCalled();
    expect(mockSet).toHaveBeenCalledWith(expect.objectContaining({ status: 'link_sent' }));
  });
});

describe('handleStripeEvent', () => {
  it('marks the deposit paid on checkout.session.completed', async () => {
    mockSelectLimit.mockResolvedValueOnce([{ id: 'dep-a', tenantId: TENANT, status: 'link_sent' }]);

    await handleStripeEvent({
      id: 'evt_1',
      type: 'checkout.session.completed',
      data: { object: { id: 'cs_1', payment_intent: 'pi_1' } },
    });

    expect(mockSet).toHaveBeenCalledWith(
      expect.objectContaining({ status: 'paid', stripePaymentIntentId: 'pi_1' }),
    );
  });

  it('ignores an event for an unknown session', async () => {
    mockSelectLimit.mockResolvedValueOnce([]);
    await handleStripeEvent({
      id: 'evt_2',
      type: 'checkout.session.completed',
      data: { object: { id: 'cs_unknown' } },
    });
    expect(mockSet).not.toHaveBeenCalled();
  });

  it('does not downgrade an already-paid deposit', async () => {
    mockSelectLimit.mockResolvedValueOnce([{ id: 'dep-a', tenantId: TENANT, status: 'paid' }]);
    await handleStripeEvent({
      id: 'evt_3',
      type: 'checkout.session.completed',
      data: { object: { id: 'cs_1' } },
    });
    expect(mockSet).not.toHaveBeenCalled();
  });

  it('marks expired only from a pending/link_sent state', async () => {
    mockSelectLimit.mockResolvedValueOnce([{ id: 'dep-a', tenantId: TENANT, status: 'link_sent' }]);
    await handleStripeEvent({
      id: 'evt_4',
      type: 'checkout.session.expired',
      data: { object: { id: 'cs_1' } },
    });
    expect(mockSet).toHaveBeenCalledWith(expect.objectContaining({ status: 'expired' }));
  });
});
