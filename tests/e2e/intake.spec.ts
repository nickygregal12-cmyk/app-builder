import { readFile } from 'node:fs/promises';
import { expect, test } from '@playwright/test';

async function continueStep(page: import('@playwright/test').Page) {
  await page.getByRole('button', { name: /Continue|Add source material/ }).click();
}

test('marketing-site intake reaches an approved portable manifest and resumes after reload', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('button', { name: /Quick/ }).click();
  await page.getByRole('button', { name: /Start intake/ }).click();

  await page.getByRole('textbox', { name: 'What should this project be called?' }).fill('North Star Roofing');
  await continueStep(page);
  await page.getByRole('textbox', { name: 'What is the single most important outcome?' }).fill('Generate qualified roofing enquiries');
  await continueStep(page);
  await page.getByRole('textbox', { name: 'Who is it for?' }).fill('Homeowners in Glasgow');
  await continueStep(page);
  const journeys = page.getByRole('textbox', { name: 'What must V1 let users do?' });
  await journeys.click();
  // Typed, not pasted: a per-keystroke trim used to delete the space as soon as it was pressed.
  await journeys.pressSequentially('Understand roof repair services');
  await journeys.press('Enter');
  await journeys.pressSequentially('Request a fixed price quote');
  await expect(journeys).toHaveValue('Understand roof repair services\nRequest a fixed price quote');
  await continueStep(page);

  await expect(page.getByRole('heading', { name: 'How much should the factory decide?' })).toBeVisible();
  await continueStep(page);
  await expect(page.getByRole('heading', { name: 'Optimise external running costs for' })).toBeVisible();
  await continueStep(page);

  await page.getByRole('textbox', { name: 'Company name' }).fill('North Star Roofing');
  await page.getByRole('textbox', { name: 'Company description' }).fill('Residential roofing and repair company.');
  await continueStep(page);
  const services = page.getByRole('textbox', { name: 'What services/products should the site present?' });
  await services.click();
  await services.pressSequentially('Emergency roof repairs');
  await services.press('Enter');
  await services.press('Enter');
  await services.pressSequentially('New pitched roofs ');
  await expect(services).toHaveValue('Emergency roof repairs\n\nNew pitched roofs ');
  await continueStep(page);
  await expect(page.getByRole('heading', { name: 'What should visitors do next?' })).toBeVisible();
  await continueStep(page);

  await expect(page.getByRole('heading', { name: 'Record what the build can rely on.' })).toBeVisible();
  await page.getByRole('textbox', { name: 'Source URL' }).fill('https://example.com');
  await page.getByRole('button', { name: 'Add URL source' }).click();
  await page.getByLabel('Add source files').setInputFiles({ name: 'logo.png', mimeType: 'image/png', buffer: Buffer.from('fake-image') });
  await expect(page.getByText('logo.png', { exact: true })).toBeVisible();
  await page.getByRole('button', { name: /Review Build Contract/ }).click();

  await expect(page.getByText('Ready for approval')).toBeVisible();
  await expect(page.getByText('Existing website', { exact: true })).toBeVisible();
  await expect(page.getByRole('listitem').filter({ hasText: 'Understand roof repair services' })).toHaveCount(1);
  await expect(page.getByRole('listitem').filter({ hasText: 'Request a fixed price quote' })).toHaveCount(1);
  await page.getByRole('button', { name: /Approve Build Contract/ }).click();
  await expect(page.getByRole('heading', { name: /North Star Roofing is ready for deterministic generation/ })).toBeVisible();
  await expect(page.getByRole('button', { name: /Download intake bundle/ })).toBeVisible();

  const download = await Promise.all([
    page.waitForEvent('download'),
    page.getByRole('button', { name: /Download intake bundle/ }).click(),
  ]).then(([event]) => event);
  const bundle = JSON.parse(await readFile(await download.path(), 'utf8'));
  expect(bundle.buildContract.coreJourneys).toContain('Understand roof repair services');
  expect(bundle.buildContract.coreJourneys).toContain('Request a fixed price quote');
  expect(bundle.projectManifest.journeys).toContain('Request a fixed price quote');
  // Blank lines and the trailing space survive typing but never reach the durable contract.
  expect(bundle.session.answers.services).toEqual(['Emergency roof repairs', 'New pitched roofs']);

  await page.getByRole('textbox', { name: 'Intake learning' }).fill('Ask whether emergency call-outs are offered.');
  await page.getByRole('button', { name: 'Add evidence' }).click();
  await expect(page.getByText('evidence records in this intake')).toBeVisible();

  await page.waitForTimeout(100);
  await page.reload();
  await page.getByRole('button', { name: /Resume saved intake/ }).click();
  await expect(page.getByRole('heading', { name: /North Star Roofing is ready for deterministic generation/ })).toBeVisible();
});
