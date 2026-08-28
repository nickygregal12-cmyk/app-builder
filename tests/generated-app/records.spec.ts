import { expect, test } from '@playwright/test';

/**
 * The tenant-records journey, driven through the generated application's own
 * interface against a real Supabase stack.
 *
 * This is the half the pgTAP suite cannot do. `tooling/supabase-rls-acceptance.sql`
 * proves the security boundary holds against a database; this proves a person
 * can actually use the product that sits on it, and that what the policies
 * decided is what reaches the screen.
 *
 * The two are deliberately not redundant. Cross-tenant attacks are tested in
 * SQL, where they can be attempted directly; attempting them here would mean
 * building interface controls that do not and should not exist, and a test that
 * has to invent a button to press is testing its own scaffolding. What the
 * browser proves is the honest version of the same question: signed in as
 * organisation A, is organisation B's record anywhere on the page?
 */

const OWNER_A = { email: 'owner-a@test.local', password: 'records-journey-owner-a' };
const VIEWER_A = { email: 'viewer-a@test.local', password: 'records-journey-viewer-a' };

async function signIn(page: import('@playwright/test').Page, credentials: { email: string; password: string }) {
  await page.goto('/workspace');
  // The auth gate renders in place of the application until a session exists.
  await page.getByLabel(/email/i).fill(credentials.email);
  await page.getByLabel(/password/i).fill(credentials.password);
  await page.getByRole('button', { name: /sign in/i }).click();
  await expect(page.getByText(/Records for/i)).toBeVisible({ timeout: 20_000 });
}

test.describe('organisation-owned records', () => {
  test('a contributor can see, create, edit and persist their organisation records', async ({ page }) => {
    await signIn(page, OWNER_A);

    // 1. The organisation is named, and it is the right one.
    await expect(page.getByText('Records for')).toContainText('Organisation A');

    // 2. The seeded organisation A record is present.
    const seeded = page.locator('[data-record-reference="REC-A1"]');
    await expect(seeded).toBeVisible();
    await expect(seeded).toContainText('Organisation A first record');

    // 3. Organisation B's record is not. This is the isolation the policies
    //    enforce, observed from the place a person would actually see it.
    await expect(page.locator('[data-record-reference="REC-B1"]')).toHaveCount(0);
    await expect(page.getByText('Organisation B confidential record')).toHaveCount(0);

    // 4. Create a record of their own.
    const reference = `REC-JOURNEY-${Date.now()}`;
    await page.getByLabel(/reference/i).first().fill(reference);
    await page.getByLabel(/title/i).first().fill('Created by the browser journey');
    await page.getByLabel(/summary/i).first().fill('Written through the generated interface.');
    await page.getByRole('button', { name: /add record/i }).click();

    // 5. It appears in the real interface, from the row the database returned.
    const created = page.locator(`[data-record-reference="${reference}"]`);
    await expect(created).toBeVisible({ timeout: 20_000 });
    await expect(created).toContainText('Created by the browser journey');

    // 6. Edit it.
    await created.getByRole('button', { name: /^edit$/i }).click();
    await created.getByLabel(/title/i).fill('Edited by the browser journey');
    await created.getByRole('button', { name: /save changes/i }).click();
    await expect(created).toContainText('Edited by the browser journey');

    // 7. Persistence, proved by leaving and coming back rather than by trusting
    //    what React is holding in memory.
    await page.reload();
    await expect(page.getByText(/Records for/i)).toBeVisible({ timeout: 20_000 });
    const afterReload = page.locator(`[data-record-reference="${reference}"]`);
    await expect(afterReload).toBeVisible();
    await expect(afterReload).toContainText('Edited by the browser journey');

    // 8. The privileged operation, which this role holds.
    await afterReload.getByRole('button', { name: /^archive$/i }).click();
    await expect(afterReload).toHaveAttribute('data-record-status', 'archived', { timeout: 20_000 });

    // And it survives a reload too, because it was a database write and not a
    // local state change.
    await page.reload();
    await expect(page.locator(`[data-record-reference="${reference}"]`)).toHaveAttribute('data-record-status', 'archived', { timeout: 20_000 });
  });

  test('a viewer is not offered the actions their role cannot perform', async ({ page }) => {
    await signIn(page, VIEWER_A);

    // A viewer reads. The record is there.
    await expect(page.locator('[data-record-reference="REC-A1"]')).toBeVisible();

    // And the controls for what they cannot do are absent rather than present
    // and failing. The refusal itself lives in the policies and is proved in
    // SQL; what is proved here is that the interface agrees with them instead
    // of offering an action the database is going to reject.
    await expect(page.getByRole('button', { name: /add record/i })).toHaveCount(0);
    await expect(page.getByRole('button', { name: /^edit$/i })).toHaveCount(0);
    await expect(page.getByRole('button', { name: /^archive$/i })).toHaveCount(0);
    await expect(page.getByRole('button', { name: /^delete$/i })).toHaveCount(0);
    await expect(page.getByText(/can view records but not change them/i)).toBeVisible();

    // Still organisation A, and still not organisation B.
    await expect(page.locator('[data-record-reference="REC-B1"]')).toHaveCount(0);
  });
});
