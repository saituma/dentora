import type { Job } from 'bullmq';
import { tenantCacheInvalidateDomain } from '../lib/cache.js';
import { logger } from '../lib/logger.js';

export type AnalyticsEventJobData = {
  tenantId: string;
  callSessionId: string;
  eventType: string;
};

/**
 * Invalidates the analytics cache for a tenant after a call-related event.
 * The analytics service queries the DB directly — this just ensures the next
 * dashboard load gets fresh data instead of a stale 5-minute cache hit.
 */
export async function processAnalyticsEvent(job: Job<AnalyticsEventJobData>): Promise<void> {
  const { tenantId, callSessionId, eventType } = job.data;

  await tenantCacheInvalidateDomain(tenantId, 'analytics');

  logger.info({ tenantId, callSessionId, eventType }, 'Analytics cache invalidated');
}
