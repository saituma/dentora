import { describe, expect, it, vi } from 'vitest';

// Keep the prod-wired DB/Redis untouched — admin.service imports db at module load.
vi.mock('../../db/index.js', () => ({ db: {}, checkDbHealth: vi.fn(async () => true) }));
vi.mock('../../lib/cache.js', () => ({ cache: {}, getRedis: () => ({}) }));

import { summarizeDailyCost } from './admin.service.js';

describe('summarizeDailyCost', () => {
  const series = [
    { day: '2026-05-27', cost: 1.5 },
    { day: '2026-05-28', cost: 2.25 },
    { day: '2026-05-29', cost: 3.0 },
  ];

  it('returns today cost and total across the series', () => {
    const { todayCost, totalCost } = summarizeDailyCost(series, '2026-05-29');
    expect(todayCost).toBe(3.0);
    expect(totalCost).toBeCloseTo(6.75);
  });

  it('treats a missing today entry as zero cost', () => {
    const { todayCost, totalCost } = summarizeDailyCost(series, '2026-05-30');
    expect(todayCost).toBe(0);
    expect(totalCost).toBeCloseTo(6.75);
  });

  it('handles an empty series', () => {
    expect(summarizeDailyCost([], '2026-05-29')).toEqual({ todayCost: 0, totalCost: 0 });
  });
});
