import { test, expect } from '@playwright/test';

test.describe('Authentication', () => {
  test('login page renders and has required fields', async ({ page }) => {
    await page.goto('/login');
    await expect(page).toHaveTitle(/Dentora|Login|Sign in/i);
    await expect(page.getByRole('textbox', { name: /email/i })).toBeVisible();
    await expect(page.getByRole('textbox', { name: /password/i })).toBeVisible();
    await expect(page.getByRole('button', { name: /sign in|log in/i })).toBeVisible();
  });

  test('shows validation errors for empty submission', async ({ page }) => {
    await page.goto('/login');
    await page.getByRole('button', { name: /sign in|log in/i }).click();
    // Expect some form of error — either HTML5 validation or custom messages
    const emailField = page.getByRole('textbox', { name: /email/i });
    await expect(emailField).toBeFocused().or(expect(page.getByText(/required|invalid/i)).toBeVisible());
  });

  test('shows error for invalid credentials', async ({ page }) => {
    await page.goto('/login');
    await page.getByRole('textbox', { name: /email/i }).fill('notreal@example.com');
    await page.getByRole('textbox', { name: /password/i }).fill('wrongpassword');
    await page.getByRole('button', { name: /sign in|log in/i }).click();
    await expect(page.getByText(/invalid|incorrect|wrong|error/i)).toBeVisible({ timeout: 8000 });
  });

  test('redirects unauthenticated users from /dashboard to login', async ({ page }) => {
    await page.goto('/dashboard');
    await expect(page).toHaveURL(/login/);
  });
});
