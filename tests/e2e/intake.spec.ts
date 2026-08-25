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
  await page.getByRole('textbox', { name: 'What must V1 let users do?' }).fill('Understand services\nRequest a quote');
  await continueStep(page);

  await expect(page.getByRole('heading', { name: 'How much should the factory decide?' })).toBeVisible();
  await continueStep(page);
  await expect(page.getByRole('heading', { name: 'Optimise external running costs for' })).toBeVisible();
  await continueStep(page);

  await page.getByRole('textbox', { name: 'Company name' }).fill('North Star Roofing');
  await page.getByRole('textbox', { name: 'Company description' }).fill('Residential roofing and repair company.');
  await continueStep(page);
  await page.getByRole('textbox', { name: 'What services/products should the site present?' }).fill('Roof repairs\nNew roofs');
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
  await page.getByRole('button', { name: /Approve Build Contract/ }).click();
  await expect(page.getByRole('heading', { name: /North Star Roofing is ready for deterministic generation/ })).toBeVisible();
  await expect(page.getByRole('button', { name: /Download intake bundle/ })).toBeVisible();

  await page.getByRole('textbox', { name: 'Intake learning' }).fill('Ask whether emergency call-outs are offered.');
  await page.getByRole('button', { name: 'Add evidence' }).click();
  await expect(page.getByText('evidence records in this intake')).toBeVisible();

  await page.waitForTimeout(100);
  await page.reload();
  await page.getByRole('button', { name: /Resume saved intake/ }).click();
  await expect(page.getByRole('heading', { name: /North Star Roofing is ready for deterministic generation/ })).toBeVisible();
});
