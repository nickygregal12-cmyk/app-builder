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
