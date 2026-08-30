import { type Page } from '@playwright/test';
import { expect, test } from './journey';

/**
 * Organisation-owned files, driven through the generated application against a
 * real Supabase Storage service.
 *
 * The storage policies are proved in SQL, where a cross-tenant write can be
 * attempted directly. What this proves is the half SQL cannot reach: that the
 * Storage HTTP API accepts an authorised upload, that the object survives a
 * reload because it is in storage rather than in React state, that a signed URL
 * returns the bytes, and that a removal persists.
 *
 * The cross-tenant assertion here is the honest browser-shaped one. Organisation
 * B genuinely owns a file — the seed uploads it with the service key — and the
 * question is whether organisation A ever sees it. Attempting a forged fetch
 * from this page would be testing a control the product does not have; that
 * attempt belongs in the SQL suite, and it is there.
 */

const OWNER_A = { email: 'owner-a@test.local', password: 'records-journey-owner-a' };
const VIEWER_A = { email: 'viewer-a@test.local', password: 'records-journey-viewer-a' };

/** Deterministic, tiny, synthetic. Nothing real and nothing committed. */
const FIXTURE = {
  name: 'organisation-a-note.txt',
  mimeType: 'text/plain',
  buffer: Buffer.from('Organisation A note, uploaded by the generated application journey.\n'),
};

async function signIn(page: Page, credentials: { email: string; password: string }) {
  await page.goto('/workspace');
  await page.getByLabel(/email/i).fill(credentials.email);
  await page.getByLabel(/password/i).fill(credentials.password);
  await page.getByRole('button', { name: /sign in/i }).click();
  await expect(page.getByText(/Files for/i)).toBeVisible({ timeout: 30_000 });
}

test.describe('organisation-owned files', () => {
  test('a contributor uploads a file that persists, opens and can be removed', async ({ page }) => {
    await signIn(page, OWNER_A);

    // The organisation is named, and it is the right one.
    await expect(page.getByText('Files for')).toContainText('Organisation A');

    // Organisation B owns a file. It must not be here.
    await expect(page.getByText('organisation-b-confidential.txt')).toHaveCount(0);

    // --- Upload -------------------------------------------------------------
    await page.setInputFiles('#organisation-file-input', FIXTURE);
    const uploaded = page.locator(`[data-file-name="${FIXTURE.name}"]`);
    await expect(uploaded).toBeVisible({ timeout: 30_000 });
    await expect(page.getByText(`${FIXTURE.name} uploaded.`)).toBeVisible();

    // The product shows a filename and a size, not a bucket or an object key.
    await expect(uploaded).toContainText(FIXTURE.name);
    await expect(uploaded).toContainText(/B|KB/);
    await expect(uploaded).not.toContainText('organisation-files');
    await expect(uploaded).not.toContainText(/[0-9a-f]{8}-[0-9a-f]{4}-/);

    // --- Persistence --------------------------------------------------------
    // From storage, not from React. A reload discards every bit of client state.
    await page.reload();
    await expect(page.getByText(/Files for/i)).toBeVisible({ timeout: 30_000 });
    await expect(page.locator(`[data-file-name="${FIXTURE.name}"]`)).toBeVisible();

    // --- Access -------------------------------------------------------------
    // The bucket is private, so this is a signed URL. Fetching it through the
    // page's own context proves the object is really retrievable, and checking
    // the bytes proves it is the file that was uploaded rather than an error
    // page with a 200 on it.
    const row = page.locator(`[data-file-name="${FIXTURE.name}"]`);
    const [popup] = await Promise.all([
      page.waitForEvent('popup'),
      row.getByRole('button', { name: /open/i }).click(),
    ]);
    const body = await popup.evaluate(() => document.body.innerText);
    expect(body).toContain('Organisation A note');
    await popup.close();

    // --- Delete, and its persistence ----------------------------------------
    await row.getByRole('button', { name: /remove/i }).click();
    await expect(page.locator(`[data-file-name="${FIXTURE.name}"]`)).toHaveCount(0, { timeout: 30_000 });

    await page.reload();
    await expect(page.getByText(/Files for/i)).toBeVisible({ timeout: 30_000 });
    await expect(page.locator(`[data-file-name="${FIXTURE.name}"]`)).toHaveCount(0);
  });

  test('a viewer may open files but is not offered upload or removal', async ({ page }) => {
    await signIn(page, VIEWER_A);

    // The refusal itself lives in the storage policies and is proved in SQL.
    // What is proved here is that the interface agrees with them rather than
    // offering an action the service is going to reject.
    await expect(page.locator('#organisation-file-input')).toHaveCount(0);
    await expect(page.getByRole('button', { name: /^remove$/i })).toHaveCount(0);
    await expect(page.getByText(/can open files but not add or remove them/i)).toBeVisible();

    // Still organisation A, and still not organisation B's file.
    await expect(page.getByText('organisation-b-confidential.txt')).toHaveCount(0);
  });

  test('an unsupported file type is refused before it reaches storage', async ({ page }) => {
    await signIn(page, OWNER_A);

    // A client-side refusal with a sentence a person can act on. The bucket
    // enforces its own limits regardless; this is the part that explains.
    await page.setInputFiles('#organisation-file-input', {
      name: 'malware.exe',
      mimeType: 'application/x-msdownload',
      buffer: Buffer.from('not really an executable'),
    });
    await expect(page.getByText(/that file type is not accepted here/i)).toBeVisible();
    await expect(page.locator('[data-file-name="malware.exe"]')).toHaveCount(0);
  });
});
