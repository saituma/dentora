/**
 * "Test our AI Agent" demo-request submission.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 *  BACKEND INTEGRATION (for whoever wires up the server + admin):
 *
 *  Endpoint to implement:  POST {API_BASE_URL}/demo-requests
 *  Auth:                   public (no auth) — it's a marketing lead form.
 *                          Recommend a rate-limit (e.g. 5/min/IP) + simple
 *                          spam guard, since it's unauthenticated.
 *  Request body (JSON):    DemoRequestPayload  (see type below)
 *  Success response:       201 { id: string, createdAt: string }
 *
 *  Suggested persistence:  a new `demo_requests` table, e.g.
 *      id           uuid pk default gen_random_uuid()
 *      full_name    text not null
 *      email        text not null
 *      phone_e164   text not null        -- e.g. +447700900123
 *      phone_country text not null       -- ISO alpha-2, e.g. GB
 *      message      text not null        -- why they want to test / about them
 *      source       text not null        -- 'landing_test_agent'
 *      created_at   timestamptz not null default now()
 *
 *  Admin dashboard:        list these on a new "Demo Requests" / "Leads" page
 *                          (apps/admin) — newest first, with name, email,
 *                          clickable tel: phone, message, and submitted-at.
 *
 *  NOTE: This is FRONTEND ONLY for now. Until the endpoint exists the POST
 *  will 404 — that is handled gracefully (`submitDemoRequest` never throws),
 *  so the demo still reveals the agent number. Once the endpoint is live the
 *  same payload starts landing in the DB with no frontend change required.
 * ─────────────────────────────────────────────────────────────────────────────
 */
import { API_BASE_URL } from '@/lib/api';

export interface DemoRequestPayload {
  /** Visitor's full name. */
  fullName: string;
  /** Visitor's email address. */
  email: string;
  /** Full phone number in E.164 format, e.g. "+447700900123". */
  phoneE164: string;
  /** ISO 3166-1 alpha-2 country of the phone number, e.g. "GB". */
  phoneCountry: string;
  /** Why they want to test / a bit about them (free text). */
  message: string;
  /** Where the request originated — useful for attribution in admin. */
  source: 'landing_test_agent';
}

export interface DemoRequestResponse {
  id: string;
  createdAt: string;
}

export interface SubmitResult {
  /** True if the server persisted the request. False if the endpoint isn't live yet. */
  persisted: boolean;
}

/**
 * Submits a demo request. Resolves successfully even if the backend endpoint is
 * not implemented yet, so the demo experience never breaks for the visitor.
 * `result.persisted` tells the caller whether the server actually stored it.
 */
export async function submitDemoRequest(payload: DemoRequestPayload): Promise<SubmitResult> {
  try {
    const res = await fetch(`${API_BASE_URL}/demo-requests`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
    return { persisted: res.ok };
  } catch {
    // Network error / endpoint not deployed — fail soft; the demo still proceeds.
    return { persisted: false };
  }
}
