import 'dotenv/config';

import { createHmac, randomUUID } from 'node:crypto';
import express, { type Request, type Response, type NextFunction } from 'express';

type JsonRecord = Record<string, unknown>;

interface Patient {
  id: string;
  first_name?: string;
  last_name?: string;
  preferred_name?: string;
  full_name: string;
  mobile_phone?: string;
  home_phone?: string;
  date_of_birth?: string;
  metadata?: Record<string, string>;
  updated_at: string;
}

interface Appointment {
  id: string;
  patient_id: string;
  practitioner_id?: string;
  room_id?: string;
  site_id?: string;
  start_time: string;
  finish_time: string;
  duration: number;
  state: string;
  cancelled: boolean;
  notes?: string;
  reason?: string;
  patient?: Patient;
  updated_at: string;
}

interface SimulatorState {
  patients: Patient[];
  appointments: Appointment[];
  webhookDeliveries: JsonRecord[];
  requestCounts: Map<string, { count: number; resetAt: number }>;
}

const app = express();
const state: SimulatorState = {
  patients: [],
  appointments: [],
  webhookDeliveries: [],
  requestCounts: new Map(),
};

const practitioners = [
  {
    id: 'practitioner-1',
    name: 'Dr Anika Patel',
    first_name: 'Anika',
    last_name: 'Patel',
    active: true,
  },
  {
    id: 'practitioner-2',
    name: 'Dr Marcus Green',
    first_name: 'Marcus',
    last_name: 'Green',
    active: true,
  },
];

const rooms = [
  { id: 'room-1', name: 'Surgery 1', active: true },
  { id: 'room-2', name: 'Surgery 2', active: true },
];

const appointmentReasons = [
  { id: 'reason-1', name: 'Dental examination', duration: 30, deleted: false },
  { id: 'reason-2', name: 'Hygiene appointment', duration: 30, deleted: false },
  { id: 'reason-3', name: 'Archived reason', duration: 30, deleted: true },
];

const PORT = Number(process.env.DENTALLY_SIMULATOR_PORT || 4117);
const RATE_LIMIT_PER_MINUTE = Number(process.env.DENTALLY_SIM_RATE_LIMIT_PER_MINUTE || 120);
const WEBHOOK_URL = process.env.DENTALLY_SIM_WEBHOOK_URL;
const WEBHOOK_SECRET = process.env.DENTALLY_SIM_WEBHOOK_SECRET || 'dentally-simulator-secret';
const OAUTH_SCOPES =
  process.env.DENTALLY_SIM_OAUTH_SCOPES ||
  [
    'appointment:read',
    'appointment:create',
    'appointment:update',
    'patient:read',
    'patient:create',
    'patient:update',
    'practice:read',
    'user:read',
  ].join(' ');

function nowIso(): string {
  return new Date().toISOString();
}

function errorResponse(res: Response, status: number, message: string, details?: JsonRecord): void {
  res.status(status).json({
    error: {
      message,
      ...(details ? { details } : {}),
    },
  });
}

function requireHeaders(req: Request, res: Response, next: NextFunction): void {
  if (!req.headers.authorization?.startsWith('Bearer ')) {
    errorResponse(res, 401, 'Authorization bearer token is required');
    return;
  }
  if (!req.headers['user-agent'] || String(req.headers['user-agent']).trim().length < 3) {
    errorResponse(res, 400, 'Valid User-Agent header is required');
    return;
  }
  next();
}

function rateLimit(req: Request, res: Response, next: NextFunction): void {
  const key = req.ip || 'local';
  const now = Date.now();
  const current = state.requestCounts.get(key);
  const bucket = current && current.resetAt > now ? current : { count: 0, resetAt: now + 60_000 };
  bucket.count += 1;
  state.requestCounts.set(key, bucket);

  const remaining = Math.max(0, RATE_LIMIT_PER_MINUTE - bucket.count);
  res.setHeader('x-ratelimit-limit', String(RATE_LIMIT_PER_MINUTE));
  res.setHeader('x-ratelimit-remaining', String(remaining));
  res.setHeader('x-ratelimit-reset', String(Math.ceil(bucket.resetAt / 1000)));

  if (bucket.count > RATE_LIMIT_PER_MINUTE) {
    res.setHeader('retry-after', String(Math.ceil((bucket.resetAt - now) / 1000)));
    errorResponse(res, 429, 'Rate limit exceeded');
    return;
  }
  next();
}

function objectBody(value: unknown): JsonRecord | null {
  return value && typeof value === 'object' && !Array.isArray(value) ? (value as JsonRecord) : null;
}

function stringValue(value: unknown): string | undefined {
  return typeof value === 'string' && value.trim() ? value.trim() : undefined;
}

