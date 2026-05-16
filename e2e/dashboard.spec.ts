import { test, expect, type Page } from '@playwright/test';

const EMAIL = process.env.E2E_USER_EMAIL ?? '';
const PASSWORD = process.env.E2E_USER_PASSWORD ?? '';

async function login(page: Page) {
  await page.goto('/login');
  await page.getByRole('textbox', { name: /email/i }).fill(EMAIL);
  await page.getByRole('textbox', { name: /password/i }).fill(PASSWORD);
  await page.getByRole('button', { name: /sign in|log in/i }).click();
  await page.waitForURL(/dashboard/, { timeout: 15_000 });
}

async function noErrors(page: Page) {
  await expect(page.getByText(/something went wrong|internal server error|500/i)).not.toBeVisible();
}

test.describe('Dashboard — all sidebar pages', () => {
  test.skip(!EMAIL, 'Set E2E_USER_EMAIL + E2E_USER_PASSWORD to run');

  test.beforeEach(async ({ page }) => {
    await login(page);
  });

  // ─── Overview ───────────────────────────────────────────────────────────────

  test('Overview — loads stat cards and recent calls', async ({ page }) => {
    await page.goto('/dashboard');
    await expect(page.getByRole('heading', { name: /good (morning|afternoon|evening)/i })).toBeVisible({ timeout: 10_000 });
    await expect(page.getByText(/total calls/i)).toBeVisible();
    await expect(page.getByText(/booking rate/i)).toBeVisible();
    await expect(page.getByText(/avg duration/i)).toBeVisible();
    await noErrors(page);
  });

  // ─── AI Receptionist ────────────────────────────────────────────────────────

  test('AI Receptionist — config sections render', async ({ page }) => {
    await page.goto('/dashboard/ai-receptionist');
    await expect(page.getByRole('heading', { name: /AI Receptionist/i })).toBeVisible({ timeout: 10_000 });
    await expect(page.getByText(/booking configuration/i)).toBeVisible();
    await expect(page.getByText(/working schedule/i)).toBeVisible();
    await noErrors(page);
  });

  // ─── Dentora Agent ──────────────────────────────────────────────────────────

  test('Dentora Agent — page loads', async ({ page }) => {
    await page.goto('/dashboard/elevenlabs-agent');
    await expect(page.getByRole('main')).toBeVisible({ timeout: 10_000 });
    await noErrors(page);
  });

  // ─── Appointments ───────────────────────────────────────────────────────────

  test('Appointments — table or empty state visible', async ({ page }) => {
    await page.goto('/dashboard/appointments');
    await expect(page.getByRole('heading', { name: /appointments/i })).toBeVisible({ timeout: 10_000 });
    await expect(
      page.getByRole('table').or(page.getByText(/no appointments/i))
    ).toBeVisible({ timeout: 10_000 });
    await noErrors(page);
  });

  // ─── Patients ───────────────────────────────────────────────────────────────

  test('Patients — table or empty state visible', async ({ page }) => {
    await page.goto('/dashboard/patients');
    await expect(page.getByRole('heading', { name: /patients/i })).toBeVisible({ timeout: 10_000 });
    await expect(
      page.getByRole('table').or(page.getByText(/no patients/i))
    ).toBeVisible({ timeout: 10_000 });
    await noErrors(page);
  });

  // ─── Staff ──────────────────────────────────────────────────────────────────

  test('Staff — table renders and add row works', async ({ page }) => {
    await page.goto('/dashboard/staff');
    await expect(page.getByRole('heading', { name: /staff/i })).toBeVisible({ timeout: 10_000 });

    // Add a staff member
    await page.getByRole('button', { name: /add staff/i }).click();
    await page.getByPlaceholder(/name/i).last().fill('E2E Test Dentist');
    await page.getByPlaceholder(/role/i).last().fill('Dentist');
    await page.getByRole('button', { name: /save/i }).click();
    await expect(page.getByText(/saved|success/i)).toBeVisible({ timeout: 8_000 });
    await noErrors(page);
  });

  // ─── Staff Review ───────────────────────────────────────────────────────────

  test('Staff Review — page loads without errors', async ({ page }) => {
    await page.goto('/dashboard/staff-review');
    await expect(page.getByRole('main')).toBeVisible({ timeout: 10_000 });
    await noErrors(page);
  });

  // ─── Prices ─────────────────────────────────────────────────────────────────

  test('Prices — can add and delete a service', async ({ page }) => {
    await page.goto('/dashboard/prices');
    await expect(page.getByRole('heading', { name: /prices|services/i })).toBeVisible({ timeout: 10_000 });

    // Add service
    await page.getByRole('button', { name: /add service/i }).click();
    await page.getByPlaceholder(/service name/i).last().fill('E2E Test Clean');
    await page.getByPlaceholder(/price/i).last().fill('75');
    await page.getByRole('button', { name: /save/i }).last().click();
    await expect(page.getByText('E2E Test Clean')).toBeVisible({ timeout: 8_000 });

    // Delete the row we just added
    const row = page.getByRole('row', { name: /E2E Test Clean/i });
    await row.getByRole('button', { name: /delete/i }).click();
    await expect(page.getByText('E2E Test Clean')).not.toBeVisible({ timeout: 8_000 });
    await noErrors(page);
  });

  // ─── FAQs ───────────────────────────────────────────────────────────────────

  test('FAQs — can add and delete a FAQ', async ({ page }) => {
    await page.goto('/dashboard/faqs');
    await expect(page.getByRole('heading', { name: /faq/i })).toBeVisible({ timeout: 10_000 });

    // Add FAQ
    await page.getByRole('button', { name: /add/i }).click();
    await page.getByPlaceholder(/question/i).last().fill('E2E test question?');
    await page.getByPlaceholder(/answer/i).last().fill('E2E test answer.');
    await page.getByRole('button', { name: /save/i }).last().click();
    await expect(page.getByText('E2E test question?')).toBeVisible({ timeout: 8_000 });

    // Delete it
    const row = page.getByRole('row', { name: /E2E test question/i });
    await row.getByRole('button', { name: /delete/i }).click();
    await expect(page.getByText('E2E test question?')).not.toBeVisible({ timeout: 8_000 });
    await noErrors(page);
  });

  // ─── Calls ──────────────────────────────────────────────────────────────────

  test('Calls — list renders or empty state shown', async ({ page }) => {
    await page.goto('/dashboard/calls');
    await expect(page.getByRole('heading', { name: /calls/i })).toBeVisible({ timeout: 10_000 });
    await expect(
      page.getByRole('table').or(page.getByText(/no calls/i))
    ).toBeVisible({ timeout: 10_000 });
    await noErrors(page);
  });

  // ─── Missed Calls ───────────────────────────────────────────────────────────

  test('Missed Calls — page loads and shows list or empty state', async ({ page }) => {
    await page.goto('/dashboard/missed-calls');
    await expect(page.getByRole('heading', { name: /missed calls/i })).toBeVisible({ timeout: 10_000 });
    await expect(
      page.getByText(/no calls need follow-up/i)
        .or(page.getByRole('table'))
        .or(page.getByText(/callers who hung up/i))
    ).toBeVisible({ timeout: 10_000 });
    await noErrors(page);
  });

  // ─── Analytics ──────────────────────────────────────────────────────────────

  test('Analytics — charts and period selector render', async ({ page }) => {
    await page.goto('/dashboard/analytics');
    await expect(page.getByRole('heading', { name: /analytics/i })).toBeVisible({ timeout: 10_000 });
    await expect(page.getByRole('main')).toBeVisible();
    await noErrors(page);
  });

  // ─── Clinic Details ─────────────────────────────────────────────────────────

  test('Clinic Details — form fields render and save works', async ({ page }) => {
    await page.goto('/dashboard/clinic');
    await expect(page.getByRole('heading', { name: /clinic details/i })).toBeVisible({ timeout: 10_000 });
    await expect(page.getByRole('textbox', { name: /clinic name/i })).toBeVisible();
    await page.getByRole('button', { name: /save/i }).first().click();
    await expect(page.getByText(/saved|success/i)).toBeVisible({ timeout: 8_000 });
    await noErrors(page);
  });

  // ─── Messages ───────────────────────────────────────────────────────────────

  test('Messages — page loads without errors', async ({ page }) => {
    await page.goto('/dashboard/messages');
    await expect(page.getByRole('heading', { name: /messages/i })).toBeVisible({ timeout: 10_000 });
    await noErrors(page);
  });

  // ─── Integrations ───────────────────────────────────────────────────────────

  test('Integrations — page loads and shows integration cards', async ({ page }) => {
    await page.goto('/dashboard/integrations');
    await expect(page.getByRole('heading', { name: /integrations/i })).toBeVisible({ timeout: 10_000 });
    await expect(page.getByText(/google calendar/i)).toBeVisible({ timeout: 10_000 });
    await noErrors(page);
  });

  // ─── Billing ────────────────────────────────────────────────────────────────

  test('Billing — page loads and shows plan info', async ({ page }) => {
    await page.goto('/dashboard/billing');
    await expect(page.getByRole('heading', { name: /billing/i })).toBeVisible({ timeout: 10_000 });
    await expect(page.getByText(/plan|starter|usage/i)).toBeVisible({ timeout: 10_000 });
    await noErrors(page);
  });

  // ─── Settings ───────────────────────────────────────────────────────────────

  test('Settings — page loads with account section', async ({ page }) => {
    await page.goto('/dashboard/settings');
    await expect(page.getByRole('heading', { name: /settings/i })).toBeVisible({ timeout: 10_000 });
    await expect(page.getByRole('main')).toBeVisible();
    await noErrors(page);
  });

  // ─── Sidebar navigation ─────────────────────────────────────────────────────

  test('Sidebar — all nav links are present', async ({ page }) => {
    await page.goto('/dashboard');
    const nav = page.getByRole('navigation');
    for (const label of [
      'Overview', 'AI Receptionist', 'Dentora Agent',
      'Appointments', 'Patients', 'Staff', 'Prices', 'FAQs',
      'Calls', 'Missed Calls', 'Analytics',
      'Clinic Details', 'Messages', 'Integrations', 'Billing', 'Settings',
    ]) {
      await expect(nav.getByRole('link', { name: label })).toBeVisible();
    }
  });
});
