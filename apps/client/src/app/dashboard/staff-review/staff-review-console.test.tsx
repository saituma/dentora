import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { StaffReviewConsole } from './staff-review-console';
import type {
  StaffReviewDailyDigest,
  StaffReviewFilters,
  StaffReviewItem,
  StaffReviewStatus,
} from '@/features/staffReview/staffReviewApi';

const baseItem: StaffReviewItem = {
  id: 'review-1',
  tenantId: 'tenant-a',
  type: 'cancellation_requested',
  severity: 'critical',
  status: 'open',
  source: 'ai_tool',
  reasonCode: 'AI_CANCEL_REQUEST_REQUIRES_STAFF_APPROVAL',
  message: 'Cancellation request needs staff approval.',
  relatedAppointmentId: 'appt-1',
  relatedCallSessionId: 'call-1',
  relatedExternalEventRef: 'safe-event-ref',
  safeMetadata: {
    patientName: 'Jane Secret',
    phone: '+15551234567',
    dob: '1990-01-01',
    rawToolParams: 'do not show',
  },
  createdAt: '2026-05-14T12:00:00.000Z',
  updatedAt: '2026-05-14T12:05:00.000Z',
  slaDueAt: '2026-05-14T12:30:00.000Z',
  overdue: true,
};

const digest: StaffReviewDailyDigest = {
  checkedAt: '2026-05-14T12:00:00.000Z',
  totalUnresolved: 4,
  overdueCount: 1,
  highCriticalOpenCount: 1,
  countsBySeverity: {
    low: 1,
    medium: 1,
    high: 1,
    critical: 1,
  },
  countsByStatus: {
    open: 2,
    in_review: 2,
    resolved: 0,
    ignored: 0,
  },
  countsByType: {
    cancellation_requested: 1,
  },
  countsBySource: {
    ai_tool: 1,
  },
  itemRefs: [],
};

function renderConsole(overrides: Partial<Parameters<typeof StaffReviewConsole>[0]> = {}) {
  const props = {
    filters: { status: 'open' } satisfies StaffReviewFilters,
    items: [baseItem],
    alerts: [baseItem],
    digest,
    isLoading: false,
    isUpdating: false,
    errorMessage: null,
    onFilterChange: vi.fn(),
    onClearFilters: vi.fn(),
    onStatusChange: vi.fn(),
    onRefresh: vi.fn(),
    ...overrides,
  };

  render(<StaffReviewConsole {...props} />);
  return props;
}

describe('StaffReviewConsole', () => {
  it('renders safe staff review fields and hides safeMetadata contents', () => {
    renderConsole();

    expect(screen.getAllByText('Cancellation Requested').length).toBeGreaterThan(0);
    expect(screen.getAllByText('Critical').length).toBeGreaterThan(0);
    expect(screen.getAllByText('AI_CANCEL_REQUEST_REQUIRES_STAFF_APPROVAL').length).toBeGreaterThan(
      0,
    );
    expect(screen.getAllByText('Appointment: appt-1').length).toBeGreaterThan(0);
    expect(screen.getAllByText('Overdue').length).toBeGreaterThan(0);

    const rendered = document.body.textContent ?? '';
    expect(rendered).not.toContain('Jane Secret');
    expect(rendered).not.toContain('+15551234567');
    expect(rendered).not.toContain('1990-01-01');
    expect(rendered).not.toContain('rawToolParams');
    expect(rendered).not.toContain('do not show');
  });

  it('surfaces high-critical alerts and digest counts', () => {
    renderConsole();

    expect(screen.getByText('High-priority review needed')).toBeInTheDocument();
    expect(screen.getByText('High/Critical Open')).toBeInTheDocument();
    expect(screen.getByText('Overdue Unresolved')).toBeInTheDocument();
    expect(screen.getByText('Total Unresolved')).toBeInTheDocument();
    expect(screen.getByText('Critical severity')).toBeInTheDocument();
  });

  it('emits filter changes', async () => {
    const user = userEvent.setup();
    const onFilterChange = vi.fn();
    renderConsole({ onFilterChange });

    const severitySelect = screen.getByLabelText('Severity');
    await user.selectOptions(severitySelect, 'high');

    expect(onFilterChange).toHaveBeenCalledWith('severity', 'high');
  });

  it('emits status update actions', async () => {
    const user = userEvent.setup();
    const onStatusChange = vi.fn<(id: string, status: StaffReviewStatus) => void>();
    renderConsole({ onStatusChange });

    const row = screen
      .getAllByRole('row')
      .find((candidate) => candidate.textContent?.includes('review-1'));
    expect(row).toBeTruthy();
    await user.click(within(row as HTMLElement).getByRole('button', { name: 'Resolve review-1' }));

    expect(onStatusChange).toHaveBeenCalledWith('review-1', 'resolved');
  });
});