function id(prefix: string): string {
  return `${prefix}-${randomUUID()}`;
}

function validIso(value: unknown): value is string {
  return typeof value === 'string' && Number.isFinite(new Date(value).getTime());
}

function metadataFrom(value: unknown): Record<string, string> | undefined {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return undefined;
  const entries = Object.entries(value as JsonRecord);
  if (entries.length > 3) {
    throw new Error('Metadata supports at most 3 keys');
  }
  const metadata: Record<string, string> = {};
  for (const [key, rawValue] of entries) {
    if (key.length > 40) throw new Error('Metadata keys must be 40 characters or fewer');
    const value = typeof rawValue === 'string' ? rawValue : JSON.stringify(rawValue);
    if (value.length > 500) throw new Error('Metadata values must be 500 characters or fewer');
    metadata[key] = value;
  }
  return metadata;
}

function patientPayload(body: unknown): JsonRecord | null {
  const record = objectBody(body);
  return objectBody(record?.patient);
}

function appointmentPayload(body: unknown): JsonRecord | null {
  const record = objectBody(body);
  return objectBody(record?.appointment);
}

function patientName(patient: Patient): string {
  const parts = [patient.first_name, patient.last_name].filter(Boolean);
  return patient.preferred_name || (parts.length > 0 ? parts.join(' ') : patient.full_name);
}

function withPatient(appointment: Appointment): Appointment {
  const patient = state.patients.find((item) => item.id === appointment.patient_id);
  return patient ? { ...appointment, patient } : appointment;
}

function toArrayParam(value: unknown): string[] {
  if (Array.isArray(value)) return value.map(String).filter(Boolean);
  if (typeof value === 'string') return [value].filter(Boolean);
  return [];
}

function minutesBetween(startIso: string, finishIso: string): number {
  return Math.round((new Date(finishIso).getTime() - new Date(startIso).getTime()) / 60_000);
}

async function emitWebhook(eventType: string, data: JsonRecord): Promise<void> {
  const payload = {
    event_type: eventType,
    event_id: id('event'),
    data,
  };
  const rawBody = JSON.stringify(payload);
  const timestamp = String(Math.floor(Date.now() / 1000));
  const signature = createHmac('sha256', WEBHOOK_SECRET).update(rawBody).digest('hex');
  state.webhookDeliveries.push({
    eventType,
    payload,
    timestamp,
    signature,
    targetUrl: WEBHOOK_URL ?? null,
  });

  if (!WEBHOOK_URL) return;
  try {
    await fetch(WEBHOOK_URL, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'user-agent': 'Dentally-Sandbox-Simulator/1.0',
        'x-dentally-signature': signature,
        'x-dentally-timestamp': timestamp,
      },
      body: rawBody,
    });
  } catch {
    // The simulator records the attempted delivery; failed local webhook targets should not
    // make the Dentally API mutation fail.
  }
}

function seed(): void {
  const createdAt = nowIso();
  const patient: Patient = {
    id: 'patient-1',
    first_name: 'Jane',
    last_name: 'Secret',
    preferred_name: 'Jane Secret',
    full_name: 'Jane Secret',
    mobile_phone: '+15551234567',
    home_phone: '+15551234567',
    date_of_birth: '1985-01-02',
    updated_at: createdAt,
  };
  state.patients.push(patient);
  state.appointments.push({
    id: 'appointment-1',
    patient_id: patient.id,
    practitioner_id: 'practitioner-1',
    room_id: 'room-1',
    site_id: 'site-1',
    start_time: '2026-06-01T09:00:00.000Z',
    finish_time: '2026-06-01T09:30:00.000Z',
    duration: 30,
    state: 'Booked',
    cancelled: false,
    reason: 'Dental examination',
    notes: 'Seeded simulator appointment',
    updated_at: createdAt,
  });
}

app.use(express.json({ limit: '1mb' }));
app.use(rateLimit);

app.get('/simulator/health', (_req, res) => {
  res.json({ status: 'ok', service: 'dentally-sandbox-simulator', timestamp: nowIso() });
});

app.get('/simulator/webhook-deliveries', (_req, res) => {
  res.json({ webhook_deliveries: state.webhookDeliveries });
});

app.post('/simulator/webhooks/:eventType', async (req, res) => {
  await emitWebhook(req.params.eventType, objectBody(req.body) ?? { id: id('manual') });
  res.status(202).json({ accepted: true });
});

app.use('/v1', requireHeaders);

app.get('/v1/user', (_req, res) => {
  res.setHeader('x-oauth-scopes', OAUTH_SCOPES);
  res.json({
    user: {
      id: 'sim-user-1',
      name: 'Dentally Simulator User',
    },
  });
});

