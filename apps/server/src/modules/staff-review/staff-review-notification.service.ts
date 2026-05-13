import { runWithTenantContext } from '../../db/tenant-context.js';
import { logger } from '../../lib/logger.js';
import { isEmailConfigured, sendEmail } from '../../lib/mailer.js';
import { staffReviewNotificationsTotal } from '../../lib/metrics.js';
import {
  NOTIFICATION_COOLDOWN_MS,
  getDailyStaffReviewDigest,
  listItemsNeedingAlerts,
  markItemNotified,
  type StaffReviewItem,
  type StaffReviewItemType,
  type StaffReviewSeverity,
  type StaffReviewSource,
  type StaffReviewStatus,
} from './staff-review.service.js';

export interface StaffReviewNotificationPayload {
  id: string;
  type: StaffReviewItemType;
  severity: StaffReviewSeverity;
  status: StaffReviewStatus;
  source: StaffReviewSource;
  reasonCode: string;
  createdAt: string;
  slaDueAt: string | null;
  overdue: boolean;
  dashboardUrl: string;
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

export function buildAlertPayload(
  item: StaffReviewItem,
  dashboardUrl: string,
  now: Date,
): StaffReviewNotificationPayload {
  const overdue =
    (item.status === 'open' || item.status === 'in_review') &&
    Boolean(item.slaDueAt && item.slaDueAt <= now);
  return {
    id: item.id,
    type: item.type,
    severity: item.severity,
    status: item.status,
    source: item.source,
    reasonCode: item.reasonCode,
    createdAt: item.createdAt.toISOString(),
    slaDueAt: item.slaDueAt?.toISOString() ?? null,
    overdue,
    dashboardUrl,
  };
}

function formatAlertText(payloads: StaffReviewNotificationPayload[], tenantId: string): string {
  const lines = [
    `Dentora Staff Review Alert — ${payloads.length} item(s) require attention`,
    '',
    `Dashboard: ${payloads[0]?.dashboardUrl ?? ''}`,
    '',
  ];
  for (const p of payloads) {
    lines.push(
      `• [${p.severity.toUpperCase()}] ${p.type} — ${p.reasonCode}${p.overdue ? ' (OVERDUE)' : ''}`,
      `  ID: ${p.id}  Status: ${p.status}  Source: ${p.source}`,
      `  Created: ${p.createdAt}${p.slaDueAt ? `  SLA due: ${p.slaDueAt}` : ''}`,
      '',
    );
  }
  lines.push(`Tenant: ${tenantId}`);
  return lines.join('\n');
}

function formatAlertHtml(payloads: StaffReviewNotificationPayload[], tenantId: string): string {
  const rows = payloads
    .map(
      (p) =>
        `<tr>
          <td>${escapeHtml(p.severity.toUpperCase())}${p.overdue ? ' &#9888;' : ''}</td>
          <td>${escapeHtml(p.type)}</td>
          <td>${escapeHtml(p.reasonCode)}</td>
          <td>${escapeHtml(p.status)}</td>
          <td>${escapeHtml(p.createdAt)}</td>
          <td>${p.slaDueAt ? escapeHtml(p.slaDueAt) : '&mdash;'}</td>
        </tr>`,
    )
    .join('');
  const dashboardUrl = escapeHtml(payloads[0]?.dashboardUrl ?? '');
  return `<h2>Dentora Staff Review Alert</h2>
<p>${payloads.length} item(s) require attention. <a href="${dashboardUrl}">Open dashboard</a></p>
<table border="1" cellpadding="4" style="border-collapse:collapse">
  <thead><tr><th>Severity</th><th>Type</th><th>Reason</th><th>Status</th><th>Created</th><th>SLA Due</th></tr></thead>
  <tbody>${rows}</tbody>
</table>
<p>Tenant: ${escapeHtml(tenantId)}</p>`;
}

export async function sendStaffReviewAlerts(input: {
  tenantId: string;
  staffEmail: string;
  dashboardUrl: string;
  cooldownMs?: number;
  now?: Date;
}): Promise<{ notified: number; failed: number }> {
  const now = input.now ?? new Date();
  const cooldownMs = input.cooldownMs ?? NOTIFICATION_COOLDOWN_MS;

  const items = await runWithTenantContext({ tenantId: input.tenantId, source: 'worker' }, () =>
    listItemsNeedingAlerts({ tenantId: input.tenantId, now, cooldownMs }),
  );

  if (items.length === 0) {
    return { notified: 0, failed: 0 };
  }

  const payloads = items.map((item) => buildAlertPayload(item, input.dashboardUrl, now));

  if (!isEmailConfigured()) {
    // TODO: wire a real sender — set RESEND_API_KEY or SMTP_HOST/USER/PASS/FROM
    logger.warn(
      { tenantId: input.tenantId, itemCount: items.length },
      'Staff review alerts pending — no email sender configured',
    );
    staffReviewNotificationsTotal.labels(input.tenantId, 'alert', 'skipped').inc(items.length);
    return { notified: 0, failed: 0 };
  }

  const criticalCount = payloads.filter((p) => p.severity === 'critical' || p.overdue).length;
  const subject =
    criticalCount > 0
      ? `[Dentora] URGENT: ${criticalCount} critical/overdue staff review item(s)`
      : `[Dentora] Staff Review Alert — ${payloads.length} high-priority item(s)`;

  try {
    await sendEmail({
      to: input.staffEmail,
      subject,
      text: formatAlertText(payloads, input.tenantId),
      html: formatAlertHtml(payloads, input.tenantId),
    });

    // Only mark notified after confirmed send — never before
    await runWithTenantContext({ tenantId: input.tenantId, source: 'worker' }, async () => {
      await Promise.all(
        items.map((item) =>
          markItemNotified({ tenantId: input.tenantId, id: item.id, notifiedAt: now }),
        ),
      );
    });

    staffReviewNotificationsTotal.labels(input.tenantId, 'alert', 'success').inc(items.length);
    logger.info({ tenantId: input.tenantId, notified: items.length }, 'Staff review alerts sent');
    return { notified: items.length, failed: 0 };
  } catch (err) {
    // lastNotifiedAt is NOT updated — item will be retried on next scheduled run
    staffReviewNotificationsTotal.labels(input.tenantId, 'alert', 'failure').inc(items.length);
    logger.error(
      { tenantId: input.tenantId, itemCount: items.length, err },
      'Failed to send staff review alerts',
    );
    return { notified: 0, failed: items.length };
  }
}

export async function sendStaffReviewDailyDigest(input: {
  tenantId: string;
  staffEmail: string;
  dashboardUrl: string;
}): Promise<void> {
  const digest = await runWithTenantContext({ tenantId: input.tenantId, source: 'worker' }, () =>
    getDailyStaffReviewDigest({ tenantId: input.tenantId }),
  );

  if (digest.totalUnresolved === 0 && digest.overdueCount === 0) {
    staffReviewNotificationsTotal.labels(input.tenantId, 'digest', 'skipped').inc();
    return;
  }

  if (!isEmailConfigured()) {
    // TODO: wire a real sender — set RESEND_API_KEY or SMTP_HOST/USER/PASS/FROM
    logger.warn(
      { tenantId: input.tenantId },
      'Staff review daily digest pending — no email sender configured',
    );
    staffReviewNotificationsTotal.labels(input.tenantId, 'digest', 'skipped').inc();
    return;
  }

  const subject = `[Dentora] Daily Staff Review Digest — ${digest.totalUnresolved} unresolved, ${digest.overdueCount} overdue`;

  const severityLines = Object.entries(digest.countsBySeverity)
    .map(([sev, count]) => `  ${sev}: ${count}`)
    .join('\n');
  const statusLines = Object.entries(digest.countsByStatus)
    .map(([status, count]) => `  ${status}: ${count}`)
    .join('\n');

  const text = [
    `Dentora Daily Staff Review Digest — ${digest.checkedAt}`,
    '',
    `Total unresolved: ${digest.totalUnresolved}`,
    `Overdue: ${digest.overdueCount}`,
    `High/Critical open: ${digest.highCriticalOpenCount}`,
    '',
    'By severity:',
    severityLines,
    '',
    'By status:',
    statusLines,
    '',
    `Dashboard: ${input.dashboardUrl}`,
    `Tenant: ${input.tenantId}`,
  ].join('\n');

  const severityRows = Object.entries(digest.countsBySeverity)
    .map(([sev, count]) => `<tr><td>${escapeHtml(sev)}</td><td>${count}</td></tr>`)
    .join('');
  const statusRows = Object.entries(digest.countsByStatus)
    .map(([status, count]) => `<tr><td>${escapeHtml(status)}</td><td>${count}</td></tr>`)
    .join('');
  const html = `<h2>Dentora Daily Staff Review Digest</h2>
<p>As of ${escapeHtml(digest.checkedAt)}</p>
<ul>
  <li>Total unresolved: ${digest.totalUnresolved}</li>
  <li>Overdue: ${digest.overdueCount}</li>
  <li>High/Critical open: ${digest.highCriticalOpenCount}</li>
</ul>
<h3>By severity</h3>
<table border="1" cellpadding="4" style="border-collapse:collapse">
  <thead><tr><th>Severity</th><th>Count</th></tr></thead>
  <tbody>${severityRows}</tbody>
</table>
<h3>By status</h3>
<table border="1" cellpadding="4" style="border-collapse:collapse">
  <thead><tr><th>Status</th><th>Count</th></tr></thead>
  <tbody>${statusRows}</tbody>
</table>
<p><a href="${escapeHtml(input.dashboardUrl)}">Open dashboard</a></p>
<p>Tenant: ${escapeHtml(input.tenantId)}</p>`;

  try {
    await sendEmail({ to: input.staffEmail, subject, text, html });
    staffReviewNotificationsTotal.labels(input.tenantId, 'digest', 'success').inc();
    logger.info({ tenantId: input.tenantId }, 'Staff review daily digest sent');
  } catch (err) {
    staffReviewNotificationsTotal.labels(input.tenantId, 'digest', 'failure').inc();
    logger.error({ tenantId: input.tenantId, err }, 'Failed to send staff review daily digest');
    throw err;
  }
}
