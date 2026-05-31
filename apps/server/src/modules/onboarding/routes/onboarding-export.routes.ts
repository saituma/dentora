import { Router } from 'express';
import { apiRateLimiter } from '../../../middleware/index.js';
import { db } from '../../../db/index.js';
import {
  bookingRules,
  clinicProfile,
  faqLibrary,
  integrations,
  policies,
  services,
  tenantRegistry,
  voiceProfile,
} from '../../../db/schema.js';
import { eq } from 'drizzle-orm';
import PDFDocument from 'pdfkit';
import type { Readable } from 'stream';
import * as onboardingService from '../onboarding.service.js';

// ─── PDF helpers ──────────────────────────────────────────────────────────────

function safeText(value: unknown): string {
  if (value === null || value === undefined) return '';
  if (typeof value === 'string') return value;
  if (typeof value === 'number' || typeof value === 'boolean') return String(value);
  try {
    return JSON.stringify(value, null, 2);
  } catch {
    return String(value);
  }
}

function writeHeading(doc: PDFKit.PDFDocument, text: string): void {
  doc.moveDown(0.8);
  doc.fontSize(14).fillColor('#111111').text(text, { underline: true });
  doc.moveDown(0.4);
  doc.fontSize(10).fillColor('#111111');
}

function writeKeyValue(doc: PDFKit.PDFDocument, key: string, value: unknown): void {
  const valueText = safeText(value).trim() || '—';
  doc.font('Helvetica-Bold').text(`${key}: `, { continued: true });
  doc.font('Helvetica').text(valueText);
}

function writeMultilineBlock(doc: PDFKit.PDFDocument, title: string, value: unknown): void {
  const valueText = safeText(value).trim();
  doc.font('Helvetica-Bold').text(`${title}:`);
  doc.font('Helvetica').text(valueText || '—', { indent: 12 });
}

export const onboardingExportRouter = Router();

// ─── Voices listing ───────────────────────────────────────────────────────────

onboardingExportRouter.get('/voices', async (_req, res, next) => {
  try {
    const voices = await onboardingService.listAvailableVoices();
    res.json({ data: voices });
  } catch (err) {
    next(err);
  }
});

// ─── Voice preview ────────────────────────────────────────────────────────────

onboardingExportRouter.post('/voice-preview', apiRateLimiter, async (req, res, next) => {
  try {
    const audio = await onboardingService.generateVoicePreview(
      req.tenantContext!.tenantId,
      req.body,
    );
    res.set({
      'Content-Type': 'audio/mpeg',
      'Content-Length': String(audio.length),
      'Cache-Control': 'no-store',
    });
    res.send(audio);
  } catch (err) {
    next(err);
  }
});

// ─── PDF export ───────────────────────────────────────────────────────────────

