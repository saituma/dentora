import type { Job } from 'bullmq';
import { sendEmail, isEmailConfigured } from '../lib/mailer.js';
import { getClinicProfile } from '../modules/config/config.service.js';
import { logger } from '../lib/logger.js';

export type NotificationJobData = {
  tenantId: string;
  type: 'call_summary' | 'missed_call';
  callSessionId: string;
  payload: {
    durationSeconds: number;
    turnCount: number;
    summary: string;
    callerNumberMasked: string;
    endReason: string;
  };
};

export async function processNotificationDelivery(job: Job<NotificationJobData>): Promise<void> {
  const { tenantId, type, callSessionId, payload } = job.data;

  if (!isEmailConfigured()) {
    logger.debug({ tenantId, type }, 'Email not configured — skipping notification');
    return;
  }

  const profile = await getClinicProfile(tenantId);
  const recipientEmail = profile?.email;

  if (!recipientEmail) {
    logger.debug({ tenantId, callSessionId }, 'No clinic email configured — skipping notification');
    return;
  }

  if (type === 'call_summary') {
    await sendCallSummaryEmail({ tenantId, callSessionId, recipientEmail, payload });
  } else if (type === 'missed_call') {
    await sendMissedCallEmail({ tenantId, callSessionId, recipientEmail, payload });
  }
}

async function sendCallSummaryEmail(input: {
  tenantId: string;
  callSessionId: string;
  recipientEmail: string;
  payload: NotificationJobData['payload'];
}): Promise<void> {
  const { recipientEmail, payload } = input;
  const mins = Math.floor(payload.durationSeconds / 60);
  const secs = payload.durationSeconds % 60;
  const duration = mins > 0 ? `${mins}m ${secs}s` : `${secs}s`;

  const subject = `Call summary — ${payload.callerNumberMasked} (${duration})`;

  const text = [
    `Call Summary`,
    ``,
    `Caller: ${payload.callerNumberMasked}`,
    `Duration: ${duration}`,
    `Turns: ${payload.turnCount}`,
    `End reason: ${payload.endReason}`,
    ``,
    `Summary:`,
    payload.summary,
  ].join('\n');

  const html = `
    <div style="font-family:sans-serif;max-width:600px;margin:0 auto;padding:24px">
      <h2 style="color:#1a1a2e;margin-bottom:4px">Call Summary</h2>
      <p style="color:#6b7a8d;margin-top:0">Powered by Dentora AI</p>
      <table style="width:100%;border-collapse:collapse;margin:20px 0">
        <tr>
          <td style="padding:8px 0;color:#6b7a8d;width:120px">Caller</td>
          <td style="padding:8px 0;font-weight:600">${payload.callerNumberMasked}</td>
        </tr>
        <tr>
          <td style="padding:8px 0;color:#6b7a8d">Duration</td>
          <td style="padding:8px 0;font-weight:600">${duration}</td>
        </tr>
        <tr>
          <td style="padding:8px 0;color:#6b7a8d">Turns</td>
          <td style="padding:8px 0;font-weight:600">${payload.turnCount}</td>
        </tr>
        <tr>
          <td style="padding:8px 0;color:#6b7a8d">End reason</td>
          <td style="padding:8px 0">${payload.endReason}</td>
        </tr>
      </table>
      <div style="background:#f9fdfb;border-left:3px solid #00d4aa;padding:16px;border-radius:0 8px 8px 0">
        <p style="margin:0;color:#1a1a2e;line-height:1.6">${payload.summary}</p>
      </div>
      <p style="color:#9aabb5;font-size:12px;margin-top:24px">
        Dentora AI Receptionist · <a href="https://dentora.com" style="color:#00d4aa">dentora.com</a>
      </p>
    </div>
  `;

  await sendEmail({ to: recipientEmail, subject, text, html });
  logger.info(
    { tenantId: input.tenantId, callSessionId: input.callSessionId },
    'Call summary email sent',
  );
}

async function sendMissedCallEmail(input: {
  tenantId: string;
  callSessionId: string;
  recipientEmail: string;
  payload: NotificationJobData['payload'];
}): Promise<void> {
  const { recipientEmail, payload } = input;

  const subject = `Missed call — ${payload.callerNumberMasked}`;
  const text = `A call from ${payload.callerNumberMasked} ended after ${payload.durationSeconds}s without completing (${payload.endReason}).`;
  const html = `
    <div style="font-family:sans-serif;max-width:600px;margin:0 auto;padding:24px">
      <h2 style="color:#e05a5a">Missed Call</h2>
      <p>A call from <strong>${payload.callerNumberMasked}</strong> ended after ${payload.durationSeconds}s.</p>
      <p>Reason: ${payload.endReason}</p>
      <p style="color:#9aabb5;font-size:12px">Dentora AI Receptionist</p>
    </div>
  `;

  await sendEmail({ to: recipientEmail, subject, text, html });
  logger.info(
    { tenantId: input.tenantId, callSessionId: input.callSessionId },
    'Missed call email sent',
  );
}
