import { expect, test } from './journey';

const PLATFORM_ADMIN = { email: 'owner-a@test.local', password: 'records-journey-owner-a' };
const ORDINARY_USER = { email: 'viewer-a@test.local', password: 'records-journey-viewer-a' };

async function signIn(page: import('@playwright/test').Page, credentials: typeof PLATFORM_ADMIN) {
  await page.goto('/settings');
  await page.getByLabel(/email/i).fill(credentials.email);
  await page.getByLabel(/password/i).fill(credentials.password);
  await page.getByRole('button', { name: /sign in/i }).click();
}

test.describe('generated platform administration surface', () => {
  test('a platform administrator reaches the real generated admin consumer', async ({ page }) => {
    await signIn(page, PLATFORM_ADMIN);
    await expect(page.getByRole('heading', { name: 'Administration', exact: true })).toBeVisible({ timeout: 20_000 });
    await expect(page.getByRole('heading', { name: 'Platform administration' })).toBeVisible();
    await expect(page.locator('[data-admin-access="granted"]')).toContainText('platform administrator access');
    await expect(page.locator('[data-admin-access="denied"]')).toHaveCount(0);
  });

  test('an ordinary signed-in user sees the boundary rather than privileged content', async ({ page }) => {
    await signIn(page, ORDINARY_USER);
    await expect(page.getByRole('heading', { name: 'Administration', exact: true })).toBeVisible({ timeout: 20_000 });
    await expect(page.locator('[data-admin-access="denied"]')).toContainText('Administrator access required');
    await expect(page.locator('[data-admin-access="granted"]')).toHaveCount(0);
  });
});
