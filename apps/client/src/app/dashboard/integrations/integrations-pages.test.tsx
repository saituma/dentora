import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi, beforeEach } from 'vitest';
import IntegrationsPage from './page';
import DentallyIntegrationPage from './dentally/page';
import SoeExactIntegrationPage from './soe-exact/page';
import CsR4PlusIntegrationPage from './cs-r4-plus/page';
import IntegrationLogsPage from './logs/page';

const mocks = vi.hoisted(() => ({
  getIntegrations: vi.fn(),
  getSchedulingConfig: vi.fn(),
  getProviderDetail: vi.fn(),
  getDentallyReport: vi.fn(),
  runDentallyVerification: vi.fn(),
  getIntegrationLogs: vi.fn(),
}));

vi.mock('@/features/integrations/integrationsApi', () => ({
  useGetIntegrationsQuery: mocks.getIntegrations,
  useGetSchedulingConfigQuery: mocks.getSchedulingConfig,
  useGetProviderDetailQuery: mocks.getProviderDetail,
  useGetDentallyVerificationReportQuery: mocks.getDentallyReport,
  useRunDentallyVerificationMutation: mocks.runDentallyVerification,
  useGetIntegrationLogsQuery: mocks.getIntegrationLogs,
}));

vi.mock('sonner', () => ({
  toast: {
    success: vi.fn(),
    error: vi.fn(),
  },
}));

const integrations = [
  {
    id: 'google-a',
    tenantId: 'tenant-a',
    integrationType: 'scheduling',
    provider: 'google_calendar',
    config: {},
    isActive: true,
    healthStatus: 'healthy',
    lastCheckedAt: '2026-05-01T10:00:00.000Z',
    status: 'active',
    createdAt: '2026-05-01T00:00:00.000Z',
  },
];

beforeEach(() => {
  mocks.getIntegrations.mockReturnValue({
    data: { data: integrations },
    isLoading: false,
    isError: false,
  });
  mocks.getSchedulingConfig.mockReturnValue({
    data: {
      data: {
        tenantId: 'tenant-a',
        primaryProvider: 'google_calendar',
        primaryIntegrationId: 'google-a',
        fallbackProvider: null,
        fallbackIntegrationId: null,
        sourceOfTruth: 'google_calendar',
        googleSyncMode: 'fallback_only',
      },
    },
    isLoading: false,
    isError: false,
  });
  mocks.getProviderDetail.mockReturnValue({ isError: true });
  mocks.getDentallyReport.mockReturnValue({
    data: {
      data: {
        tenantId: 'tenant-a',
        integrationId: 'dentally-a',
        checks: {},
        readinessScore: 2,
        productionRecommendation: 'NOT READY',
        productionBlockers: ['Sandbox verification required'],
        generatedAt: '2026-05-01T10:00:00.000Z',
      },
    },
    refetch: vi.fn(),
  });
  mocks.runDentallyVerification.mockReturnValue([vi.fn(), { isLoading: false }]);
  mocks.getIntegrationLogs.mockReturnValue({
    data: { data: [] },
    isLoading: false,
    isError: false,
  });
});

describe('integrations dashboard pages', () => {
  it('renders all provider cards', () => {
    render(<IntegrationsPage />);

    expect(screen.getByText('Google Calendar')).toBeInTheDocument();
    expect(screen.getByText('Dentally')).toBeInTheDocument();
    expect(screen.getByText('SOE / EXACT')).toBeInTheDocument();
    expect(screen.getByText('CS R4+')).toBeInTheDocument();
  });

  it('shows Dentally verification actions and production warnings', () => {
    render(<DentallyIntegrationPage />);

    expect(screen.getByText('Dentally verification')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /connectivity/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /appointment create dry-run/i })).toBeInTheDocument();
    expect(screen.getAllByText(/not production ready/i).length).toBeGreaterThan(0);
  });

  it('shows SOE vendor access required without connected claims', () => {
    render(<SoeExactIntegrationPage />);

    expect(screen.getAllByText(/vendor access required/i).length).toBeGreaterThan(0);
    expect(screen.getByText('Official API docs')).toBeInTheDocument();
    expect(screen.queryByText('Sandbox verified')).not.toBeInTheDocument();
  });

  it('shows CS R4+ vendor access and on-prem connector warning', () => {
    render(<CsR4PlusIntegrationPage />);

    expect(screen.getAllByText(/vendor access required/i).length).toBeGreaterThan(0);
    expect(screen.getAllByText(/on-prem connector/i).length).toBeGreaterThan(0);
    expect(screen.queryByText('Controlled pilot ready')).not.toBeInTheDocument();
  });

  it('renders logs filters and safe empty state', () => {
    render(<IntegrationLogsPage />);

    expect(screen.getByLabelText('Provider filter')).toBeInTheDocument();
    expect(screen.getByLabelText('Status filter')).toBeInTheDocument();
    expect(screen.getByLabelText('Event type filter')).toBeInTheDocument();
    expect(screen.getByText('No logs')).toBeInTheDocument();
  });

  it('displays API errors safely without fake success state', () => {
    mocks.getIntegrations.mockReturnValue({
      data: undefined,
      isLoading: false,
      isError: true,
    });
    mocks.getSchedulingConfig.mockReturnValue({
      data: undefined,
      isLoading: false,
      isError: true,
    });

    render(<IntegrationsPage />);

    expect(screen.getByText('Some integration data is unavailable')).toBeInTheDocument();
    expect(screen.getAllByText('Verification required').length).toBeGreaterThan(0);
    expect(screen.getAllByText('Vendor access required').length).toBeGreaterThan(0);
  });
});
