import { test, expect } from '@playwright/test';

// Helper: log in before each test that needs an authenticated session.
// Set E2E_USER_EMAIL / E2E_USER_PASSWORD in your .env.test for real credentials.
async function loginAs(page: Parameters<typeof test>[1]['page'], email: string, password: string) {
  await page.goto('/login');
  await page.getByRole('textbox', { name: /email/i }).fill(email);
  await page.getByRole('textbox', { name: /password/i }).fill(password);
  await page.getByRole('button', { name: /sign in|log in/i }).click();
  await page.waitForURL(/dashboard/, { timeout: 10_000 });
}

const testEmail = process.env.E2E_USER_EMAIL ?? '';
const testPassword = process.env.E2E_USER_PASSWORD ?? '';

test.describe('Dashboard', () => {
  test.skip(!testEmail, 'Set E2E_USER_EMAIL + E2E_USER_PASSWORD to run dashboard tests');

  test.beforeEach(async ({ page }) => {
    await loginAs(page, testEmail, testPassword);
  });

  test('dashboard loads with key sections visible', async ({ page }) => {
    await expect(page).toHaveURL(/dashboard/);
    // Sidebar navigation
    await expect(page.getByRole('navigation')).toBeVisible();
    // At least one stat card or chart
    await expect(page.locator('[data-testid="stat-card"], .card, main').first()).toBeVisible();
  });

  test('calls page loads without errors', async ({ page }) => {
    await page.goto('/dashboard/calls');
    await expect(page).toHaveURL(/calls/);
    await expect(page.getByRole('main')).toBeVisible();
    // No error boundary or 500 message
    await expect(page.getByText(/something went wrong|internal server error/i)).not.toBeVisible();
  });

  test('appointments page loads', async ({ page }) => {
    await page.goto('/dashboard/appointments');
    await expect(page).toHaveURL(/appointments/);
    await expect(page.getByRole('main')).toBeVisible();
  });

  test('settings page loads', async ({ page }) => {
    await page.goto('/dashboard/settings');
    await expect(page).toHaveURL(/settings/);
    await expect(page.getByRole('main')).toBeVisible();
  });
});
