import { expect, test } from '@playwright/test';

const manifest = {
  schemaVersion: 2,
  project: { name: 'Workspace E2E', slug: 'workspace-e2e', type: 'marketing-site', primaryGoal: 'Prove the real Builder workspace lifecycle.' },
  audience: { summary: 'Factory test users', roles: [] },
  journeys: ['Review the generated product', 'Verify the build', 'Launch a preview'],
  majorSurfaces: ['Home', 'Services', 'Contact'],
  entities: [],
  company: {
    identity: { name: 'Workspace E2E', description: 'A deterministic Builder Console acceptance project.' },
    services: ['Factory generation', 'Build verification'],
    locations: ['Glasgow'],
    contactDetails: { email: 'workspace@example.com' },
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

test('Builder Console drives a real service generation, verification and preview lifecycle', async ({ page }, testInfo) => {
  test.setTimeout(120_000);

  // Playwright retries share the same service process. Give each attempt a
  // unique durable project/workspace so a failed first attempt cannot poison
  // the retry with an already-materialised repository or ambiguous project tile.
  const suffix = `${testInfo.workerIndex}-${testInfo.retry}`;
  const projectId = `project-workspace-e2e-${suffix}`;
  const projectName = `Workspace E2E ${suffix}`;
  const projectManifest = {
    ...manifest,
    project: { ...manifest.project, name: projectName, slug: `workspace-e2e-${suffix}` },
  };

  const created = await page.request.post('/api/projects', { data: { id: projectId, manifest: projectManifest } });
  expect(created.status()).toBe(201);

  await page.goto('/builder');
  await expect(page.getByRole('heading', { name: 'Projects become durable factory work.' })).toBeVisible();
  const project = page.locator('.project-tile').filter({ hasText: projectName });
  await expect(project.getByText('ready', { exact: true })).toBeVisible();
  await project.getByRole('button', { name: /Open workspace/ }).click();

  await expect(page.getByRole('heading', { name: projectName })).toBeVisible();
  await expect(page.getByText('£0.00')).toBeVisible();
  await page.getByRole('button', { name: 'Generate project' }).click();
  await expect(page.locator('.state-pill')).toHaveText('generated', { timeout: 30_000 });
  await expect(page.getByRole('button', { name: 'Verify build' })).toBeVisible();
  await expect(page.getByText('composition · materialised')).toBeVisible();
  await expect(page.getByText('3 routes')).toBeVisible();

  await page.getByRole('button', { name: 'Verify build' }).click();
  await expect(page.locator('.state-pill')).toHaveText('verified', { timeout: 60_000 });
  await expect(page.getByText('quality · build · succeeded')).toBeVisible();
  await expect(page.getByText('Dependencies installed')).toBeVisible();

  await page.getByRole('button', { name: 'Start preview' }).click();
  await expect(page.getByRole('button', { name: 'Stop preview' })).toBeVisible({ timeout: 20_000 });
  const preview = page.getByTitle(`${projectName} preview`);
  await expect(preview).toBeVisible();
  await expect(preview.contentFrame().getByRole('heading', { name: 'Workspace E2E' })).toBeVisible({ timeout: 20_000 });

  await page.getByRole('button', { name: 'mobile' }).click();
  await expect(page.locator('.preview-canvas')).toHaveClass(/preview-mobile/);
  await expect(preview).toHaveCSS('width', '390px');

  await page.getByRole('button', { name: 'Stop preview' }).click();
  await expect(page.getByText('preview · stopped')).toBeVisible();
  await expect(page.getByLabel('Project metrics').getByText('11', { exact: true })).toBeVisible();
  await expect(page.getByRole('alert')).toHaveCount(0);
});
