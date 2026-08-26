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
  inputs: {
    inventory: ['logo/brand'],
    sources: [{
      id: 'approved-logo',
      kind: 'logo',
      label: 'Approved logo candidate',
      name: 'logo.svg',
      provenance: 'user-supplied',
      purpose: 'brand identity',
      rightsStatus: 'unknown',
      assetStatus: 'suggested',
      sourceRole: 'brand-supporting',
      sourceChannel: 'upload',
      instructionAuthority: 'none',
      publishUseAllowed: false,
      recordedAt: '2026-08-25T00:00:00.000Z',
    }],
  },
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

test('Builder Console drives governed sources, generation, verification and preview through the real service', async ({ page }, testInfo) => {
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
  const sourcePanel = page.getByLabel('Source and asset rights');
  await expect(sourcePanel.getByText('Approved logo candidate')).toBeVisible();
  await expect(sourcePanel.getByText('unknown', { exact: true })).toBeVisible();
  await sourcePanel.getByRole('button', { name: 'Approve use' }).click();
  await expect(sourcePanel.getByText('approved for use', { exact: true })).toBeVisible();
  await expect(sourcePanel.getByText('Publishable', { exact: true })).toBeVisible();
  await expect(page.getByText('source · governance · updated')).toBeVisible();

  await page.getByRole('button', { name: 'Generate project' }).click();
  await expect(page.locator('.state-pill')).toHaveText('generated', { timeout: 30_000 });
  await expect(page.getByRole('button', { name: 'Verify build' })).toBeVisible();
  await expect(page.getByText('composition · materialised')).toBeVisible();
  await expect(page.getByText('3 routes')).toBeVisible();
  await expect(sourcePanel.getByText(/Rights are locked after knowledge ingestion or generation/)).toBeVisible();

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

  // Builder edit mode: click a heading in the live preview, change it, and see
  // the preview update without a rebuild.
  await expect(page.getByText('Click anything in the preview to resolve its element identity')).toBeVisible();
  await preview.contentFrame().getByRole('heading', { level: 1 }).click();
  await expect(page.getByText('Edit content')).toBeVisible();
  await expect(page.getByText('from your Build Contract')).toBeVisible();

  // The selected element resolves to a full identity through the service, not
  // to a guess made from the DOM.
  const identity = page.locator('.element-identity');
  await expect(identity.getByText('hero-section v1.0.0')).toBeVisible();
  await expect(identity.getByText('display', { exact: true })).toBeVisible();
  await expect(identity.getByText('.app-builder/composition.json')).toBeVisible();

  await page.getByLabel('Content value').fill('Painters and decorators');
  await page.getByRole('button', { name: 'Save', exact: true }).click();
  await expect(preview.contentFrame().getByRole('heading', { name: 'Painters and decorators' })).toBeVisible({ timeout: 20_000 });
  await expect(page.getByText('edited by you')).toBeVisible();

  await page.getByRole('button', { name: 'Revert to generated' }).click();
  await expect(preview.contentFrame().getByRole('heading', { name: 'Workspace E2E', exact: true })).toBeVisible({ timeout: 20_000 });

  // Presentation: the same section, shown a different way. The choice is
  // recorded and the section recomposed — nothing mutates the DOM — and the
  // preview picks it up without a rebuild.
  await preview.contentFrame().locator('#page-home-services h2').click();
  const presentation = page.getByLabel('Section presentation');
  await expect(presentation.getByText('item-grid-section')).toBeVisible();
  await expect(preview.contentFrame().locator('#page-home-services ul.plain-list')).toBeVisible();
  await expect(preview.contentFrame().locator('#page-home-services ul.feature-list')).toHaveCount(0);

  await presentation.getByRole('button', { name: /Feature columns/ }).click();
  await expect(preview.contentFrame().locator('#page-home-services ul.feature-list')).toBeVisible({ timeout: 20_000 });
  await expect(preview.contentFrame().locator('#page-home-services ul.plain-list')).toHaveCount(0);
  await expect(page.getByText('section · variant · chosen')).toBeVisible();

  await presentation.getByRole('button', { name: /as composed/ }).click();
  await expect(preview.contentFrame().locator('#page-home-services ul.plain-list')).toBeVisible({ timeout: 20_000 });

  // An element that resolves but exposes no editable property is inspectable
  // and explicitly not editable: no textarea appears for it.
  await preview.contentFrame().locator('.hero-section a.primary-action').click();
  await expect(page.getByText('Selected element')).toBeVisible();
  await expect(page.getByText('This element resolves, but the template declares no editable property for it yet.')).toBeVisible();
  await expect(page.getByLabel('Content value')).toHaveCount(0);
  await page.getByRole('button', { name: 'Close' }).click();

  // Rendered evidence: capture what the build actually renders, from the same
  // preview that was just reviewed.
  const evidencePanel = page.getByLabel('Rendered evidence');
  await evidencePanel.getByRole('button', { name: 'Capture evidence' }).click();
  await expect(page.getByText('evidence · captured')).toBeVisible({ timeout: 90_000 });
  await expect(evidencePanel.getByText('9 captures')).toBeVisible();
  await expect(evidencePanel.getByRole('img').first()).toBeVisible();

  // Every viewport is captured, and the panel says what these pictures are not
  // evidence of rather than implying full coverage.
  for (const viewportName of ['desktop', 'tablet', 'mobile']) {
    await evidencePanel.getByRole('group', { name: 'Evidence viewport' }).getByRole('button', { name: viewportName }).click();
    await expect(evidencePanel.getByRole('img')).toHaveCount(3);
  }
  await expect(evidencePanel.getByText(/state\(s\) these captures do not claim/)).toBeVisible();

  await page.getByRole('button', { name: 'Stop preview' }).click();
  await expect(page.getByText('preview · stopped')).toBeVisible();
  // 11 build/quality/preview events, one source governance decision, the save
  // and revert of one content edit, the choice and clearing of one section
  // presentation, and the start and completion of one evidence capture.
  await expect(page.getByLabel('Project metrics').getByText('18', { exact: true })).toBeVisible();
  await expect(page.getByRole('alert')).toHaveCount(0);
});
