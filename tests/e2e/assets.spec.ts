import { expect, test } from '@playwright/test';

const photo = Buffer.from(
  '<svg xmlns="http://www.w3.org/2000/svg" width="1600" height="900"><rect width="1600" height="900" fill="#2f5d3a"/><text x="80" y="480" font-size="90" fill="#ffffff">Recent work</text></svg>',
  'utf8',
);

function manifest(suffix: string) {
  return {
    schemaVersion: 2,
    project: { name: `Assets E2E ${suffix}`, slug: `assets-e2e-${suffix}`, type: 'marketing-site', primaryGoal: 'Prove a photograph needs its own publication decision.' },
    audience: { summary: 'Factory test users', roles: [] },
    journeys: ['Review the generated product'],
    majorSurfaces: ['Home', 'Work', 'Contact'],
    entities: [],
    company: {
      identity: { name: `Assets E2E ${suffix}` },
      services: ['Joinery'],
      locations: ['Glasgow'],
      contactDetails: { email: 'assets@example.com' },
      trustSignals: [],
      conversionGoals: ['email'],
    },
    modules: {},
    infrastructure: { backend: 'none', deployment: 'netlify' },
    aiBudget: { mode: 'economy', maxBuildCostGbp: 0 },
    brand: { designControl: 'sensible-defaults' },
    inputs: { inventory: [], sources: [] },
    constraints: {
      hard: [], expectedScale: 'under-1000', sensitivity: 'normal-business-data', tenantModel: '',
      integrations: [], existingData: [], uploadTypes: [], customCapabilities: [], excludedCapabilities: [], unresolvedCapabilities: [],
    },
    outOfScope: [],
  };
}

test('an ingested photograph needs its own decision before the factory will publish it', async ({ page }, testInfo) => {
  test.setTimeout(120_000);

  const suffix = `${testInfo.workerIndex}-${testInfo.retry}`;
  const projectId = `project-assets-e2e-${suffix}`;
  const created = await page.request.post('/api/projects', { data: { id: projectId, manifest: manifest(suffix) } });
  expect(created.status()).toBe(201);

  await page.goto(`/builder/${projectId}`);
  const assets = page.getByLabel('Assets and publication rights');
  await expect(assets.getByText('Ingest company images to decide what may be published.')).toBeVisible();

  // Ingested without declaring reuse rights: the factory has the picture and no
  // permission to publish it.
  await page.locator('.source-panel').getByLabel('Add company files').setInputFiles({ name: 'work.svg', mimeType: 'image/svg+xml', buffer: photo });
  await expect(page.locator('.source-panel').getByText('1 ingested')).toBeVisible({ timeout: 30_000 });

  await expect(assets.getByText('0/1 publishable')).toBeVisible();
  const item = assets.locator('.asset-item').first();
  await expect(item.getByText('no decision yet')).toBeVisible();
  await expect(item.getByText('1600×900')).toBeVisible();
  await expect(item.getByText(/generated crop/)).toContainText('withheld until reviewed');

  // Approving it is an explicit statement about this asset, not a side effect
  // of having uploaded it.
  await item.getByRole('button', { name: 'Approve — we own this' }).click();
  await expect(assets.getByText('1/1 publishable')).toBeVisible({ timeout: 15_000 });
  await expect(item.getByText('decided approve')).toBeVisible();
  await expect(page.getByText('asset · governance · updated')).toBeVisible();

  // Saying where the subject is recomputes the crops around it. It does not
  // publish them: agreeing with the result is a separate judgement.
  await expect(item.getByText('Crops chosen by the attention heuristic')).toBeVisible();
  const picker = item.getByRole('button', { name: /Set the focal point/ });
  await expect(picker.locator('img')).toBeVisible();
  const box = await picker.boundingBox();
  expect(box).not.toBeNull();
  await picker.click({ position: { x: (box?.width ?? 100) * 0.25, y: (box?.height ?? 60) * 0.2 } });
  await expect(item.getByText(/Focal point \d+% \/ \d+%/)).toBeVisible({ timeout: 20_000 });
  await expect(item.getByText(/generated crop/)).toContainText('withheld until reviewed');

  await item.getByRole('button', { name: 'Approve crops' }).click();
  await expect(item.getByText(/generated crop/)).toContainText('approved, will publish', { timeout: 20_000 });

  // Replacing the picture: new bytes are a new asset, so the old one retires
  // and the new one carries its own declaration rather than inheriting one.
  const replacement = Buffer.from(
    '<svg xmlns="http://www.w3.org/2000/svg" width="1600" height="900"><rect width="1600" height="900" fill="#5d2f3a"/><text x="80" y="480" font-size="90" fill="#ffffff">Better work</text></svg>',
    'utf8',
  );
  await item.getByLabel(/^Replace /).setInputFiles({ name: 'better.svg', mimeType: 'image/svg+xml', buffer: replacement });
  await expect(assets.getByText('1/2 publishable')).toBeVisible({ timeout: 30_000 });
  await expect(assets.getByText('Replaced by a newer picture.')).toBeVisible();
  await expect(assets.getByText('Replaced an earlier picture.')).toBeVisible();
  const survivor = assets.locator('.asset-item').filter({ hasText: 'Replaced an earlier picture.' });
  await expect(survivor.getByText(/generated crop/)).toContainText('withheld until reviewed');

  await page.getByRole('button', { name: 'Generate project' }).click();
  await expect(page.locator('.state-pill')).toHaveText('generated', { timeout: 60_000 });
  await expect(page.locator('.builder-notice')).toHaveCount(0);

  // A decision made after a build leaves the live repository behind, exactly as
  // new source material does.
  await survivor.getByRole('button', { name: 'Do not use' }).click();
  await expect(page.locator('.builder-notice')).toContainText('Asset decisions have changed since the last build.', { timeout: 15_000 });
  await expect(assets.getByText('0/2 publishable')).toBeVisible();

  await page.getByRole('button', { name: 'Rebuild project' }).click();
  await expect(page.locator('.history-list article.current')).toContainText('Build v2', { timeout: 60_000 });
  await expect(page.locator('.builder-notice')).toHaveCount(0);
  await expect(page.getByRole('alert')).toHaveCount(0);
});
