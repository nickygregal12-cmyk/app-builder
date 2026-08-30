import { type Browser, type Page } from '@playwright/test';
import { expect, test } from './journey';

/**
 * In-app notifications, driven through the generated application against a real
 * Supabase stack.
 *
 * The security boundary is proved in SQL, where a cross-recipient read can be
 * attempted directly. What this proves is the half SQL cannot reach: that a
 * genuine product action taken by one person, through the real interface,
 * produces something the RIGHT colleague sees on a surface they can find — and
 * that the read state is in the database rather than in React, because a reload
 * discards every bit of client state.
 *
 * Three independent browser contexts, because the whole point is that these are
 * three different people. A single context with a sign-out between identities
 * would prove the same thing more slowly and would depend on a sign-out control
 * the generated shell does not have.
 *
 * There is deliberately no attempt to forge a notification from the browser.
 * Forgery is refused by a withheld privilege, so attempting it here would mean
 * building an interface control that does not and should not exist; that
 * attempt belongs in the SQL suite, and it is there.
 */

const OWNER_A = { email: 'owner-a@test.local', password: 'records-journey-owner-a' };
const MEMBER_A = { email: 'member-a@test.local', password: 'records-journey-member-a' };
const OWNER_B = { email: 'owner-b@test.local', password: 'records-journey-owner-b' };

/** A uuid anywhere in the product surface would be an implementation detail on screen. */
const UUID_ANYWHERE = /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i;

async function signInAt(page: Page, path: string, credentials: { email: string; password: string }) {
  await page.goto(path);
  await page.getByLabel(/email/i).fill(credentials.email);
  await page.getByLabel(/password/i).fill(credentials.password);
  await page.getByRole('button', { name: /sign in/i }).click();
}

async function openNotifications(browser: Browser, credentials: { email: string; password: string }) {
  const context = await browser.newContext();
  const page = await context.newPage();
  await signInAt(page, '/dashboard', credentials);
  await expect(page.getByText(/Notifications for/i)).toBeVisible({ timeout: 30_000 });
  return { context, page };
}

test.describe('organisation notifications', () => {
  test('a real application action notifies the right colleague, and the read state survives a reload', async ({ browser }) => {
    const stamp = Date.now();
    const recordTitle = `Notification journey ${stamp}`;
    const reference = `REC-NOTIFY-${stamp}`;
    const notificationTitle = `New record: ${recordTitle}`;

    // --- The recipient, before anything happens ------------------------------
    const recipient = await openNotifications(browser, OWNER_A);
    await expect(recipient.page.getByText('Notifications for')).toContainText('Organisation A');
    await expect(recipient.page.getByText(notificationTitle)).toHaveCount(0);

    // --- A genuine application action, taken by somebody else ----------------
    // Not a seeded row and not an API call: a contributor fills in the records
    // form on the workspace surface and saves it. Everything below follows from
    // that one act.
    const actor = await browser.newContext();
    const actorPage = await actor.newPage();
    await signInAt(actorPage, '/workspace', MEMBER_A);
    await expect(actorPage.getByText(/Records for/i)).toBeVisible({ timeout: 30_000 });
    await actorPage.getByLabel(/reference/i).first().fill(reference);
    await actorPage.getByLabel(/title/i).first().fill(recordTitle);
    await actorPage.getByLabel(/summary/i).first().fill('Created to raise a notification.');
    await actorPage.getByRole('button', { name: /add record/i }).click();
    await expect(actorPage.locator(`[data-record-reference="${reference}"]`)).toBeVisible({ timeout: 30_000 });

    // --- The recipient sees it, unread ---------------------------------------
    // A reload rather than a live update, and the test says so rather than
    // waiting hopefully: this capability makes no realtime claim.
    await recipient.page.reload();
    await expect(recipient.page.getByText(/Notifications for/i)).toBeVisible({ timeout: 30_000 });

    const card = recipient.page.locator('.notification-card', { hasText: notificationTitle });
    await expect(card).toBeVisible({ timeout: 30_000 });
    await expect(card).toHaveAttribute('data-notification-state', 'unread');

    // Useful content, and nothing else. The record's own reference is a thing a
    // person quotes; the row's uuid, the recipient's uuid and the organisation's
    // are not, and none of them is on screen.
    await expect(card).toContainText(recordTitle);
    await expect(card).toContainText(reference);
    await expect(card).toContainText(/Unread/i);
    await expect(card).toContainText(/just now|minute|hour/i);
    expect(await card.innerText()).not.toMatch(UUID_ANYWHERE);
    // The surface says how much is waiting, which is the reason to open it.
    await expect(recipient.page.locator('.notifications-context')).toContainText(/\d+ unread/);

    // --- The person who did it is not told about it --------------------------
    // Their own surface still works — the seeded record raised a notification
    // for them — so this is the absence of one particular notification rather
    // than the absence of the capability.
    await actorPage.goto('/dashboard');
    await expect(actorPage.getByText(/Notifications for/i)).toBeVisible({ timeout: 30_000 });
    await expect(actorPage.locator('.notification-card').first()).toBeVisible({ timeout: 30_000 });
    await expect(actorPage.getByText(notificationTitle)).toHaveCount(0);

    // --- Another organisation sees nothing of it -----------------------------
    // Organisation B has one member who has raised nothing, so this doubles as
    // the empty state: the surface says what it is for rather than rendering an
    // empty list that looks broken.
    const outsider = await openNotifications(browser, OWNER_B);
    await expect(outsider.page.getByText('Notifications for')).toContainText('Organisation B');
    await expect(outsider.page.getByText(notificationTitle)).toHaveCount(0);
    await expect(outsider.page.getByText(/Nothing to catch up on/i)).toBeVisible();
    await outsider.context.close();

    // --- Mark read, and prove the state is in the database -------------------
    await card.getByRole('button', { name: /mark read/i }).click();
    await expect(card).toHaveAttribute('data-notification-state', 'read', { timeout: 30_000 });
    await expect(card.getByRole('button', { name: /mark read/i })).toHaveCount(0);

    await recipient.page.reload();
    await expect(recipient.page.getByText(/Notifications for/i)).toBeVisible({ timeout: 30_000 });
    const reloaded = recipient.page.locator('.notification-card', { hasText: notificationTitle });
    await expect(reloaded).toBeVisible();
    await expect(reloaded).toHaveAttribute('data-notification-state', 'read');
    await expect(reloaded).not.toContainText(/Unread/i);

    await actor.close();
    await recipient.context.close();
  });
});
