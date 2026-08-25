import { expect, test } from '@playwright/test';

const brochure = [
  '# Kelvin Joinery',
  '',
  'Kelvin Joinery is a family joinery workshop in Glasgow.',
  '',
  'Email: hello@kelvinjoinery.example',
  'Phone: 0141 555 0100',
].join('\n');

function manifest(suffix: string) {
  return {
    schemaVersion: 2,
    project: { name: `Sources E2E ${suffix}`, slug: `sources-e2e-${suffix}`, type: 'marketing-site', primaryGoal: 'Prove service-owned source ingestion through the Console.' },
    audience: { summary: 'Factory test users', roles: [] },
    journeys: ['Review the generated product'],
    majorSurfaces: ['Home', 'Contact'],
    entities: [],
    company: {
      identity: { name: `Sources E2E ${suffix}` },
      services: ['Joinery'],
      locations: ['Glasgow'],
      contactDetails: { email: 'sources@example.com' },
      trustSignals: [],
      conversionGoals: ['email'],
    },
    modules: {},
    infrastructure: { backend: 'none', deployment: 'netlify' },
    aiBudget: { mode: 'economy', maxBuildCostGbp: 0 },
    brand: { designControl: 'sensible-defaults' },
    inputs: {
      inventory: [],
      // Recorded during intake but never ingested, so the workspace has to say so.
      sources: [{ id: 'url-existing-site', kind: 'url', label: 'Existing website', uri: 'https://kelvinjoinery.example', provenance: 'user-supplied', instructionAuthority: 'none', publishUseAllowed: false }],
    },
    constraints: {
      hard: [], expectedScale: 'under-1000', sensitivity: 'normal-business-data', tenantModel: '',
      integrations: [], existingData: [], uploadTypes: [], customCapabilities: [], excludedCapabilities: [], unresolvedCapabilities: [],
    },
    outOfScope: [],
  };
}

test('the Console ingests company material through the service and rebuilds when it changes', async ({ page }, testInfo) => {
  test.setTimeout(120_000);

  const suffix = `${testInfo.workerIndex}-${testInfo.retry}`;
  const projectId = `project-sources-e2e-${suffix}`;
  const created = await page.request.post('/api/projects', { data: { id: projectId, manifest: manifest(suffix) } });
  expect(created.status()).toBe(201);

  await page.goto(`/builder/${projectId}`);
  const panel = page.locator('.source-panel');
  await expect(panel.getByText('0 ingested')).toBeVisible();
  await expect(panel.getByText('1 source(s) declared at intake are not ingested yet.')).toBeVisible();

  // The operator declares reuse rights; the factory never assumes them.
  await panel.getByRole('checkbox').check();
  await panel.getByLabel('Add company files').setInputFiles({ name: 'brochure.md', mimeType: 'text/markdown', buffer: Buffer.from(brochure, 'utf8') });

  await expect(panel.getByText('1 ingested')).toBeVisible({ timeout: 30_000 });
  await expect(panel.getByText('brochure.md')).toBeVisible();
  await expect(panel.getByText('approved for use')).toBeVisible();
  await expect(page.getByText('sources · ingested')).toBeVisible();

  await page.getByRole('button', { name: 'Generate project' }).click();
  await expect(page.locator('.state-pill')).toHaveText('generated', { timeout: 60_000 });
  await expect(page.locator('.history-list article.current')).toContainText('Build v1');
  await expect(page.locator('.builder-notice')).toHaveCount(0);

  // Material can still arrive after a build, and the Console has to say the
  // live repository no longer reflects it.
  await panel.getByLabel('Add company files').setInputFiles({ name: 'accreditations.md', mimeType: 'text/markdown', buffer: Buffer.from('# Accreditations\n\nFENSA registered since 2004.', 'utf8') });
  await expect(panel.getByText('2 ingested')).toBeVisible({ timeout: 30_000 });
  await expect(page.locator('.builder-notice')).toContainText('Source material has changed since the last build.');

  await page.getByRole('button', { name: 'Rebuild project' }).click();
  await expect(page.locator('.history-list article.current')).toContainText('Build v2', { timeout: 60_000 });
  await expect(page.locator('.builder-notice')).toHaveCount(0);
  await expect(page.getByRole('alert')).toHaveCount(0);
});
