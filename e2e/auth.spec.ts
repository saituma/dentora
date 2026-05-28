import { test, expect } from '@playwright/test';

// The submit button in login-form.tsx says "Sign in with password"
const SUBMIT_BTN = page => page.getByRole('button', { name: /sign in with password/i });

test.describe('Authentication', () => {
  test('login page renders and has required fields', async ({ page }) => {
    await page.goto('/login');
    await expect(page.getByRole('textbox', { name: /email/i })).toBeVisible();
    await expect(page.getByRole('textbox', { name: /password/i })).toBeVisible();
    await expect(SUBMIT_BTN(page)).toBeVisible();
  });

  test('shows validation error for empty submission', async ({ page }) => {
    await page.goto('/login');
    // HTML5 required on email/password — browser blocks submit; email field gets focus
    await SUBMIT_BTN(page).click();
    await expect(page.getByLabel(/email/i)).toBeFocused();
  });

  test('shows error toast for invalid credentials', async ({ page }) => {
    await page.goto('/login');
    await page.getByLabel(/email address/i).fill('notreal@example.com');
    await page.getByLabel(/^password$/i).fill('wrongpassword');
    await SUBMIT_BTN(page).click();
    await expect(page.getByText(/invalid|incorrect|wrong|error|credentials/i)).toBeVisible({ timeout: 8_000 });
  });

  test('redirects unauthenticated users from /dashboard to /login', async ({ page }) => {
    await page.goto('/dashboard');
    await expect(page).toHaveURL(/login/, { timeout: 8_000 });
  });
});
