import AxeBuilder from '@axe-core/playwright';
import { expect, test } from '@playwright/test';

/**
 * The design-inspiration flow, in the real Console against the real service.
 *
 * Deliberately the screenshot path rather than the URL one. Capturing a URL
 * needs the public internet, and a browser test that reaches it would be a test
 * of somebody else's uptime; the URL boundary is proved deterministically in
 * `tooling/visual-reference.test.mjs`, which shows every spelling of a private
 * destination refused before a browser is launched. What this proves is the
 * half only a browser can: that a person can add a reference, read what the
 * factory made of it, approve it, and that the panel they do it in is usable
 * with a keyboard and a screen reader.
 */

const manifest = {
  schemaVersion: 2,
  project: { name: 'Reference E2E', slug: 'reference-e2e', type: 'marketing-site', primaryGoal: 'Prove the design-inspiration flow in the real Console.' },
  audience: { summary: 'Factory test users', roles: [] },
  journeys: ['Supply a design reference', 'Approve its traits'],
  majorSurfaces: ['Home', 'Contact'],
  entities: [],
  company: {
    identity: { name: 'Reference E2E', description: 'A deterministic Builder Console acceptance project.' },
    services: ['Factory generation'],
    locations: ['Glasgow'],
    contactDetails: { email: 'reference@example.com' },
    trustSignals: [],
    conversionGoals: ['email'],
  },
  modules: {},
  infrastructure: { backend: 'none', deployment: 'netlify' },
  aiBudget: { mode: 'economy', maxBuildCostGbp: 0 },
  brand: { designControl: 'sensible-defaults' },
  inputs: { inventory: [], sources: [] },
  constraints: {
    hard: [],
    expectedScale: 'under-1000',
    sensitivity: 'normal-business-data',
    tenantModel: '',
    integrations: [],
    existingData: [],
    uploadTypes: [],
    customCapabilities: [],
    excludedCapabilities: [],
    unresolvedCapabilities: [],
  },
  outOfScope: [],
} as const;

// A 2x2 PNG, written out here rather than fetched, so the fixture carries no
// image belonging to anybody.
const PNG = 'iVBORw0KGgoAAAANSUhEUgAAAAIAAAACCAIAAAD91JpzAAAAF0lEQVR4nGP8//8/AzJgYkAFo3wK+QAtBAMBJU5tvQAAAABJRU5ErkJggg==';

test('a person can show the factory a design they like, and read back what it made of it', async ({ page }, testInfo) => {
  test.setTimeout(120_000);
  const suffix = `${testInfo.workerIndex}-${testInfo.retry}`;
  const projectId = `project-reference-e2e-${suffix}`;
  const projectName = `Reference E2E ${suffix}`;

  const created = await page.request.post('/api/projects', {
    data: { id: projectId, manifest: { ...manifest, project: { ...manifest.project, name: projectName, slug: `reference-e2e-${suffix}` } } },
  });
  expect(created.status()).toBe(201);

  await page.goto('/builder');
  const project = page.locator('.project-tile').filter({ hasText: projectName });
  await project.getByRole('button', { name: /Open workspace/ }).click();
  await expect(page.getByRole('heading', { name: projectName })).toBeVisible();

  const panel = page.getByLabel('Design inspiration');
  await expect(panel).toBeVisible();
  await expect(panel.getByText('none yet')).toBeVisible();

  // The whole optional half is optional: a note and a picture are enough.
  await panel.getByLabel('What do you like about it?').fill('Big type and lots of whitespace, but not the dark palette.');
  await panel.getByRole('button', { name: 'A lot' }).click();
  await panel.locator('input[type=file]').setInputFiles({ name: 'moodboard.png', mimeType: 'image/png', buffer: Buffer.from(PNG, 'base64') });

  const card = panel.locator('.reference-card').first();
  await expect(card).toBeVisible({ timeout: 20_000 });
  await expect(card.getByText('moodboard.png')).toBeVisible();
  await expect(card.getByText('draft', { exact: true })).toBeVisible();

  // What the factory made of the sentence, in the words it will act on, with
  // the phrase it read each one from.
  const traitNames = card.locator('.reference-traits strong');
  await expect(traitNames.filter({ hasText: 'Oversized display typography' })).toHaveCount(1);
  await expect(traitNames.filter({ hasText: 'Generous whitespace' })).toHaveCount(1);
  await expect(traitNames.filter({ hasText: 'Dark full-page ground' })).toHaveCount(1);
  await expect(card.getByText(/from “dark palette”/)).toBeVisible();
  // And the honesty: the dark palette is heard and cannot be acted on, and it
  // says so rather than sitting in the list implying it changed something.
  await expect(card.getByText(/Recorded, and nothing to change/)).toBeVisible();
  await expect(card.getByText(/Nothing here was measured/)).toBeVisible();

  await card.getByRole('button', { name: 'Approve these traits' }).click();
  await expect(card.getByText('approved', { exact: true })).toBeVisible();
  await expect(panel.getByText('1 of 1 in use')).toBeVisible();

  // The influence the build will read, shown as the axes it steers.
  await expect(panel.locator('.reference-influence')).toContainText('visual distinctiveness');
  await expect(panel.locator('.reference-influence')).toContainText('expressive');

  // Reachable with a keyboard. A panel whose only controls are mouse targets is
  // a panel half the people who need it cannot use.
  const useForButton = card.getByRole('button', { name: 'typography' });
  await useForButton.focus();
  await expect(useForButton).toBeFocused();
  await page.keyboard.press('Enter');
  await expect(card.getByRole('button', { name: 'typography' })).toHaveAttribute('aria-pressed', 'true');
  // Narrowing what a reference is for returns it to draft: a build must not
  // inherit traits nobody approved in their current form.
  await expect(card.getByText('draft', { exact: true })).toBeVisible();

  const results = await new AxeBuilder({ page })
    .include('[aria-label="Design inspiration"]')
    .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'])
    .analyze();
  const blocking = results.violations.filter((violation) => violation.impact === 'serious' || violation.impact === 'critical');
  expect(blocking.map((violation) => `${violation.id}: ${violation.help}`)).toEqual([]);

  // And it holds at a phone width, which is where a two-column trait list would
  // otherwise become two unreadable columns.
  await page.setViewportSize({ width: 390, height: 844 });
  await expect(panel).toBeVisible();
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  expect(overflow).toBeLessThanOrEqual(1);

  await card.getByRole('button', { name: 'Remove' }).click();
  await expect(panel.getByText('none yet')).toBeVisible();
});
