import AxeBuilder from '@axe-core/playwright';
import { expect, test } from './journey';

const blockingImpacts = new Set(['serious', 'critical']);
const representativePaths = ['/', '/services', '/contact'];

for (const path of representativePaths) {
  test(`generated marketing app has no serious or critical WCAG A/AA violations at ${path}`, async ({ page }, testInfo) => {
    await page.goto(path);
    await page.locator('main').waitFor();

    const result = await new AxeBuilder({ page })
      .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'])
      .analyze();

    await testInfo.attach('axe-accessibility-results', {
      body: JSON.stringify(result, null, 2),
      contentType: 'application/json',
    });

    const blocking = result.violations.filter((violation) => violation.impact && blockingImpacts.has(violation.impact));
    expect(blocking, blocking.map((violation) => `${violation.impact}: ${violation.id} — ${violation.help}`).join('\n')).toEqual([]);
  });
}