app.get('/v1/patients', (req, res) => {
  const query = String(req.query.query ?? '').toLowerCase();
  const patients = query
    ? state.patients.filter((patient) =>
        [
          patient.full_name,
          patientName(patient),
          patient.mobile_phone,
          patient.home_phone,
          patient.date_of_birth,
        ]
          .filter(Boolean)
          .some((value) => String(value).toLowerCase().includes(query)),
      )
    : state.patients;
  res.json({ patients });
});

app.post('/v1/patients', async (req, res) => {
  const payload = patientPayload(req.body);
  if (!payload) {
    errorResponse(res, 422, 'Request body must be wrapped in { patient: {...} }');
    return;
  }

  let metadata: Record<string, string> | undefined;
  try {
    metadata = metadataFrom(payload.metadata);
  } catch (error) {
    errorResponse(res, 422, error instanceof Error ? error.message : 'Invalid metadata');
    return;
  }

  const firstName = stringValue(payload.first_name);
  const lastName = stringValue(payload.last_name);
  const preferredName = stringValue(payload.preferred_name);
  const fullName = preferredName || [firstName, lastName].filter(Boolean).join(' ');
  if (!fullName) {
    errorResponse(res, 422, 'Patient name is required');
    return;
  }

  const patient: Patient = {
    id: id('patient'),
    first_name: firstName,
    last_name: lastName,
    preferred_name: preferredName,
    full_name: fullName,
    mobile_phone: stringValue(payload.mobile_phone),
    home_phone: stringValue(payload.home_phone),
    date_of_birth: stringValue(payload.date_of_birth),
    metadata,
    updated_at: nowIso(),
  };
  state.patients.push(patient);
  res.status(201).json({ patient });
});

app.patch('/v1/patients/:id', (req, res) => {
  const patient = state.patients.find((item) => item.id === req.params.id);
  if (!patient) {
    errorResponse(res, 404, 'Patient not found');
    return;
  }
  const payload = patientPayload(req.body);
  if (!payload) {
    errorResponse(res, 422, 'Request body must be wrapped in { patient: {...} }');
    return;
  }
  try {
    const metadata = metadataFrom(payload.metadata);
    Object.assign(patient, {
      ...payload,
      ...(metadata ? { metadata } : {}),
      updated_at: nowIso(),
    });
  } catch (error) {
    errorResponse(res, 422, error instanceof Error ? error.message : 'Invalid metadata');
    return;
  }
  res.json({ patient });
});

app.get('/v1/appointments/availability', (req, res) => {
  const startTime = String(req.query.start_time ?? '');
  const finishTime = String(req.query.finish_time ?? '');
  const practitionerIds = toArrayParam(req.query['practitioner_ids[]']);
  const duration = Number(req.query.duration);
  if (!validIso(startTime) || !validIso(finishTime) || practitionerIds.length === 0 || !duration) {
    errorResponse(
      res,
      422,
      'start_time, finish_time, practitioner_ids[], and duration are required',
    );
    return;
  }

  const slots: JsonRecord[] = [];
  for (const practitionerId of practitionerIds) {
    for (
      let cursor = new Date(startTime).getTime();
      cursor + duration * 60_000 <= new Date(finishTime).getTime() && slots.length < 25;
      cursor += duration * 60_000
    ) {
      const slotStart = new Date(cursor).toISOString();
      const slotEnd = new Date(cursor + duration * 60_000).toISOString();
      const busy = state.appointments.some(
        (appointment) =>
          !appointment.cancelled &&
          appointment.practitioner_id === practitionerId &&
          new Date(slotStart).getTime() < new Date(appointment.finish_time).getTime() &&
          new Date(slotEnd).getTime() > new Date(appointment.start_time).getTime(),
      );
      if (!busy) {
        slots.push({
          start_time: slotStart,
          finish_time: slotEnd,
          practitioner_id: practitionerId,
          room_id: rooms[0]?.id,
        });
      }
    }
  }
  res.json({ availability: slots });
});

app.get('/v1/appointments', (req, res) => {
  let appointments = state.appointments.map(withPatient);
  const filters = {
    practitioner_id: stringValue(req.query.practitioner_id),
    patient_id: stringValue(req.query.patient_id),
    room_id: stringValue(req.query.room_id),
    site_id: stringValue(req.query.site_id),
    state: stringValue(req.query.state),
  };
  for (const [key, value] of Object.entries(filters)) {
    if (value)
      appointments = appointments.filter(
        (item) => String(item[key as keyof Appointment]) === value,
      );
  }
  if (req.query.cancelled !== undefined) {
    const cancelled = String(req.query.cancelled) === 'true';
    appointments = appointments.filter((item) => item.cancelled === cancelled);
  }
  if (req.query.on) {
    const on = String(req.query.on);
    appointments = appointments.filter((item) => item.start_time.startsWith(on));
  }
  if (req.query.after && validIso(req.query.after)) {
    appointments = appointments.filter(
      (item) => new Date(item.start_time).getTime() >= new Date(String(req.query.after)).getTime(),
    );
  }
  if (req.query.before && validIso(req.query.before)) {
    appointments = appointments.filter(
      (item) => new Date(item.start_time).getTime() <= new Date(String(req.query.before)).getTime(),
    );
  }
  res.json({ appointments });
});

