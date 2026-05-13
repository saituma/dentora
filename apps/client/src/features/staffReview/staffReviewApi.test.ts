import { describe, expect, it } from 'vitest';
import { buildStaffReviewItemsQuery, buildStaffReviewStatusUpdateQuery } from './staffReviewApi';

describe('staffReviewApi query builders', () => {
  it('builds filtered list request params', () => {
    expect(
      buildStaffReviewItemsQuery({
        status: 'open',
        severity: 'critical',
        type: 'cancellation_requested',
        source: 'ai_tool',
      }),
    ).toEqual({
      url: '/staff-review/items',
      params: {
        limit: 100,
        status: 'open',
        severity: 'critical',
        type: 'cancellation_requested',
        source: 'ai_tool',
      },
    });
  });

  it('builds status update PATCH request', () => {
    expect(buildStaffReviewStatusUpdateQuery({ id: 'review item/1', status: 'resolved' })).toEqual({
      url: '/staff-review/items/review%20item%2F1/status',
      method: 'PATCH',
      body: {
        status: 'resolved',
        resolutionNote: null,
      },
    });
  });
});
