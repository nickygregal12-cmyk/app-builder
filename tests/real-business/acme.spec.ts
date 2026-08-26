import { expect, test } from '@playwright/test';

test('Acme source pack becomes a navigable source-backed standalone website', async ({ page }) => {
  await page.goto('/');

  const hero = page.locator('[data-section-id="page-home-hero"]');
  await expect(hero.getByRole('heading', { level: 1, name: 'Acme Ltd' })).toBeVisible();
  await expect(hero.getByRole('heading', { level: 1 })).toHaveAttribute('data-binding-origin', 'knowledge-fact');
  await expect(hero.getByRole('heading', { level: 1 })).toHaveAttribute('data-generated', 'false');

  await expect(page.getByRole('heading', { name: 'Services', exact: true }).first()).toBeVisible();
  await expect(page.getByText('Home survey', { exact: true }).first()).toBeVisible();
  await expect(page.getByText('Retrofit installation', { exact: true }).first()).toBeVisible();

  // An entity's own sentence renders as a sentence. A field name reaching a
  // client's website ("description: ...") is a defect, not a label.
  await expect(page.getByText('A whole-house assessment before any work starts.', { exact: true }).first()).toBeVisible();
  await expect(page.getByText(/description:/i)).toHaveCount(0);

  await expect(page.getByText('Clear and reliable', { exact: true }).first()).toBeVisible();
  await expect(page.getByText('Example Quality Scheme', { exact: true }).first()).toBeVisible();
  await expect(page.getByText('Glasgow', { exact: true }).first()).toBeVisible();
  await expect(page.getByText('Renfrewshire', { exact: true }).first()).toBeVisible();
  await expect(page.getByText('hello@acme.example', { exact: true }).first()).toBeVisible();
  await expect(page.getByText('0141 555 0101', { exact: true }).first()).toBeVisible();
  await expect(page.getByText('1 High Street, Glasgow', { exact: true }).first()).toBeVisible();

  const contactEmail = page.locator('[data-binding-origin="knowledge-fact"]').filter({ hasText: 'hello@acme.example' }).first();
  await expect(contactEmail).toBeVisible();

  await page.getByRole('navigation', { name: 'Primary navigation' }).getByRole('link', { name: 'Services', exact: true }).click();
  await expect(page).toHaveURL(/\/services$/);
  await expect(page.locator('[data-page-id="page-services"]')).toBeVisible();
  await expect(page.getByText('Home survey', { exact: true }).first()).toBeVisible();
  await expect(page.getByText('Retrofit installation', { exact: true }).first()).toBeVisible();

  await page.getByRole('navigation', { name: 'Primary navigation' }).getByRole('link', { name: 'Contact', exact: true }).click();
  await expect(page).toHaveURL(/\/contact$/);
  await expect(page.getByText('hello@acme.example', { exact: true }).first()).toBeVisible();
});

test.describe('on a phone', () => {
  test.use({ viewport: { width: 390, height: 844 } });

  test('navigation is a menu rather than four rows of wrapped pills', async ({ page }) => {
    await page.goto('/');
    const nav = page.getByRole('navigation', { name: 'Primary navigation' });
    const toggle = page.getByRole('button', { name: 'Menu' });

    await expect(toggle).toBeVisible();
    await expect(toggle).toHaveAttribute('aria-expanded', 'false');
    await expect(nav).toBeHidden();

    await toggle.click();
    await expect(nav).toBeVisible();
    await expect(page.getByRole('button', { name: 'Close' })).toHaveAttribute('aria-expanded', 'true');

    // Following a link closes the menu rather than leaving it covering the page.
    await nav.getByRole('link', { name: 'Services', exact: true }).click();
    await expect(page).toHaveURL(/\/services$/);
    await expect(nav).toBeHidden();
  });
});

test.describe('on a wide screen', () => {
  test('the navigation stays a single visible row with no toggle', async ({ page }) => {
    await page.goto('/');
    await expect(page.getByRole('navigation', { name: 'Primary navigation' })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Menu' })).toBeHidden();
  });
});