app.post('/v1/appointments', async (req, res) => {
  const payload = appointmentPayload(req.body);
  if (!payload) {
    errorResponse(res, 422, 'Request body must be wrapped in { appointment: {...} }');
    return;
  }
  if (!payload.patient_id || !validIso(payload.start_time) || !validIso(payload.finish_time)) {
    errorResponse(res, 422, 'patient_id, start_time, and finish_time are required');
    return;
  }
  const patient = state.patients.find((item) => item.id === String(payload.patient_id));
  if (!patient) {
    errorResponse(res, 422, 'patient_id does not reference an existing patient');
    return;
  }
  const appointment: Appointment = {
    id: id('appointment'),
    patient_id: String(payload.patient_id),
    practitioner_id: stringValue(payload.practitioner_id) || practitioners[0]?.id,
    room_id: stringValue(payload.room_id) || rooms[0]?.id,
    site_id: stringValue(payload.site_id) || 'site-1',
    start_time: String(payload.start_time),
    finish_time: String(payload.finish_time),
    duration: minutesBetween(String(payload.start_time), String(payload.finish_time)),
    state: stringValue(payload.state) || 'Booked',
    cancelled: false,
    notes: stringValue(payload.notes),
    reason: stringValue(payload.reason),
    updated_at: nowIso(),
  };
  state.appointments.push(appointment);
  await emitWebhook('appointment.created', withPatient(appointment) as unknown as JsonRecord);
  res.status(201).json({ appointment: withPatient(appointment) });
});

app.patch('/v1/appointments/:id', updateAppointment);
app.put('/v1/appointments/:id', updateAppointment);

async function updateAppointment(req: Request, res: Response): Promise<void> {
  const appointment = state.appointments.find((item) => item.id === req.params.id);
  if (!appointment) {
    errorResponse(res, 404, 'Appointment not found');
    return;
  }
  const payload = appointmentPayload(req.body);
  if (!payload) {
    errorResponse(res, 422, 'Request body must be wrapped in { appointment: {...} }');
    return;
  }
  if (payload.start_time !== undefined && !validIso(payload.start_time)) {
    errorResponse(res, 422, 'start_time must be a valid ISO timestamp');
    return;
  }
  if (payload.finish_time !== undefined && !validIso(payload.finish_time)) {
    errorResponse(res, 422, 'finish_time must be a valid ISO timestamp');
    return;
  }
  Object.assign(appointment, payload, { updated_at: nowIso() });
  if (payload.state === 'Cancelled') {
    appointment.cancelled = true;
  }
  if (appointment.start_time && appointment.finish_time) {
    appointment.duration = minutesBetween(appointment.start_time, appointment.finish_time);
  }
  await emitWebhook(
    appointment.cancelled ? 'appointment.cancelled' : 'appointment.updated',
    withPatient(appointment) as unknown as JsonRecord,
  );
  res.json({ appointment: withPatient(appointment) });
}

app.delete('/v1/appointments/:id', (_req, res) => {
  errorResponse(res, 405, 'Dentally appointments are cancelled by updating state to Cancelled');
});

app.get('/v1/appointment_reasons', (req, res) => {
  const deleted = String(req.query.deleted ?? 'false') === 'true';
  res.json({
    appointment_reasons: appointmentReasons.filter((reason) => reason.deleted === deleted),
  });
});

app.get('/v1/practitioners', (_req, res) => {
  res.json({ practitioners });
});

app.get('/v1/rooms', (_req, res) => {
  res.json({ rooms });
});

app.use((_req, res) => {
  errorResponse(res, 404, 'Dentally simulator endpoint not found');
});

if (process.env.NODE_ENV !== 'test' && process.env.VITEST !== 'true') {
  seed();
  app.listen(PORT, () => {
    console.warn(`Dentally sandbox simulator listening on http://localhost:${PORT}`);
    console.warn(`Point verification at DENTALLY_BASE_URL=http://localhost:${PORT}`);
  });
}

export {
  app as dentallySandboxSimulatorApp,
  state as dentallySandboxSimulatorState,
  seed as seedDentallySandboxSimulator,
};