onboardingExportRouter.get('/export/pdf', apiRateLimiter, async (req, res, next) => {
  try {
    const tenantId = req.tenantContext!.tenantId;

    const [
      [tenantRow],
      [clinic],
      serviceList,
      [booking],
      [policy],
      [voice],
      faqList,
      integrationList,
    ] = await Promise.all([
      db.select().from(tenantRegistry).where(eq(tenantRegistry.id, tenantId)).limit(1),
      db.select().from(clinicProfile).where(eq(clinicProfile.tenantId, tenantId)).limit(1),
      db.select().from(services).where(eq(services.tenantId, tenantId)),
      db.select().from(bookingRules).where(eq(bookingRules.tenantId, tenantId)).limit(1),
      db.select().from(policies).where(eq(policies.tenantId, tenantId)).limit(1),
      db.select().from(voiceProfile).where(eq(voiceProfile.tenantId, tenantId)).limit(1),
      db.select().from(faqLibrary).where(eq(faqLibrary.tenantId, tenantId)),
      db.select().from(integrations).where(eq(integrations.tenantId, tenantId)),
    ]);

    const topics = Array.isArray(policy?.sensitiveTopics)
      ? (policy!.sensitiveTopics as Array<Record<string, unknown>>)
      : [];
    const contextDocuments = topics.filter((t) => t?.type === 'context_document');

    const fileSlug = (tenantRow?.clinicSlug || tenantRow?.clinicName || tenantId)
      .toString()
      .replace(/[^a-z0-9_-]+/gi, '-')
      .toLowerCase();

    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="clinic-context-${fileSlug}.pdf"`);
    res.setHeader('Cache-Control', 'no-store');

    const doc = new PDFDocument({ size: 'A4', margin: 50 });
    (doc as unknown as Readable).pipe(res);

    doc.fontSize(18).fillColor('#111111').text('Clinic Context Export');
    doc.moveDown(0.2);
    doc.fontSize(10).fillColor('#444444').text(`Generated: ${new Date().toISOString()}`);
    doc.moveDown(0.4);

    writeHeading(doc, 'Tenant');
    writeKeyValue(doc, 'Tenant ID', tenantId);
    writeKeyValue(doc, 'Clinic Name', tenantRow?.clinicName ?? clinic?.clinicName ?? '—');
    writeKeyValue(doc, 'Clinic Slug', tenantRow?.clinicSlug ?? '—');
    writeKeyValue(doc, 'Plan', tenantRow?.plan ?? '—');
    writeKeyValue(doc, 'Status', tenantRow?.status ?? '—');

    writeHeading(doc, 'Clinic Profile');
    writeKeyValue(doc, 'Clinic name', clinic?.clinicName);
    writeKeyValue(doc, 'Legal entity', clinic?.legalEntityName);
    writeKeyValue(doc, 'Timezone', clinic?.timezone);
    writeKeyValue(doc, 'Primary phone', clinic?.primaryPhone ?? clinic?.phone);
    writeKeyValue(doc, 'Support email', clinic?.supportEmail ?? clinic?.email);
    writeKeyValue(doc, 'Address', clinic?.address);
    writeMultilineBlock(doc, 'Business hours', clinic?.businessHours);
    writeMultilineBlock(doc, 'Locations', clinic?.locations);
    writeMultilineBlock(doc, 'Specialties', clinic?.specialties);
    writeMultilineBlock(doc, 'Description', clinic?.description);

    writeHeading(doc, 'Services');
    if (serviceList.length === 0) {
      doc.text('—');
    } else {
      for (const service of serviceList) {
        doc.font('Helvetica-Bold').text(service.serviceName || 'Untitled service');
        doc
          .font('Helvetica')
          .text(
            [
              service.category ? `Category: ${service.category}` : null,
              service.durationMinutes ? `Duration: ${service.durationMinutes} minutes` : null,
              service.price ? `Price: ${service.price}` : null,
              typeof service.isActive === 'boolean'
                ? `Active: ${service.isActive ? 'yes' : 'no'}`
                : null,
            ]
              .filter(Boolean)
              .join(' · ') || '—',
            { indent: 12 },
          );
        if (service.description) doc.text(`Description: ${service.description}`, { indent: 12 });
        doc.moveDown(0.3);
      }
    }

    writeHeading(doc, 'Booking Rules');
    if (!booking) {
      doc.text('—');
    } else {
      writeKeyValue(
        doc,
        'Default appointment duration (minutes)',
        booking.defaultAppointmentDurationMinutes,
      );
      writeKeyValue(
        doc,
        'Buffer between appointments (minutes)',
        booking.bufferBetweenAppointmentsMinutes,
      );
      writeKeyValue(doc, 'Min notice (hours)', booking.minNoticePeriodHours);
      writeKeyValue(doc, 'Cancellation cutoff (hours)', booking.cancellationCutoffHours);
      writeKeyValue(doc, 'Max advance booking (days)', booking.maxAdvanceBookingDays);
      writeMultilineBlock(doc, 'Operating schedule', booking.operatingSchedule);
      writeMultilineBlock(doc, 'Closed dates', booking.closedDates);
      writeKeyValue(doc, 'Double booking policy', booking.doubleBookingPolicy);
      writeMultilineBlock(doc, 'Emergency slot policy', booking.emergencySlotPolicy);
      writeMultilineBlock(doc, 'Reschedule limits', booking.rescheduleLimits);
      writeMultilineBlock(doc, 'After-hours policy', booking.afterHoursPolicy);
      writeKeyValue(doc, 'Validation state', booking.validationState);
    }

    writeHeading(doc, 'Policies & Escalation');
    if (!policy) {
      doc.text('—');
    } else {
      writeMultilineBlock(doc, 'Escalation conditions', policy.escalationConditions);
      writeMultilineBlock(doc, 'Emergency disclaimer', policy.emergencyDisclaimer);
    }

    writeHeading(doc, 'Voice Profile');
    if (!voice) {
      doc.text('—');
    } else {
      writeKeyValue(doc, 'Tone', voice.tone);
      writeKeyValue(doc, 'Voice ID', voice.voiceId);
      writeKeyValue(doc, 'Voice agent ID', voice.voiceAgentId);
      writeKeyValue(doc, 'Speaking speed', voice.speakingSpeed);
      writeMultilineBlock(doc, 'Greeting message', voice.greetingMessage);
      writeKeyValue(doc, 'Language', voice.language);
    }

    writeHeading(doc, 'FAQs');
    if (faqList.length === 0) {
      doc.text('—');
    } else {
      for (const faq of faqList) {
        doc.font('Helvetica-Bold').text(faq.question || 'Untitled FAQ');
        doc.font('Helvetica').text(faq.answer || '—', { indent: 12 });
        if (faq.category) {
          doc
            .font('Helvetica')
            .fillColor('#444444')
            .text(`Category: ${faq.category}`, { indent: 12 });
          doc.fillColor('#111111');
        }
        doc.moveDown(0.3);
      }
    }

    writeHeading(doc, 'Integrations');
    if (integrationList.length === 0) {
      doc.text('—');
    } else {
      for (const integration of integrationList) {
        doc.font('Helvetica-Bold').text(`${integration.integrationType} (${integration.provider})`);
        doc
          .font('Helvetica')
          .text(
            [
              integration.status ? `Status: ${integration.status}` : null,
              integration.healthStatus ? `Health: ${integration.healthStatus}` : null,
              integration.lastSyncAt ? `Last sync: ${integration.lastSyncAt.toISOString()}` : null,
            ]
              .filter(Boolean)
              .join(' · ') || '—',
            { indent: 12 },
          );
        writeMultilineBlock(doc, 'Config', integration.config);
        writeMultilineBlock(doc, 'Capabilities', integration.capabilities);
        doc.moveDown(0.3);
      }
    }

    writeHeading(doc, 'Saved Context Documents');
    if (contextDocuments.length === 0) {
      doc.text('—');
    } else {
      for (const [index, documentTopic] of contextDocuments.entries()) {
        const title =
          typeof documentTopic.title === 'string' && documentTopic.title.trim()
            ? documentTopic.title.trim()
            : `Document ${index + 1}`;
        const mimeType =
          typeof documentTopic.mimeType === 'string' ? documentTopic.mimeType : 'text/plain';
        const content = typeof documentTopic.content === 'string' ? documentTopic.content : '';
        doc.font('Helvetica-Bold').text(title);
        doc.font('Helvetica').fillColor('#444444').text(`MIME: ${mimeType}`, { indent: 12 });
        doc.fillColor('#111111');
        doc.font('Helvetica').text(content.trim() || '—', { indent: 12 });
        doc.moveDown(0.6);
      }
    }

    doc.end();
  } catch (err) {
    next(err);
  }
});
