import { readFile } from 'node:fs/promises';
import { expect, test } from '@playwright/test';

const NBM_BUNDLE = 'examples/genuine-business/nbm-approved-intake.v1.json';

// The value of a durable approved intake is that a rerun costs no re-keying.
// That is only true if the operator can actually do it in the product, so this
// drives the supported Console path rather than the service API.
test('an approved intake replays into a fresh run without re-keying the questionnaire', async ({ page }) => {
  await page.goto('/builder');
  await expect(page.getByRole('heading', { name: 'Projects become durable factory work.' })).toBeVisible();

  await page.getByLabel('Replay approved intake bundle').setInputFiles(NBM_BUNDLE);

  // What is being reused is shown before anything is spent.
  await expect(page.getByText('Reusing approved intake')).toBeVisible({ timeout: 30_000 });
  const summary = page.locator('.replay-summary');
  await expect(summary.getByRole('heading', { name: 'nbm Construction Cost Consultants' })).toBeVisible();
  await expect(summary).toContainText('questionnaire 1.3.0');
  await expect(summary).toContainText('accepted defaults');
  await expect(summary).toContainText('2 source references');
  await expect(summary).toContainText('the build, evidence and checkpoints are new');
  // A clean replay against the current questionnaire reports no drift at all.
  await expect(page.locator('.replay-drift')).toHaveCount(0);

  await page.getByRole('button', { name: /Open the replayed project/ }).click();
  await expect(page.getByRole('heading', { name: 'nbm Construction Cost Consultants', exact: true })).toBeVisible();
  // A fresh run: the approved decisions came across, nothing generated did.
  await expect(page.locator('.state-pill')).toHaveText('ready');
  await expect(page.getByRole('button', { name: 'Generate project' })).toBeVisible();
  await expect(page.getByText('Generate the product foundation.')).toBeVisible();
});

test('a bundle this factory can no longer honour is refused, not coerced', async ({ page }) => {
  await page.goto('/builder');
  const approved = JSON.parse(await readFile(NBM_BUNDLE, 'utf8'));
  const drifted = { ...approved, questionnaire: { ...approved.questionnaire, version: '0.9.0' } };

  const refused = await page.request.post('/api/intake-bundles/replay', { data: { bundle: drifted } });
  expect(refused.status()).toBe(400);
  expect(await refused.text()).toContain('Re-approve the intake');
});
